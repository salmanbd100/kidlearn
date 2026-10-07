#!/usr/bin/env bash
# File 30's weekly parent-report job, triggered on the box rather than from
# cron-job.org (file 38 req 17) — one fewer account holding a credential, and
# the secret never leaves SSM.
#
#   CRON_TZ=Asia/Dhaka
#   0 2 * * 1  /opt/kidlearn/deploy/weekly-reports.sh >>/var/log/kidlearn-weekly-reports.log 2>&1
#
# PRODUCTION ONLY. Dev runs no scheduled jobs; trigger it by hand there.
#
# A failed run is reported, not just logged: cron on this box has no mail agent
# (see backup.sh), so a bare non-zero exit would reach nobody and that week's
# reports would simply never exist. When /kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL
# is set (a healthchecks.io-style dead-man's-switch URL) the script pings it on
# success and at `<url>/fail` on failure, and the monitor alerts on a missed ping
# too — the only way to hear about a cron that never fired.
#
# A SCRIPT RATHER THAN THE CURL INLINE IN THE CRONTAB, because cron has no line
# continuation: a crontab command is one line, to the newline, and the
# backslash-wrapped version of this that the runbook used to carry would have
# been handed to /bin/sh a fragment at a time.

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"

ssm() {
  aws ssm get-parameter --name "$1" --with-decryption \
    --region "${AWS_REGION}" --query Parameter.Value --output text
}

# Optional, and read first so a failure fetching the secret below is still
# reported. Unset means no alerting, which is said out loud on every run.
HEARTBEAT_URL="$(ssm /kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL 2>/dev/null || true)"
if [[ -z "${HEARTBEAT_URL}" ]]; then
  echo "[weekly-reports] WARNING: /kidlearn/prod/WEEKLY_REPORTS_HEARTBEAT_URL is not set — a failed run will not alert anyone" >&2
fi

heartbeat() {
  [[ -n "${HEARTBEAT_URL}" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${HEARTBEAT_URL}$1" || true
}

on_exit() {
  local status=$?
  if [[ ${status} -ne 0 ]]; then
    echo "[weekly-reports] FAILED with status ${status}" >&2
    heartbeat /fail
  fi
}
trap on_exit EXIT

CRON_SECRET="$(ssm /kidlearn/prod/CRON_SECRET)"

# The API answers 202 Accepted and runs the job in the background: a pass over
# every child outlasts any sane request timeout. So a success here means "the run
# started" (or `"status":"alreadyRunning"` — a second trigger joins the run in
# flight rather than starting another), NOT "every report was written". A run
# where children fail is logged by the API at `error` level ("Weekly reports
# failed for N of M children"), and only there — the heartbeat below cannot see
# it. The response body is echoed into this script's log for the record.
#
# --fail so a 401 or a 5xx is a non-zero exit; any 2xx, 202 included, passes.
# Retrying is safe because triggering is idempotent. curl's default retry covers
# timeouts and 408/429/5xx, and `--retry-connrefused` adds the connection refused
# a deploy recreating the API at 02:00 on a Monday produces. A 401 is not retried
# (`--retry-all-errors` would), so a wrong secret still fails at once.
#
# The header goes in as curl config on stdin (`-K -`), not as `-H`: an argument
# is readable by every user on the box in `ps` for the whole run. printf is a
# shell builtin, so the secret is never an argument to any process.
printf 'header = "Authorization: Bearer %s"\n' "${CRON_SECRET}" |
  curl -fsS --max-time 60 --retry 2 --retry-delay 60 --retry-connrefused -X POST \
    -K - https://api.kidlearn.net/api/admin/jobs/weekly-reports
echo

heartbeat ""
echo "[weekly-reports] accepted — the outcome is in the API log"
