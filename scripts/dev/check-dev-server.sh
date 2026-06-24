#!/usr/bin/env bash
# MP-FIX-DEVIN-LOCAL-ENV-SETUP-001
# State-check ONLY for the dev server on port 3000.
# Does NOT start or stop anything. Single responsibility.
#
# Exit 0 + "DEV SERVER: RUNNING on port 3000" when something is listening.
# Exit 1 + "DEV SERVER: NOT RUNNING"          when nothing is listening.

set -u

PORT=3000

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "DEV SERVER: RUNNING on port ${PORT}"
  exit 0
fi

echo "DEV SERVER: NOT RUNNING"
exit 1
