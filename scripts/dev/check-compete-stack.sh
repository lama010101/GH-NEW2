#!/usr/bin/env bash
# MP-GUARD-SYNC-REGRESSION-001
# State-check for both the Next.js dev server (port 3000) AND PartyKit (port 1999).
# Exit 0 only when BOTH are listening. Exit 1 + diagnostic if either is down.
# Does NOT start or stop anything. Single responsibility: liveness report.

set -u

NEXT_PORT="${GH_STACK_NEXT_PORT:-3000}"
PARTY_PORT="${GH_STACK_PARTY_PORT:-1999}"
FAIL=0

# Cross-platform listening-port check. Prefers `ss -ltn` (Linux/macOS);
# falls back to `netstat -an` when `ss` is unavailable (e.g. Windows Git-bash,
# where `ss` does not exist and the check would otherwise always fail).
# Returns 0 (and prints nothing) if something is listening on $1, else 1.
PORT_LISTENING_VIA="none"
port_listening() {
  local port="$1"
  PORT_LISTENING_VIA="none"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -qE ":${port} "; then
      PORT_LISTENING_VIA="primary"
      return 0
    fi
  elif netstat -an 2>/dev/null | grep -E ":${port} " | grep -q LISTENING; then
    PORT_LISTENING_VIA="primary"
    return 0
  fi
  if ( exec 3<>"/dev/tcp/127.0.0.1/${port}" ) 2>/dev/null; then
    PORT_LISTENING_VIA="probe"
    return 0
  fi
  return 1
}

if port_listening "${NEXT_PORT}"; then
  echo "DEV SERVER: RUNNING on port ${NEXT_PORT}"
  if [ "${PORT_LISTENING_VIA}" = "probe" ]; then
    echo "  (detected via TCP connect probe; netstat did not list the listener)"
  fi
else
  echo "DEV SERVER: NOT RUNNING on port ${NEXT_PORT}"
  FAIL=1
fi

if port_listening "${PARTY_PORT}"; then
  echo "PARTYKIT: RUNNING on port ${PARTY_PORT}"
  if [ "${PORT_LISTENING_VIA}" = "probe" ]; then
    echo "  (detected via TCP connect probe; netstat did not list the listener)"
  fi
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
