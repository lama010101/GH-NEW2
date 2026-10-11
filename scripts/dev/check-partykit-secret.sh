#!/usr/bin/env bash
# MP-BUILD-DEVENV-PARTYKIT-SECRET-GUARD-008
# SEC-BUILD-DEVVARSUNTRACK-1011-009: header corrected — PartyKit does NOT read
# .dev.vars (partykit dev loads .env always and .env.local in dev; zero
# .dev.vars references in the partykit binary — see KC-012).
# Compare Next.js and PartyKit PARTYKIT_SECRET values before dev servers start.
# Next.js reads process.env.PARTYKIT_SECRET from .env.local or the shell.
# PartyKit dev reads it from .env/.env.local or --var; a .dev.vars file, when
# present, is a repo-tooling override this guard still compares against.
# A mismatch causes 401s on all server-to-server x-partykit-secret calls.

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

# .dev.vars is optional and untracked (SEC-BUILD-DEVVARSUNTRACK-1011-009).
# When absent, the PartyKit side falls back to the sources PartyKit actually
# reads: .env.local, then the shell. The presence/placeholder checks below
# still apply to whichever source wins.
if [ -f "$PARTYKIT_ENV_FILE" ] && grep -qE '^PARTYKIT_SECRET=' "$PARTYKIT_ENV_FILE" 2>/dev/null; then
  PARTYKIT_VALUE=$(get_env_value "$PARTYKIT_ENV_FILE" "PARTYKIT_SECRET")
  PARTYKIT_SOURCE=".dev.vars"
elif [ -f "$NEXTJS_ENV_FILE" ] && grep -qE '^PARTYKIT_SECRET=' "$NEXTJS_ENV_FILE" 2>/dev/null; then
  PARTYKIT_VALUE=$(get_env_value "$NEXTJS_ENV_FILE" "PARTYKIT_SECRET")
  PARTYKIT_SOURCE=".env.local (no .dev.vars)"
else
  PARTYKIT_VALUE="${PARTYKIT_SECRET:-}"
  PARTYKIT_SOURCE="shell environment (no .dev.vars)"
fi

if [ -z "$NEXTJS_SECRET" ]; then
  fail "Next.js PARTYKIT_SECRET is missing (source: ${NEXTJS_SOURCE}).\n  Next.js reads it in src/server/partykitAuth.ts:17.\n  Set it in .env.local or export PARTYKIT_SECRET before starting dev."
fi

if [ -z "$PARTYKIT_VALUE" ]; then
  fail "PartyKit PARTYKIT_SECRET is missing (source: ${PARTYKIT_SOURCE}).\n  PartyKit dev reads .env/.env.local (partykit.json maps --var values); .dev.vars is an optional repo-tooling file.\n  Set PARTYKIT_SECRET in .env.local or export it before starting dev."
fi

if [[ "$NEXTJS_SECRET" == *'${'*'}'* ]]; then
  fail "Next.js PARTYKIT_SECRET contains an unexpanded \${...} placeholder (source: ${NEXTJS_SOURCE}).\n  This matches the known SUPABASE_URL unexpanded-in-partykit-dev failure pattern.\n  Replace the placeholder with the actual secret value."
fi

if [[ "$PARTYKIT_VALUE" == *'${'*'}'* ]]; then
  fail "PartyKit PARTYKIT_SECRET contains an unexpanded \${...} placeholder (source: ${PARTYKIT_SOURCE}).\n  This matches the known SUPABASE_URL unexpanded-in-partykit-dev failure pattern.\n  Replace the placeholder with the actual secret value."
fi

if [ "$NEXTJS_SECRET" != "$PARTYKIT_VALUE" ]; then
  fail "PARTYKIT_SECRET values do not match between Next.js and PartyKit.\n  Next.js source: ${NEXTJS_SOURCE}\n  PartyKit source: ${PARTYKIT_SOURCE}\n  Both must be the same literal secret.\n  Align the two sources to the same literal value before running 'npm run dev'."
fi

echo "[PARTYKIT SECRET GUARD] OK: Next.js and PartyKit PARTYKIT_SECRET match (Next.js: ${NEXTJS_SOURCE}, PartyKit: ${PARTYKIT_SOURCE})."
exit 0
