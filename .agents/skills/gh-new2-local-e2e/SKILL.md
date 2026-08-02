---
name: GH-NEW2 local end-to-end testing
description: |
  How to run the Guess-History Next.js app locally and prepare a test user for browser-based end-to-end verification of middleware/auth changes.
---

# GH-NEW2 local end-to-end testing

## Goal
Run the Next.js dev server and interact with it in Chrome to verify routing, middleware, and authentication behavior.

## Devin Secrets Needed
- `cloudflare`
- `vercel`
- Repo secrets file at `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets` (Supabase keys, DB connection, service role key).
- `.dev.vars` in the repo root for `PARTYKIT_SECRET`.

## Starting the dev server

1. Source the repo secrets and set PartyKit/Supabase variables:
   ```bash
   cd /home/ubuntu/repos/GH-NEW2
   source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
   export PARTYKIT_SECRET=$(grep '^PARTYKIT_SECRET=' .dev.vars | cut -d= -f2-)
   export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999 SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
   ```

2. Start only the Next.js dev server (PartyKit is not needed for middleware/auth tests):
   ```bash
   npx kill-port 3000 1999 2>/dev/null || true
   npx next dev
   ```
   Wait for `✓ Ready in ...` and `http://localhost:3000`.

3. The blueprint's `dev` command starts both `next dev` and `partykit dev` concurrently; use that when testing multiplayer/PartyKit features.

## Preparing an authenticated test user

The Playwright fixture accounts (`gh-test-player-*@test.guess-history.com`) are created by the Playwright global setup and may not exist in the environment. For manual browser testing, create a temporary user via the Supabase Auth admin API and clean it up afterward.

1. Create a confirmed user:
   ```bash
   source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
   curl -s -X POST "${_repo_secret_lama010101/GH-NEW2_NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"gh-tmp-tester@test.guess-history.com","password":"TestPass123!","email_confirm":true,"user_metadata":{"display_name":"TmpTester"}}'
   ```

2. Upsert a matching `profiles` row to avoid welcome-modal edge cases:
   ```bash
   USER_ID=<id from previous response>
   curl -s -X POST "${_repo_secret_lama010101/GH-NEW2_NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -H "Prefer: resolution=merge-duplicates" \
     -d "{\"id\":\"$USER_ID\",\"display_name\":\"TmpTester\",\"welcome_completed\":true,\"avatar_url\":null}"
   ```

3. Delete the test user and profile after testing:
   ```bash
   curl -s -X DELETE "${_repo_secret_lama010101/GH-NEW2_NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/$USER_ID" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   curl -s -X DELETE "${_repo_secret_lama010101/GH-NEW2_NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.$USER_ID" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   ```

## Browser setup

- The Devin-managed Chrome runs at `/opt/.devin/chrome/...` with `--user-data-dir=/home/ubuntu/.browser_data_dir`.
- To avoid session leakage, open a new incognito window (`Ctrl+Shift+N`) for each unauthenticated flow, or use `browser_console` to clear `document.cookie` and `localStorage`.
- The screen is 1600x1200, but `computer` tool coordinates should be provided in the tool's 1024x768 coordinate space.

## Common verification commands

```bash
# Root path redirect (unauthenticated)
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" -I http://localhost:3000/

# Home requires auth
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" -I http://localhost:3000/home

# Admin query is ignored
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" -I "http://localhost:3000/?admin=anything"

# Bypass cookie is ignored
curl -s -L -o /dev/null -w "%{url_effective}\n" -b gh_admin_bypass=1 http://localhost:3000/
```

## Notes and gotchas

- `npm run dev` from the blueprint starts PartyKit as well; if you only need Next.js, `npx next dev` is faster and avoids the PartyKit startup dependency.
- The Supabase Auth `listUsers` admin API is intermittently degraded (returns 500). When it fails, recover the user ID by performing a password-grant sign-in and reading the JWT `sub` claim.
- The AuthModal `required={true}` removes the close button and disables overlay click-to-close, so an unauthenticated user cannot accidentally close the modal and trigger a `/home` -> `/login` client-side loop.
- `vercel.json` host redirects are evaluated by Vercel's CDN before Next.js middleware runs, so `guess-history.com` -> `www.guess-history.com` does not bypass `src/middleware.ts`.
