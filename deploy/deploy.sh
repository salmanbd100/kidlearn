#!/usr/bin/env bash
# Deploys one environment's API stack. Runs ON THE BOX, as root.
#
#   /opt/kidlearn/deploy/deploy.sh prod <image-tag>
#   /opt/kidlearn/deploy/deploy.sh dev  <image-tag>
#
# <image-tag> is the bare commit SHA both images were built and pushed under.
# Both images are environment-agnostic — configured entirely at runtime — so one
# tag serves both environments and a rollback is the same command with an older
# SHA. File 38a turns this into a GitHub Actions workflow; until then it is run
# by hand through `aws ssm start-session`, deliberately: an automated pipeline for
# a deploy nobody has performed manually is a pipeline that fails on something the
# author never saw.
#
# What this does NOT do: apply migrations. That is a separate, deliberate step —
# see MIGRATIONS at the bottom — because a schema change should never ride along
# with a container restart unnoticed.

set -euo pipefail

ENV_NAME="${1:-}"
IMAGE_TAG="${2:-}"

if [[ "${ENV_NAME}" != "prod" && "${ENV_NAME}" != "dev" ]]; then
  echo "usage: $0 <prod|dev> <image-tag>" >&2
  exit 64
fi
if [[ -z "${IMAGE_TAG}" ]]; then
  echo "usage: $0 ${ENV_NAME} <image-tag>   (the bare commit SHA)" >&2
  exit 64
fi

AWS_REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --region "${AWS_REGION}" --query Account --output text)"
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ENV_DIR="/opt/kidlearn/${ENV_NAME}"
COMPOSE_DIR="/opt/kidlearn/deploy/app"
PROJECT="kidlearn-${ENV_NAME}"

log() { echo "[deploy:${ENV_NAME}] $*"; }

# --- 1. Secrets: SSM Parameter Store → the env file -------------------------
# Every value is a SecureString under /kidlearn/<env>/. Written root-owned and
# mode 0600, and umask is set BEFORE the file is created rather than chmod'd
# after — otherwise the secrets are world-readable for the length of the write.
log "fetching /kidlearn/${ENV_NAME}/ from SSM Parameter Store"
umask 077
TMP_ENV="$(mktemp "${ENV_DIR}/app.env.XXXXXX")"
trap 'rm -f "${TMP_ENV}"' EXIT

aws ssm get-parameters-by-path \
  --path "/kidlearn/${ENV_NAME}/" \
  --with-decryption \
  --recursive \
  --region "${AWS_REGION}" \
  --query 'Parameters[].[Name,Value]' \
  --output text |
  while IFS=$'\t' read -r name value; do
    # `$` IS DOUBLED BECAUSE COMPOSE INTERPOLATES env_file, and that is not
    # obvious from either end. A value of `s3cr$tastic` reaches the process as
    # `s3cr`; `abc${NOPE}def` reaches it as `abcdef`. Measured, both ways.
    #
    # The failure that makes it worth the expansion: the container still starts,
    # and the health gate below polls /health, which is DB-free — so a truncated
    # DATABASE_URL password deploys "successfully" and every query then fails
    # authentication. The base64 secrets are safe by accident; a Supabase or
    # Google credential pasted in later is not.
    printf '%s=%s\n' "${name##*/}" "${value//\$/\$\$}"
  done >"${TMP_ENV}"

if [[ ! -s "${TMP_ENV}" ]]; then
  echo "no parameters found under /kidlearn/${ENV_NAME}/ — refusing to deploy" >&2
  exit 1
fi

install -m 0600 -o root -g root "${TMP_ENV}" "${ENV_DIR}/app.env"
log "wrote ${ENV_DIR}/app.env ($(wc -l <"${ENV_DIR}/app.env") variables)"

# --- 1b. The Compose INTERPOLATION file -------------------------------------
# Two different jobs, deliberately two different files. app.env above is handed
# to the container as `env_file:`; this one supplies the `${...}` substitutions
# the Compose files themselves contain, and never reaches a process.
#
# It exists so that the hand-run commands work. `docker compose` with no
# --env-file has no ENV_NAME, ECR_REGISTRY or IMAGE_TAG, so `container_name:
# ${ENV_NAME}-migrate` becomes `-migrate` and `env_file: /opt/kidlearn//app.env`
# does not exist — the migration and wipe-and-reseed procedures in
# document/runbook.md both failed that way before this file existed. Exporting
# these into deploy.sh's own shell was not enough: that process is gone by the
# time anyone runs a migration.
#
# Same `$$` escaping as app.env — --env-file is interpolated too, and `$$`
# round-trips to a literal `$`. Measured.
#
# 0600 root: for dev it carries POSTGRES_PASSWORD.
COMPOSE_ENV="${ENV_DIR}/compose.env"
TMP_COMPOSE_ENV="$(mktemp "${ENV_DIR}/compose.env.XXXXXX")"
trap 'rm -f "${TMP_ENV}" "${TMP_COMPOSE_ENV}"' EXIT

