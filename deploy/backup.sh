#!/usr/bin/env bash
# Nightly production database dump → S3. Runs ON THE BOX, as root, from cron:
#
#   CRON_TZ=Asia/Dhaka
#   30 1 * * *  /opt/kidlearn/deploy/backup.sh >>/var/log/kidlearn-backup.log 2>&1
#
# PRODUCTION ONLY. The dev database is deliberately disposable (runbook §7).
#
# Supabase's free tier has no point-in-time recovery, so this is the only copy
# of production data that exists. An unrehearsed backup is a guess — restore one
# into the dev Postgres before believing this works, per runbook §8.
#
# A failed run is reported, not just logged: cron on this box has no mail agent, so
# stderr alone would reach nobody. When /kidlearn/prod/BACKUP_HEARTBEAT_URL is set
# (a healthchecks.io-style dead-man's-switch URL) the script pings it on success
# and at `<url>/fail` on failure, and the monitor alerts on a missed ping too — the
# only way to hear about a cron that never fired.
#
# Reads its inputs from SSM rather than from /opt/kidlearn/prod/app.env,
# for two reasons: the secret never lands in a second place, and app.env holds
# `$`-doubled values (see deploy.sh) that are correct for Compose and wrong for
# anything else.

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"

log() { echo "[backup] $*"; }

ssm() {
  aws ssm get-parameter --name "$1" --with-decryption \
    --region "${AWS_REGION}" --query Parameter.Value --output text
}

# DIRECT_URL (:5432, unpooled), not DATABASE_URL: pg_dump opens one long
# connection and holds it, which is exactly what PgBouncer's transaction pooling
# is not for — through the pooler a large dump fails partway with a closed
# connection.
# Optional. Read first so a failure fetching the two required values below is
# still reported. Unset means no alerting, which is said out loud on every run.
HEARTBEAT_URL="$(ssm /kidlearn/prod/BACKUP_HEARTBEAT_URL 2>/dev/null || true)"
if [[ -z "${HEARTBEAT_URL}" ]]; then
  echo "[backup] WARNING: /kidlearn/prod/BACKUP_HEARTBEAT_URL is not set — a failed backup will not alert anyone" >&2
fi

heartbeat() {
  [[ -n "${HEARTBEAT_URL}" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${HEARTBEAT_URL}$1" || true
}

PARTIAL_KEY=""
BUCKET=""

# Any non-zero exit lands here: the pipeline below fails under pipefail, and so do
# a failed SSM read and the size check. Delete whatever was half-uploaded, then
# report. Best effort on the delete — if the instance dies outright, the object
# is still under `prod/.partial/`, which no restore listing of `prod/` shows.
on_exit() {
  local status=$?
  if [[ ${status} -ne 0 ]]; then
    if [[ -n "${PARTIAL_KEY}" ]]; then
      aws s3 rm --region "${AWS_REGION}" "${PARTIAL_KEY}" >/dev/null 2>&1 || true
    fi
    echo "[backup] FAILED with status ${status}" >&2
    heartbeat /fail
  fi
}
trap on_exit EXIT

# DIRECT_URL (:5432, unpooled), not DATABASE_URL: pg_dump opens one long
# connection and holds it, which is exactly what PgBouncer's transaction pooling
# is not for — through the pooler a large dump fails partway with a closed
# connection.
DIRECT_URL="$(ssm /kidlearn/prod/DIRECT_URL)"
BUCKET="$(ssm /kidlearn/prod/BACKUP_S3_BUCKET)"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
FINAL_KEY="s3://${BUCKET}/prod/${STAMP}.sql.gz"
PARTIAL_KEY="s3://${BUCKET}/prod/.partial/${STAMP}.sql.gz"

# The dump streams to a `.partial/` key and is promoted to its real name only
# after the whole pipeline has succeeded and the size check has passed. `aws s3 cp -`
# uploads whatever bytes reach it, and a pg_dump that dies midway ends its stdout
# like a clean EOF — so uploading straight to the final key left a truncated file
# there, newest in the listing, exactly where an emergency restore looks first.
#
# pg_dump from the postgres image of the SERVER's major version, asked of the
# server on every run, so the box needs no postgres-client package. pg_dump
# refuses a server newer than itself, and Supabase upgrades projects in place:
# a pinned image would start failing the night after one. psql has no such
# limit, so any image can ask. Piped straight to S3 — the 20 GB volume has no
# room for a copy.
#
# `set -o pipefail` is in force, so a pg_dump failure fails the whole pipeline
# rather than writing a valid gzip of nothing.
log "dumping production → ${PARTIAL_KEY}"
# DIRECT_URL is inherited from this shell's environment (`-e` with no value) rather
# than passed as an argument, so the password never appears in `ps` or
# `docker inspect`.
export DIRECT_URL
SERVER_VERSION_NUM="$(docker run --rm -e PGCONNECT_TIMEOUT=15 -e DIRECT_URL postgres:17-alpine \
  sh -c 'exec psql "$DIRECT_URL" -XAtc "SHOW server_version_num"')"
if [[ ! "${SERVER_VERSION_NUM}" =~ ^[0-9]{5,6}$ ]]; then
  echo "[backup] could not read the server version (got '${SERVER_VERSION_NUM}')" >&2
  exit 1
fi
PG_IMAGE="postgres:$((SERVER_VERSION_NUM / 10000))-alpine"
log "server is Postgres ${SERVER_VERSION_NUM}; dumping with ${PG_IMAGE}"
docker run --rm -i -e PGCONNECT_TIMEOUT=15 -e DIRECT_URL "${PG_IMAGE}" \
  sh -c 'exec pg_dump --no-owner --no-privileges --format=plain "$DIRECT_URL"' |
  gzip -9 |
  aws s3 cp --region "${AWS_REGION}" --expected-size 2147483648 - "${PARTIAL_KEY}"

SIZE="$(aws s3api head-object --bucket "${BUCKET}" --key "prod/.partial/${STAMP}.sql.gz" \
  --region "${AWS_REGION}" --query ContentLength --output text)"

# A gzip of an empty dump is about 20 bytes and uploads perfectly happily. The
# floor is arbitrary but it is the difference between a backup and a file.
if [[ "${SIZE}" -lt 1024 ]]; then
  echo "[backup] ${PARTIAL_KEY} is ${SIZE} bytes — that is not a database dump" >&2
  exit 1
fi

aws s3 mv --region "${AWS_REGION}" "${PARTIAL_KEY}" "${FINAL_KEY}"
PARTIAL_KEY=""

log "wrote ${FINAL_KEY} (${SIZE} bytes)"
heartbeat ""

# Retention is the bucket's job, not this script's: a lifecycle rule expiring
# objects after 30 days, with versioning on. A script that deletes its own old
# backups is a script that can delete all of them.
