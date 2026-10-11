#!/usr/bin/env bash
# MP-BUILD-DEVENV-PARTYKIT-SECRET-GUARD-008
# SEC-BUILD-DEVVARSUNTRACK-1011-009: header corrected — PartyKit does NOT read
# .dev.vars (partykit dev loads .env always and .env.local in dev; zero
# .dev.vars references in the partykit binary — see KC-012).
# Compare Next.js and PartyKit PARTYKIT_SECRET values before dev servers start.
# Next.js reads process.env.PARTYKIT_SECRET from .env.local or the shell.
# PartyKit dev reads it from .env/.env.local or --var; a .dev.vars file, when
# present, is ignored by PartyKit, so this guard only warns when it disagrees.
# A missing or placeholder secret causes 401s on all server-to-server
# x-partykit-secret calls.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NEXTJS_ENV_FILE="$ROOT/.env.local"
PARTYKIT_ENV_FILE="$ROOT/.dev.vars"

fail() {
  echo -e "[PARTYKIT SECRET GUARD] FAIL: $1" >&2
  exit 1
}

# Extract the value of a KEY=... line from a dotenv-style file.
# Strips surrounding quotes and leading/trailing whitespace.
get_env_value() {
  local file="$1"
  local key="$2"
  local line

  line=$( (grep -E "^${key}=" "$file" 2>/dev/null || true) | head -n1)
  line=${line#"${key}="}

  # Strip surrounding single or double quotes
  line=${line#\"}; line=${line%\"}
  line=${line#\'}; line=${line%\'}

  # Trim leading/trailing whitespace
  printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

if [ -f "$NEXTJS_ENV_FILE" ] && grep -qE '^PARTYKIT_SECRET=' "$NEXTJS_ENV_FILE" 2>/dev/null; then
  NEXTJS_SECRET=$(get_env_value "$NEXTJS_ENV_FILE" "PARTYKIT_SECRET")
  NEXTJS_SOURCE=".env.local"
else
  NEXTJS_SECRET="${PARTYKIT_SECRET:-}"
  NEXTJS_SOURCE="shell environment"
fi

# FAIL only when the effective secret — the one Next.js and PartyKit actually
# read, from .env.local or the shell — is missing or an unexpanded placeholder.
if [ -z "$NEXTJS_SECRET" ]; then
  fail "PARTYKIT_SECRET is missing (source: ${NEXTJS_SOURCE}).\n  Next.js reads it in src/server/partykitAuth.ts:17; PartyKit dev reads .env/.env.local.\n  Set it in .env.local or export PARTYKIT_SECRET before starting dev."
fi

if [[ "$NEXTJS_SECRET" == *'${'*'}'* ]]; then
  fail "PARTYKIT_SECRET contains an unexpanded \${...} placeholder (source: ${NEXTJS_SOURCE}).\n  This matches the known SUPABASE_URL unexpanded-in-partykit-dev failure pattern.\n  Replace the placeholder with the actual secret value."
fi

# .dev.vars is optional, untracked, and never read by PartyKit (KC-012), so a
# stale .dev.vars must not fail npm run dev: a disagreement with the
# .env.local value only warns (SEC-FIX-DEVVARSUNTRACK-1011-010).
if [ -f "$PARTYKIT_ENV_FILE" ] && grep -qE '^PARTYKIT_SECRET=' "$PARTYKIT_ENV_FILE" 2>/dev/null; then
  DEVVARS_VALUE=$(get_env_value "$PARTYKIT_ENV_FILE" "PARTYKIT_SECRET")
  if [ "$DEVVARS_VALUE" != "$NEXTJS_SECRET" ]; then
    echo -e "[PARTYKIT SECRET GUARD] WARNING: ${PARTYKIT_ENV_FILE} declares a different PARTYKIT_SECRET than ${NEXTJS_ENV_FILE}.\n  PartyKit ignores .dev.vars (KC-012) — delete ${PARTYKIT_ENV_FILE} or align it with ${NEXTJS_ENV_FILE}." >&2
  fi
fi

echo "[PARTYKIT SECRET GUARD] OK: PARTYKIT_SECRET is set (source: ${NEXTJS_SOURCE})."
exit 0