{
  printf 'ENV_NAME=%s\n' "${ENV_NAME}"
  printf 'ECR_REGISTRY=%s\n' "${ECR_REGISTRY}"
  printf 'IMAGE_TAG=%s\n' "${IMAGE_TAG}"
  if [[ "${ENV_NAME}" == "dev" ]]; then
    printf 'LOG_LEVEL=debug\nENABLE_API_DOCS=true\n'
    printf 'AI_TEXT_JOBS_PER_DAY=4\nAI_AUDIO_JOBS_PER_DAY=20\nAI_IMAGE_JOBS_PER_DAY=5\n'
    # Copied through already-escaped rather than re-read and re-escaped, so the
    # dev-postgres password and the one inside DATABASE_URL cannot drift.
    grep '^POSTGRES_PASSWORD=' "${TMP_ENV}" || {
      echo "/kidlearn/dev/POSTGRES_PASSWORD is not set in SSM — the dev stack cannot start" >&2
      exit 1
    }
  else
    printf 'LOG_LEVEL=info\nENABLE_API_DOCS=false\n'
  fi
} >"${TMP_COMPOSE_ENV}"

install -m 0600 -o root -g root "${TMP_COMPOSE_ENV}" "${COMPOSE_ENV}"
log "wrote ${COMPOSE_ENV}"

# --- 2. Pull ----------------------------------------------------------------
log "authenticating to ECR"
aws ecr get-login-password --region "${AWS_REGION}" |
  docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# Every variable these files interpolate comes from compose.env, and nothing
# comes from this shell — so the commands below and the ones an operator types
# by hand resolve identically. That is the whole point of writing the file.
COMPOSE_FILES=(--env-file "${COMPOSE_ENV}" -f "${COMPOSE_DIR}/compose.yml")
if [[ "${ENV_NAME}" == "dev" ]]; then
  COMPOSE_FILES+=(-f "${COMPOSE_DIR}/compose.dev.yml")
fi

log "pulling ${IMAGE_TAG}"
docker compose -p "${PROJECT}" "${COMPOSE_FILES[@]}" pull api

# --- 3. Up ------------------------------------------------------------------
log "starting the stack"
docker compose -p "${PROJECT}" "${COMPOSE_FILES[@]}" up -d --remove-orphans

# --- 4. Health gate ---------------------------------------------------------
# Poll the container's own healthcheck rather than the public hostname: a failure
# here should mean the API is broken, not that Caddy or DNS is. `/health` is
# DB-free and cheap.
#
# `.State.Status` as well as `.State.Health.Status`, and both are checked every
# pass, because the two ways this fails look identical from `starting` alone: a
# container that exited on an env-validation error, and one whose healthcheck
# has already given up. Waiting the full 150 seconds for either is 150 seconds
# not spent reading the logs the failure path prints.
log "waiting for ${ENV_NAME}-api to report healthy"
for _ in $(seq 1 30); do
  state="$(docker inspect -f '{{.State.Status}}/{{.State.Health.Status}}' "${ENV_NAME}-api" 2>/dev/null || echo missing/starting)"
  case "${state}" in
  */healthy)
    log "healthy — deploy complete at ${IMAGE_TAG}"
    exit 0
    ;;
  */unhealthy)
    echo "[deploy:${ENV_NAME}] ${ENV_NAME}-api reported unhealthy" >&2
    break
    ;;
  exited/* | dead/*)
    echo "[deploy:${ENV_NAME}] ${ENV_NAME}-api exited (${state%%/*}) — it did not get as far as a healthcheck" >&2
    break
    ;;
  esac
  sleep 5
done

echo "[deploy:${ENV_NAME}] ${ENV_NAME}-api did not become healthy" >&2
docker compose -p "${PROJECT}" "${COMPOSE_FILES[@]}" logs --tail 50 api >&2
echo "[deploy:${ENV_NAME}] ROLL BACK WITH: $0 ${ENV_NAME} <previous-sha>" >&2
exit 1

# --- MIGRATIONS, deliberately not run above ---------------------------------
# A schema change must be a decision, not a side effect of restarting a container.
# Run it as its own step, before the deploy that needs it:
#
#   cd /opt/kidlearn/deploy/app
#   docker compose --env-file /opt/kidlearn/<env>/compose.env \
#     -p kidlearn-<env> -f compose.yml [-f compose.dev.yml] \
#     --profile migrate run --rm migrate
#
# THE --env-file IS NOT OPTIONAL. Without it Compose has no ENV_NAME, no
# ECR_REGISTRY and no IMAGE_TAG, so it looks for `/opt/kidlearn//app.env`, fails
# to find it, and would have named the container `-migrate` if it had. That file
# is written by this script; run a deploy before the first migration.
#
# It uses DIRECT_URL (port 5432, unpooled) from the same env file and applies
# committed migrations only. Never `migrate dev` against a deployed database.
# Migrations are FORWARD-ONLY: a bad one is fixed by a new forward migration,
# never by editing an applied one.
