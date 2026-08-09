---
name: gh-smoke-test
description: End-to-end smoke testing of Guess-History (GH-NEW2) in a local dev stack, including account creation, bypassing the welcome modal, and navigating practice rounds.
---

# GH-NEW2 end-to-end smoke test

## Dev secrets needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PARTYKIT_SECRET` (from `.dev.vars` or secrets store)

## One-time setup
1. Start the dev stack. The repo blueprint's `dev` command is a good baseline, but also source `.dev.vars` so `NEXT_PUBLIC_APP_URL`, `NEXTJS_BASE_URL`, and `PARTYKIT_SECRET` are set:
   ```bash
   set -a
   source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
   source .dev.vars
   set +a
   export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
   export NEXT_PUBLIC_APP_URL=http://localhost:3000
   export NEXTJS_BASE_URL=http://localhost:3000
   fuser -k 3000/tcp 1999/tcp 2>/dev/null || true
   exec npx concurrently -n next,party -c cyan,magenta \
     "next dev -p 3000" \
     "partykit dev --var SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var NEXTJS_BASE_URL=http://localhost:3000 --var NEXT_PUBLIC_APP_URL=http://localhost:3000"
   ```
2. Create a dedicated test user with the Supabase service role and `email_confirm: true`.
3. Upsert a `profiles` row with `welcome_completed: true` so the welcome modal does not block the home page. If `avatar_url` is `NULL`, the app may call `/api/user/assign-avatar` and overwrite `display_name`, which is harmless for smoke tests.

## Common blockers and workarounds
- **Supabase rejects some test emails as invalid**: Long local-parts with trailing timestamp digits can fail. Use a short, simple local-part such as `gh-smoke-*@test.guess-history.com` and verify via `supabase.auth.signInWithPassword` in a Node script before opening the browser.
- **Welcome modal blocks navigation**: If `welcome_completed` is `false`, the modal always appears for new users. Set it to `true` directly in the DB, then open a fresh browser tab so React state resets.
- **Practice start from `/home` may not navigate reliably**: If the Practice card modal's **Start Practice** button does not route to `/practice`, navigate directly to `/practice` and wait for `/api/practice/create` to return. If `/practice` hangs on "Loading game…", read `/api/practice/create` logs, then navigate to the returned `gameId` URL (`/practice/<gameId>`).
- **Coordinate mapping for UI automation is brittle**: The browser viewport is larger than the 1024×768 tool coordinate space. For tiny controls (toggles, gear icon), prefer querying `getBoundingClientRect()` and either computing the mapped tool coordinate or dispatching `button.click()` via the browser console; both are acceptable because the page still visibly re-renders.

## Useful verification points
- The settings gear is in the top-left round pill during `ROUND_ACTIVE` and in the bottom bar during `ROUND_COMPLETE`.
- The settings modal key values are: `settingsResumeHint` text above the Home button, language switch updating labels while the hint stays English, and Sound/Vibrate/Theme/Distance toggles visibly changing state.
- Clicking **Home** triggers a `beforeunload` "Leave site?" dialog; choosing **Leave** navigates to `/home`.
