#!/bin/sh
set -eu

cd /app

lockdir=/tmp/fee-process.lock
if ! mkdir "$lockdir" 2>/dev/null; then
  echo "fee process is already running, skipping this schedule" >&2
  exit 0
fi
trap 'rmdir "$lockdir"' EXIT INT TERM

exec ./node_modules/.bin/hardhat run scripts/fees/runFeeProcess.js --network arbitrum
