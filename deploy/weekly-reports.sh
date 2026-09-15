#!/usr/bin/env bash
# File 30's weekly parent-report job, triggered on the box rather than from
# cron-job.org (file 38 req 17) — one fewer account holding a credential, and
# the secret never leaves SSM.
#
#   CRON_TZ=Asia/Dhaka
#   0 2 * * 1  /opt/kidlearn/deploy/weekly-reports.sh
#
# PRODUCTION ONLY. Dev runs no scheduled jobs; trigger it by hand there.
#
# A SCRIPT RATHER THAN THE CURL INLINE IN THE CRONTAB, because cron has no line
# continuation: a crontab command is one line, to the newline, and the
# backslash-wrapped version of this that the runbook used to carry would have
# been handed to /bin/sh a fragment at a time.

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"

CRON_SECRET="$(aws ssm get-parameter --name /kidlearn/prod/CRON_SECRET \
  --with-decryption --region "${AWS_REGION}" \
  --query Parameter.Value --output text)"

# --fail so a 401 or a 500 is a non-zero exit and cron mails it, rather than
# being logged as a successful run that quietly generated nothing.
curl -fsS --max-time 300 -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  https://api.kidlearn.net/api/admin/jobs/weekly-reports
