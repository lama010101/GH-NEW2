---
name: Playwright E2E setup for GH-NEW2
description: |
  How to start the local dev stack and run Playwright end-to-end tests for
  the GH-NEW2 Next.js + PartyKit app, including common auth/DB gotchas.
---

# Playwright E2E setup for GH-NEW2

## Devin secrets needed

- `repo:lama010101/GH-NEW2:NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `repo:lama010101/GH-NEW2:NEXT_PUBLIC_SUPABASE_URL`
- `repo:lama010101/GH-NEW2:SUPABASE_SERVICE_ROLE_KEY`
- `repo:lama010101/GH-NEW2:SUPABASE_DB_CONNECTION`
- `PARTYKIT_SECRET` is read from the tracked `.dev.vars` file (currently `local-dev-secret`).

## Why `.env.local` is not created

The repo expects `.env.local`, but for automated testing secrets should be
sourced into the shell and exported as environment variables. Do **not** write
plaintext secrets to `.env.local`.

## Start the dev stack

```bash
cd /home/ubuntu/repos/GH-NEW2
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets 2>/dev/null || true
export PARTYKIT_SECRET=local-dev-secret \
  NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999 \
  PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
  NEXT_PUBLIC_APP_URL=http://localhost:3000

npx concurrently -n next,party -c cyan,magenta \
  "next dev" \
  "partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=$PARTYKIT_SECRET --var NEXTJS_BASE_URL=http://localhost:3000"
```

If `next dev` reports port 3000 in use, kill the stale process with
`npx kill-port 3000 3001 1999` and restart.

## Verify DB connectivity

The Supabase DB pooler connection usually needs `sslmode=require` from this VM:

```bash
PGSSLMODE=require psql "$SUPABASE_DB_CONNECTION" -c 'SELECT 1;'
```

A `Connection terminated unexpectedly` / `authentication did not complete` error
usually means the VM's public IP is not in the Supabase allowlist, not that the
credentials are wrong.

## Verify Supabase Auth connectivity (fail-fast)

Before launching Playwright, confirm the Auth token endpoint responds:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const supabase = createClient(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: WebSocket } });
supabase.auth.signInWithPassword({ email: 'gh-test-player-1@test.guess-history.com', password: 'TestPass123!' })
  .then(({data,error}) => { console.log(JSON.stringify(error)); process.exit(error ? 1 : 0); })
  .catch(err => { console.error(err.message); process.exit(1); });
"
```

If it returns `AuthRetryableFetchError` status `504`, the VM public IP must be
added to the Supabase project allowlist or an alternative auth mechanism must be
provided. Do not burn time repeatedly running the full Playwright suite in that
state.

## Running the Relax 6-player specs

Once auth is healthy:

```bash
npx playwright test \
  --config=scripts/test/playwright/playwright.config.ts \
  scripts/test/playwright/specs/relax-6p-scoring-badges.spec.ts \
  scripts/test/playwright/specs/relax-6p-end-session.spec.ts \
  scripts/test/playwright/specs/relax-6p-auth-integrity.spec.ts \
  scripts/test/playwright/specs/relax-6p-regression-stress.spec.ts
```

## Cross-mode regression gate

```bash
npx playwright test \
  --config=scripts/test/playwright/playwright.config.ts \
  scripts/test/playwright/specs/sync-compete-golden-path.spec.ts \
  scripts/test/playwright/specs/practice-mode.spec.ts
```

## Common test infrastructure gotchas

- `scripts/test/playwright/fixtures/auth.ts` (global setup) calls
  `supabase.auth.admin.listUsers()` and `createUser()`, which are the first
  things to fail when the Auth endpoint is unreachable.
- `tests/helpers/relaxRoom.ts` and `tests/helpers/auth.ts` are the new Coder 4
  helper copies; they still depend on `signInWithPassword` and
  `fetchAccessToken`, so they have the same auth dependency.
- `.test-user-ids.json` caches test-user UUIDs, but the auth token is still
  required for PartyKit WebSocket `onBeforeConnect`.
- Screenshots from failed assertions are saved to `test-results/`;
  test-generated screenshots go to `reports/screenshots/`.
