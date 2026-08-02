---
name: GH-NEW2 Golden-Path End-to-End Testing
description: |
  How to stand up the local Next.js + PartyKit dev stack and run the
  sync/practice/daily/relax golden-path Playwright specs for PRs that touch
  the completed-game / SessionComplete flow.
---

## One-time dev stack setup

1. Source the repo secrets:
   ```bash
   source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
   ```
2. Make the Next.js and PartyKit `PARTYKIT_SECRET` values match:
   ```bash
   export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
   export PLAYWRIGHT_BASE_URL=http://localhost:3000
   export SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
   export PARTYKIT_SECRET=$(grep '^PARTYKIT_SECRET=' .dev.vars | cut -d= -f2-)
   ```
3. Kill any stale `next dev` / `partykit dev` / `concurrently` processes and
   free ports 3000 and 1999, then start both servers:
   ```bash
   npx kill-port 3000 1999
   npx concurrently -n next,party -c cyan,magenta \
     "next dev" \
     "npx partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=$PARTYKIT_SECRET --var NEXTJS_BASE_URL=http://localhost:3000"
   ```
4. Verify the stack:
   - `curl http://localhost:3000/login` should return 200.
   - PartyKit should log `Ready on http://0.0.0.0:1999`.

## Running the golden-path specs

Use one project at a time; running multiple Playwright projects concurrently
shares test users and DB state and is likely to flake:

```bash
npx playwright test --config=scripts/test/playwright/playwright.config.ts --project=sync-golden
npx playwright test --config=scripts/test/playwright/playwright.config.ts --project=practice-golden
npx playwright test --config=scripts/test/playwright/playwright.config.ts --project=relax-golden
npx playwright test --config=scripts/test/playwright/playwright.config.ts --project=chromium \
  scripts/test/playwright/specs/daily-golden-path.spec.ts --grep "Daily fresh start"
```

For headless CI/automation, set:
```bash
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
```

## Authenticating for one-off UI/screenshot scripts

The AuthModal UI path can flake under heavy repeated dev-server load. For
cookie-based authentication in ad-hoc Playwright scripts or screenshots, get a
full Supabase session and set the `sb-<project-ref>-auth-token` cookie:

```js
const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const session = await res.json();
await context.addCookies([{
  name: 'sb-gzvixlvkwjsrtmtybtkf-auth-token',
  value: JSON.stringify(session),
  domain: 'localhost', path: '/', httpOnly: false, sameSite: 'Lax',
}]);
```

## Common gotchas

- **Port 3001 instead of 3000** — a stale Next.js process is holding port 3000.
  Kill all `next-server` / `next dev` / `concurrently` parents and restart.
- **Supabase `createUser` needs `ws` transport on Node 20** —
  `createClient(..., { realtime: { transport: WebSocket } })` is required when
  using `@supabase/supabase-js` directly in Node scripts.
- **PartyKit 401 on reconnect** — the `PARTYKIT_SECRET` passed to `partykit dev`
  may not match the one Next.js uses, or the token query string is stale.
  Restart both dev servers and ensure the secret is aligned.
- **Golden-path specs depend on `SUPABASE_DB_CONNECTION`** for the daily spec; it
  is exported from `.env.secrets`.

## Devin secrets needed

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_CONNECTION`
- `PARTYKIT_SECRET` (read from `.dev.vars` in the repo root)
