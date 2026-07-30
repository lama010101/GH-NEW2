#!/usr/bin/env bash
# MP-BUILD-DEVENV-PARTYKIT-SECRET-GUARD-008
# Startup guard: Next.js's PARTYKIT_SECRET must match PartyKit's .dev.vars
# value before either dev server starts, or server-to-server requests will
# fail with 401/403.
#
# Does NOT start, stop, or mutate any server or secret value.

set -u

DEV_VARS_FILE=".dev.vars"

# Determine the value Next.js will actually see at runtime.
# Next.js uses process.env.PARTYKIT_SECRET first; if unset it loads .env.local,
# then .env. We mirror that order so the check reflects the effective secret.
next_secret_source="environment"
next_secret="${PARTYKIT_SECRET:-}"

if [ -z "$next_secret" ] && [ -f ".env.local" ]; then
  next_secret_source=".env.local"
  next_secret="$(grep '^PARTYKIT_SECRET=' .env.local 2>/dev/null | cut -d= -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
fi

if [ -z "$next_secret" ] && [ -f ".env" ]; then
  next_secret_source=".env"
  next_secret="$(grep '^PARTYKIT_SECRET=' .env 2>/dev/null | cut -d= -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
fi

if [ -z "$next_secret" ]; then
  echo "ERROR: Next.js has no PARTYKIT_SECRET." >&2
  echo "       Set it in the environment, .env.local, or .env before running 'npm run dev'." >&2
  exit 1
fi

# Reject literal unexpanded variable references (e.g. \${SUPABASE_URL} or $SUPABASE_URL).
# This matches the known ${SUPABASE_URL} literal-string failure pattern in this repo.
if printf '%s' "$next_secret" | grep -qF '$'; then
  echo "ERROR: Next.js PARTYKIT_SECRET from $next_secret_source looks unexpanded." >&2
  echo "       Resolve the variable (do not leave a literal '$' reference) before starting dev servers." >&2
  exit 1
fi

if [ ! -f "$DEV_VARS_FILE" ]; then
  echo "ERROR: PartyKit dev vars file not found: $DEV_VARS_FILE" >&2
  exit 1
fi

partykit_secret_source="$DEV_VARS_FILE"
partykit_secret="$(grep '^PARTYKIT_SECRET=' "$DEV_VARS_FILE" 2>/dev/null | cut -d= -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"

if [ -z "$partykit_secret" ]; then
  echo "ERROR: PartyKit PARTYKIT_SECRET is missing from $DEV_VARS_FILE" >&2
  exit 1
fi

if printf '%s' "$partykit_secret" | grep -qF '$'; then
  echo "ERROR: PartyKit PARTYKIT_SECRET in $DEV_VARS_FILE looks unexpanded." >&2
  echo "       Resolve the variable (do not leave a literal '$' reference) before starting dev servers." >&2
  exit 1
fi

if [ "$next_secret" != "$partykit_secret" ]; then
  echo "ERROR: PARTYKIT_SECRET mismatch between Next.js ($next_secret_source) and PartyKit ($partykit_secret_source)." >&2
  echo "       The two dev servers will reject each other's server-to-server requests." >&2
  echo "       Align them before running 'npm run dev'." >&2
  exit 1
fi

echo "PARTYKIT_SECRET is aligned ($next_secret_source == $partykit_secret_source)."
