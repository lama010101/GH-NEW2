---
name: Test Relax 6-player Playwright specs for Guess-History
description:>
  Run the three Relax 6-player Playwright specs end-to-end against a local
  Next.js + PartyKit dev server, including secret handling and common auth-API
  failure modes.
---

# Test Relax 6-player Playwright specs

## Devin Secrets Needed

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PARTYKIT_SECRET` (or use `local-dev-secret` for local dev)

## One-time environment prep

1. Use Node 20 (`.nvmrc`):
   ```bash
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20.20.2
   ```

2. Install deps + Chromium:
   ```bash
   npm install
   npx playwright install chromium
   ```

3. Source repo secrets and export extra env:
   ```bash
   source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
   export PARTYKIT_SECRET=local-dev-secret
   export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
   export PLAYWRIGHT_BASE_URL=http://localhost:3000
   export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
   ```

## Start the dev server

Do **not** use `npm run dev` as-is if `.dev.vars` has a different `PARTYKIT_SECRET`;
the predev guard will fail. Use the equivalent command with explicit `--var`
overrides:

```bash
npx concurrently -n next,party -c cyan,magenta \
  "next dev" \
  "partykit dev \
    --var SUPABASE_URL=$SUPABASE_URL \
    --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
    --var PARTYKIT_SECRET=$PARTYKIT_SECRET \
    --var NEXTJS_BASE_URL=http://localhost:3000"
```

Wait until `http://localhost:3000` returns 200 and PartyKit prints `Ready on http://0.0.0.0:1999`.

## Run the tests

```bash
npx playwright test \
  --config=scripts/test/playwright/playwright.config.ts \
  --project=chromium \
  scripts/test/playwright/specs/relax-6p-timer-deadline.spec.ts \
  scripts/test/playwright/specs/relax-6p-reconnect.spec.ts \
  scripts/test/playwright/specs/relax-6p-absent-invalid.spec.ts
```

## Common failure modes

- **504 Gateway Timeout in `fetchAccessToken` / `AuthRetryableFetchError` in `auth.ts` globalSetup**: the Supabase Auth REST API can become flaky under the burst of parallel logins/token fetches from six players. If this happens, the suite may not complete and a quiet re-run (or waiting for the API to cool down) might be required.
- **Port 3000 already in use**: a previous `next-server` may still be listening. Use `fuser -k 3000/tcp 1999/tcp` and restart.
- **Screenshot dimensions**: the specs use `DESKTOP_PRESET` 1280x800; expect `test-results/relax-6p-*.png` to match those dimensions.
