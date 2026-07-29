---
name: Guess History E2E Testing
description: How to set up and run end-to-end Playwright and two-browser smoke tests for the Guess History Next.js + PartyKit app.
---

# Guess History E2E Testing

## Dev stack

Always start with explicit PartyKit environment overrides; the default `partykit.json` contains hardcoded production URLs that break local DO-to-Next.js calls:

```bash
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
export PARTYKIT_SECRET=local-dev-secret \
       NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999 \
       PLAYWRIGHT_BASE_URL=http://localhost:3000 \
       SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL

npx concurrently -n next,party -c cyan,magenta \
  "next dev" \
  "partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=$PARTYKIT_SECRET --var NEXTJS_BASE_URL=http://localhost:3000"
```

Verify readiness with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login`.

## Test users

The Playwright `globalSetup` (`scripts/test/playwright/fixtures/auth.ts`) creates ten `gh-test-player-*@test.guess-history.com` users. In a long-lived dev Supabase project, `auth.admin.listUsers()` returns 50 users per page and stale test users can cause "already registered" errors. If that happens, clean the test domain auth users directly or paginate the setup list.

## Running tests

Pre-push golden path:

```bash
npx playwright test --config=scripts/test/playwright/playwright.config.ts --project=sync-golden
```

For a quick two-browser roster smoke, use two contexts in one headed Chromium window and sync-assert `data-testid="lobby-shell"` plus `data-testid^="lobby-player-"` count reaches 2.

## Important selectors

- Login: `data-testid="auth-modal"`, `auth-email-input`, `auth-password-input`, `auth-submit-btn`
- Lobby: `data-testid="lobby-shell"`, `lobby-player-*`, `lobby-ready-btn`
- Round active: `data-testid="round-active-section"`, `round-when-btn`, `round-where-btn`, `round-submit-btn`
- Round complete: `data-testid="round-complete-section"` (contains `%` suffix assertions)

## Mode caveats

- `/home` Compete `CREATE` creates an `async` game; `partykit/server.ts` skips auto-start for `async`.
- Use `mode: 'sync'` via `/api/compete/create` for two-player smoke tests that need ready-up → `ROUND_ACTIVE`.
- The smoke test UI (`/home`) can be blocked by the `WelcomeModal` unless `welcome_completed` is `true` in `public.profiles`.

## Devin Secrets Needed

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_DB_CONNECTION`
- `SUPABASE_SERVICE_ROLE_KEY`
