#!/bin/sh
set -eu

cd /app

if [ -z "${CRON_SCHEDULE:-}" ]; then
  echo "CRON_SCHEDULE is required. Example: 0 9 * * *" >&2
  exit 1
fi

if [ ! -f env.json ]; then
  echo "env.json is missing. Mount the real file at /app/env.json." >&2
  exit 1
fi

if [ ! -f keys/credentials.json ]; then
  echo "keys/credentials.json is missing. Mount the keys directory at /app/keys." >&2
  exit 1
fi

# fee-plan.json and fee-steps.json are written by the fee process.
# Keep them on the host when /host is mounted.
if [ -d /host ]; then
  ln -sfn /host/fee-plan.json /app/fee-plan.json
  ln -sfn /host/fee-steps.json /app/fee-steps.json
fi

crontab=/etc/fee-process.crontab
printf '%s\n' "$CRON_SCHEDULE /app/docker/run-fee-process.sh" > "$crontab"
supercronic -test "$crontab"

echo "fee process schedule: ${CRON_SCHEDULE} (TZ=${TZ:-UTC})"
exec supercronic "$crontab"
