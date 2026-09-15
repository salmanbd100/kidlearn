#!/usr/bin/env bash
# Nightly production database dump → S3. Runs ON THE BOX, as root, from cron:
#
#   CRON_TZ=Asia/Dhaka
#   30 1 * * *  /opt/kidlearn/deploy/backup.sh
#
# PRODUCTION ONLY. The dev database is deliberately disposable (runbook §7).
#
# Supabase's free tier has no point-in-time recovery, so this is the only copy
# of production data that exists. An unrehearsed backup is a guess — restore one
# into the dev Postgres before believing this works, per runbook §8.
#
# Reads its two inputs from SSM rather than from /opt/kidlearn/prod/app.env,
# for two reasons: the secret never lands in a second place, and app.env holds
# `$`-doubled values (see deploy.sh) that are correct for Compose and wrong for
# anything else.

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
PG_IMAGE="postgres:16-alpine"

log() { echo "[backup] $*"; }

ssm() {
  aws ssm get-parameter --name "$1" --with-decryption \
    --region "${AWS_REGION}" --query Parameter.Value --output text
}

# DIRECT_URL (:5432, unpooled), not DATABASE_URL: pg_dump opens one long
# connection and holds it, which is exactly what PgBouncer's transaction pooling
# is not for — through the pooler a large dump fails partway with a closed
# connection.
DIRECT_URL="$(ssm /kidlearn/prod/DIRECT_URL)"
BUCKET="$(ssm /kidlearn/prod/BACKUP_S3_BUCKET)"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
KEY="s3://${BUCKET}/prod/${STAMP}.sql.gz"

# pg_dump from the same image the dev stack already pulls, so the box needs no
# postgres-client package and the dump is made by the major version that wrote
# the data. Piped straight to S3 — the 20 GB volume has no room for a copy, and
# a partial file on disk after a failure is worse than none.
#
# `set -o pipefail` is in force, so a pg_dump failure fails the whole pipeline
# rather than writing a valid gzip of nothing. That is the failure this script
# exists to not have.
log "dumping production → ${KEY}"
docker run --rm -i -e PGCONNECT_TIMEOUT=15 "${PG_IMAGE}" \
  pg_dump --no-owner --no-privileges --format=plain "${DIRECT_URL}" |
  gzip -9 |
  aws s3 cp --region "${AWS_REGION}" --expected-size 2147483648 - "${KEY}"

SIZE="$(aws s3api head-object --bucket "${BUCKET}" --key "prod/${STAMP}.sql.gz" \
  --region "${AWS_REGION}" --query ContentLength --output text)"

# A gzip of an empty dump is about 20 bytes and uploads perfectly happily. The
# floor is arbitrary but it is the difference between a backup and a file.
if [[ "${SIZE}" -lt 1024 ]]; then
  echo "[backup] ${KEY} is ${SIZE} bytes — that is not a database dump" >&2
  exit 1
fi

log "wrote ${KEY} (${SIZE} bytes)"

# Retention is the bucket's job, not this script's: a lifecycle rule expiring
# objects after 30 days, with versioning on. A script that deletes its own old
# backups is a script that can delete all of them.
