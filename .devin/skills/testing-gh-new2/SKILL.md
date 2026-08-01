---
name: Testing GH-NEW2 local UI flows
description: How to start the local GH-NEW2 stack, authenticate a test user, reach an active game round, and verify the in-game settings modal.
---

## One-liner
Run the GH-NEW2 dev stack, create a test user with Supabase admin, sign in through the AuthModal, navigate to `/practice`, and trigger the settings gear during an active round.

## Dev server start command
```bash
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
export PARTYKIT_SECRET=local-dev-secret NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999 PLAYWRIGHT_BASE_URL=http://localhost:3000 SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
npx concurrently -n next,party -c cyan,magenta \
  "next dev" \
  "partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=$PARTYKIT_SECRET --var NEXTJS_BASE_URL=http://localhost:3000"
```
Wait for `▲ Next.js ... Ready` and `Ready on http://0.0.0.0:1999`.

## Authenticating for UI tests
The app redirects unauthenticated users from `/home` and `/practice` to `/login` with an AuthModal. The simplest approach for manual UI testing:
1. Create a test user via the Supabase admin API using the service-role key.
2. Upsert a profile with `welcome_completed=true` and a `display_name` to skip the welcome flow.
3. Open `http://localhost:3000/login?next=/practice`, fill email + password, and sign in.

Example Node script (run from the repo root so `node_modules/@supabase/supabase-js` resolves):
```js
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws }
});
const { data, error } = await supabase.auth.admin.createUser({
  email: 'gh-test-<id>@example.com', password: 'TestPass123!', email_confirm: true
});
if (data?.user) await supabase.from('profiles').upsert({
  id: data.user.id, display_name: 'Tester', welcome_completed: true
}, { onConflict: 'id' });
```

## Reaching an active round
- `/practice` auto-creates a session and redirects to `/practice/[gameId]`.
- The page auto-starts from `LOBBY` to `ROUND_ACTIVE`.
- Look for the round pill (`1 / 5`) and the bottom WHERE/WHEN/Submit navbar.

## Triggering the settings modal
- The settings gear is a small circular button at the top-left of the round view (`aria-label="Settings"`, class `...settingsBtn...`).
- On high-resolution displays with coordinate scaling, a direct mouse click may miss the small gear; use `document.querySelector('button[aria-label="Settings"]').click()` in the browser console if needed.

## Common gotchas
- The `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are both in `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets`.
- Node 20 does not have native WebSocket; when using `@supabase/supabase-js` in a test script, pass `ws` as the `realtime.transport` option.
- The game timer may be long in practice mode, so there is no rush to open the settings modal.

## Devin Secrets Needed
- `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets` (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
