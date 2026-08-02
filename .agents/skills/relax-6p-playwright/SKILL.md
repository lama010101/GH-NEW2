---
name: relax-6p-playwright
description: How to run and maintain the 6-player Relax (async) Playwright QA specs.
---

## When to use this skill

You are running the Coder 1 (or follow-up) Relax 6-player QA suite in `scripts/test/playwright/specs/`.

## Files involved

- `scripts/test/playwright/specs/relax-6p-lobby.spec.ts` — lobby, roster, and config coverage.
- `scripts/test/playwright/specs/relax-6p-start-pacing.spec.ts` — independent start and pacing coverage.
- `tests/helpers/relaxRoom.ts` — `create6PlayerRelaxRoom` and roster helpers.
- `tests/helpers/relaxAssertions.ts` — `assertNoBannedText`, snapshot monotonic checks, `assertNextRoundEnabled`.

## Required environment

- `.env.local` must contain `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PARTYKIT_SECRET`, `NEXT_PUBLIC_PARTY_KIT_HOST`, `PLAYWRIGHT_BASE_URL`.
- `.dev.vars` must contain `PARTYKIT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXTJS_BASE_URL`.
- WebKit must be installed (`npx playwright install webkit`) and system deps present (`npx playwright install-deps`).

## Run the specs

```bash
npm run dev
# in another shell
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
npx playwright test \
  --config=scripts/test/playwright/playwright.config.ts \
  scripts/test/playwright/specs/relax-6p-lobby.spec.ts \
  scripts/test/playwright/specs/relax-6p-start-pacing.spec.ts
```

> `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` is currently required on the Devin VM because WebKit host-library validation is stricter than the actual runtime; the browsers launch and pass tests once validation is skipped.

## Verification checklist before PR

- `npm run typecheck` exits `0`.
- `npm run lint` exits `0` (pre-existing warnings are okay).
- The two specs pass in Chromium and WebKit.
- `reports/screenshots/` contains the expected PNGs.
- `room.violations` is empty for every test run.

## Common gotchas

- WebKit `page.request` does **not** forward the Supabase auth cookie in this Playwright build, so `create6PlayerRelaxRoom` explicitly builds a `Cookie` header for the `/api/compete/create` call.
- `auth.ts` `fetchAccessToken` retries 5xx/429 token requests and recovers existing test users via password sign-in when `listUsers` is degraded.
- The dev server must be fully warm before Playwright starts; the spec timeouts are generous (`NAV_TIMEOUT` 30s, `STATE_TIMEOUT` 60s, login 120s) but cold dev builds can still push run time to several minutes.
