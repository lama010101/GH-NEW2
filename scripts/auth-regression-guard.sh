#!/usr/bin/env bash
# Auth regression guard — run before committing auth-related changes.
# Checks the invariants documented in KC-007 (KNOWN_CONSTRAINTS.md).
# Exit code 0 = all checks pass, exit code 1 = regression detected.
set -euo pipefail

cd "$(dirname "$0")/.."

FAIL=0

echo "=== KC-007 Auth Regression Guard ==="

# Check 1: No flowType in supabaseBrowser.ts
if grep -n "flowType" src/core/supabaseBrowser.ts 2>/dev/null; then
  echo "FAIL: flowType found in supabaseBrowser.ts — do not override @supabase/ssr defaults"
  FAIL=1
fi

# Check 2: No parallel cachedState outside identity.ts (excluding tests)
PARALLEL=$(grep -rn "cachedState" src/ 2>/dev/null | grep -v "identity.ts" | grep -v "\.test\." || true)
if [ -n "$PARALLEL" ]; then
  echo "FAIL: cachedState found outside identity.ts (non-test files):"
  echo "$PARALLEL"
  FAIL=1
fi

# Check 3: No state parameter check in callback route
if grep -n "Missing state" src/app/auth/callback/route.ts 2>/dev/null; then
  echo "FAIL: state parameter check found in callback route — this blocks all PKCE OAuth callbacks"
  FAIL=1
fi

# Check 4: Callback route must not read a 'state' query param
STATE_READ=$(grep -n 'searchParams.get("state")' src/app/auth/callback/route.ts 2>/dev/null || true)
if [ -n "$STATE_READ" ]; then
  echo "FAIL: callback route reads 'state' query param — PKCE flow does not include it"
  echo "$STATE_READ"
  FAIL=1
fi

# Check 5: Callback route must call exchangeCodeForSession
if ! grep -q "exchangeCodeForSession" src/app/auth/callback/route.ts 2>/dev/null; then
  echo "FAIL: callback route does not call exchangeCodeForSession"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "PASS: All KC-007 auth regression checks passed."
else
  echo ""
  echo "FAILED: One or more auth regression checks failed."
  echo "Read docs/KNOWN_CONSTRAINTS.md KC-007 before proceeding."
  exit 1
fi
