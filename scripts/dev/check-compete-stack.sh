#!/usr/bin/env bash
# MP-GUARD-SYNC-REGRESSION-001
# State-check for both the Next.js dev server (port 3000) AND PartyKit (port 1999).
# Exit 0 only when BOTH are listening. Exit 1 + diagnostic if either is down.
# Does NOT start or stop anything. Single responsibility: liveness report.

set -u

NEXT_PORT=3000
PARTY_PORT=1999
FAIL=0

if ss -ltn 2>/dev/null | grep -qE ":${NEXT_PORT} "; then
  echo "DEV SERVER: RUNNING on port ${NEXT_PORT}"
else
  echo "DEV SERVER: NOT RUNNING on port ${NEXT_PORT}"
  FAIL=1
fi

if ss -ltn 2>/dev/null | grep -qE ":${PARTY_PORT} "; then
  echo "PARTYKIT: RUNNING on port ${PARTY_PORT}"
else
  echo "PARTYKIT: NOT RUNNING on port ${PARTY_PORT}"
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo "COMPETE STACK: INCOMPLETE — start both with: npm run dev"
  exit 1
fi

echo "COMPETE STACK: READY"
exit 0
