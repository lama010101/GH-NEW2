---
name: GH-NEW2 Local E2E and Smoke Testing
description: How to run the Guess-History (GH-NEW2) local multiplayer stack, provision test users, and execute the KC-009 two-browser smoke test and the Playwright sync golden-path spec.
---

# GH-NEW2 Local E2E and Smoke Testing

## Devin Secrets Needed

- `secret:repo:lama010101/GH-NEW2:NEXT_PUBLIC_SUPABASE_URL`
- `secret:repo:lama010101/GH-NEW2:NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `secret:repo:lama010101/GH-NEW2:SUPABASE_SERVICE_ROLE_KEY`

Optional dummy local value:
- `PARTYKIT_SECRET=local-dev-secret` (must match between `next dev` and `partykit dev`)

## Start the local stack

The repo ships `next dev` and `partykit dev` in `package.json`, but `partykit dev` needs the Supabase/PartyKit variables passed explicitly when `.env.local` is not used. Source the repo secrets and run both processes together:

```bash
cd /home/ubuntu/repos/GH-NEW2
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
export PARTYKIT_SECRET=local-dev-secret
export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL

npx concurrently -n next,party -c cyan,magenta \
  "next dev" \
  "partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=local-dev-secret --var NEXTJS_BASE_URL=http://localhost:3000"
```

Wait for `http://localhost:3000` and `http://localhost:1999` to report `Ready`.

## Test users

`scripts/test/playwright/fixtures/auth.ts` defines ten fixture users (`gh-test-player-1` through `gh-test-player-10` with password `TestPass123!`). The `globalSetup` creates them via the Supabase Admin API.

### Known environment quirk

`supabase.auth.admin.listUsers()` can return a 500 `Database error finding users` in this project, so `globalSetup` may fail with `email_exists` if stale fixture users remain. Clear them by signing in each fixture email and deleting by ID:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { TEST_USERS } from './scripts/test/playwright/fixtures/auth.ts';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sup = createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false }, realtime: { transport: WebSocket } });
for (const u of TEST_USERS) {
  const res = await fetch(url + '/auth/v1/token?grant_type=password', { method:'POST', headers:{ apikey: anon, 'Content-Type':'application/json' }, body: JSON.stringify({ email: u.email, password: u.password }) });
  if (!res.ok) continue;
  const data = await res.json();
  const id = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString()).sub;
  await sup.auth.admin.deleteUser(id);
}
"
```

Then `globalSetup` can create fresh users.

## Manual two-browser smoke (KC-009 baseline)

1. Use the Devin-controlled Chrome window for the host (it is on CDP port `29229`).
2. Open an incognito window inside that same Chrome (`Ctrl+Shift+N`) so `browser_console` can interact with it.
3. Log host in as `gh-test-player-1`, navigate to `/home`, and click the **CREATE** button in the CHALLENGE card.
4. Copy the `/compete/<gameId>` URL.
5. In the incognito guest window, log in as `gh-test-player-2` and navigate to the same `/compete/<gameId>` URL.
6. Both windows should show `Players (2/2)` within 10–20 seconds.

**Note for Devin/Cascade coders without functioning manual input control:**
If `computer`/`xdotool`-style manual keystrokes fail to enter form fields in an incognito browser window (known limitation, not a stack bug), substitute the following method instead of reporting FAIL:

- Write a one-off Playwright script (in `scripts/test/_scratch/`, delete when done) that connects over CDP to the same Devin-controlled Chrome instance, opens a second incognito context programmatically, and drives the full host-creates/guest-joins flow through Playwright's API (not manual input).
- Measure time from guest page load to roster showing both players present — this is a valid substitute for the manual roster-join measurement.
- In your verdict table, label this result "CDP-substituted" — do NOT label it "manual" or "PASS" without qualification. It is real evidence of stack health but not equivalent to the literal manual-input method this section originally describes.
- A single CDP-substituted timing sample should NOT be treated as re-establishing or re-verifying the KC-009 baseline range (currently 10-20s on local dev stack, per 2026-07-25 investigation) — it's a spot-check, not a new baseline measurement. Only a dedicated timing investigation task re-establishes that range.

If you need test users to skip the welcome modal, set `welcome_completed = true` on `profiles` for the two fixture users after creating them.

## Playwright sync golden-path

```bash
npx playwright test --config=scripts/test/playwright/playwright.config.ts --project=sync-golden scripts/test/playwright/specs/sync-compete-golden-path.spec.ts
```

The run should end with `1 passed (≈35–45s)`. The `globalSetup` will provision test users; teardown deletes them.

## Useful selectors

- Lobby shell: `[data-testid="lobby-shell"]`
- Roster row for a player: `[data-testid="lobby-player-<playerId>"]`
- Home CHALLENGE create button: `button[aria-label="Play CHALLENGE"]`
- Auth submit: `button` with trimmed text `"Sign In"`
