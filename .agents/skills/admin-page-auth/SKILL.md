---
name: admin-page-auth
description: How to end-to-end test authenticated admin pages in GH-NEW2 using the Playwright auth-cookie helper, a non-admin test user, and the local Next.js dev server.
---

# Testing authenticated admin pages in GH-NEW2

## Dev secrets needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_CONNECTION`

Source them from the repo secrets file before starting any server or script:

```bash
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
```

## Starting the server for admin-page tests

Admin pages usually do not need PartyKit. Start only the Next.js dev server:

```bash
export NEXT_PUBLIC_APP_URL=http://localhost:3000
fuser -k 3000/tcp 2>/dev/null || true
npx next dev -p 3000
```

## Obtaining a non-admin test user

Use `gh-test-player-1@test.guess-history.com` / `TestPass123!` from `scripts/test/playwright/fixtures/auth.ts`, or create/recover a user via the anon password grant. The Supabase Admin `listUsers()` API can 500 in this environment, so a password sign-in recovery is more reliable.

## Setting the Supabase auth cookie in Playwright

```typescript
import { test } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import { authenticatePage } from '../helpers/auth-cookie';

test('authenticated admin page renders', async ({ page }) => {
  await authenticatePage(page, TEST_USERS[0]);
  const response = await page.goto('/admin/openrouter', { waitUntil: 'networkidle' });
  // ... assertions
});
```

The helper sets the `sb-<project-ref>-auth-token` cookie for `localhost`. After calling it, `createAuthenticatedServerClient()` in a Server Component will see a valid Supabase session.

## Verifying middleware redirect

For unauthenticated requests, Next.js middleware returns a `307` redirect to `/login?next=<path>`. In Playwright:

```typescript
const redirectRes = await context.request.get(`${baseURL}/admin/openrouter`, { maxRedirects: 0 });
expect(redirectRes.status()).toBe(307);
expect(redirectRes.headers()['location']).toMatch(/next=.*admin(%2F|\/)openrouter/);
```

When the browser follows the redirect, the login page renders `AuthModal` with `data-testid="auth-modal-card"`. Assert that the admin page heading/table is not present.

## Common pitfalls
- The dev server compiles the target route and `/login` lazily; the first request may take 5–10 s.
- Use `waitUntil: 'networkidle'` for the authenticated page; for the redirect/login path `waitUntil: 'domcontentloaded'` is safer because the login modal can keep `load` from firing promptly.
- The `/admin/openrouter` page at the time of writing requires only a valid Supabase session — no admin role check — and reads from `ai_answer_bank_calls` joined through `ai_answer_bank` to `ai_players`.
