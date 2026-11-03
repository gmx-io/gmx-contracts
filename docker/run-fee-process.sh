#!/bin/sh
set -eu

cd /app

# Keep the lock open across exec; the OS releases it when the process exits.
exec 9>/tmp/fee-process.lock
if ! flock -n 9; then
  echo "fee process is already running, skipping this schedule" >&2
  exit 0
fi
exec ./node_modules/.bin/hardhat run scripts/fees/runFeeProcess.js --network arbitrum
