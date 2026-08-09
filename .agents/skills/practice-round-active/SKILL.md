---
name: practice-round-active-ui
description: How to reach and exercise the practice round-active UI in GH-NEW2 for visual verification of bottom-nav button styling and sheet interactions.
---

# Devin Secrets Needed
- `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_*` keys from the repo secret file at `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets`.
- `PARTYKIT_SECRET` from `/home/ubuntu/repos/GH-NEW2/.dev.vars`.

# One-time environment
```bash
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets 2>/dev/null
export PARTYKIT_SECRET=$(grep '^PARTYKIT_SECRET=' /home/ubuntu/repos/GH-NEW2/.dev.vars | cut -d= -f2-)
export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
```

# Dev stack
```bash
npx concurrently -n next,party -c cyan,magenta "next dev" "partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=$PARTYKIT_SECRET --var NEXTJS_BASE_URL=http://localhost:3000"
```
Next.js runs on http://localhost:3000, PartyKit on http://localhost:1999.

# Auth
The seeded Playwright credentials (`gh-test-player-1@test.guess-history.com`) may not exist in this environment. A reliable fallback is to create a dedicated test user through the Supabase Admin API and sign in through the AuthModal:

```bash
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"<unique>@guess-history.com","password":"TestPass123!","email_confirm":true,"user_metadata":{"display_name":"TestUI"}}'
```

# Reaching ROUND_ACTIVE
The `/practice` entry page has a client-side auto-create `useEffect` that can race with `displayName` hydration and leave the page stuck on "Loading game…". To avoid this:
1. Sign in through the AuthModal with `loginViaAuthModal(page, user)`.
2. Decode the Supabase session cookie (`sb-<project-ref>-auth-token`, base64url-encoded after the `base64-` prefix) to get `playerId`.
3. POST to `/api/practice/create` directly from the Playwright request context with `roundTimerSec: 0` to disable the default 120-second auto-submit timer.
4. Navigate to `/practice/<gameId>`.
5. Wait for `data-testid="round-active-section"` with `data-status="ROUND_ACTIVE"`.

# Interacting with the round UI
- Bottom-nav circular buttons (`data-testid="round-when-btn"`, `data-testid="round-where-btn"`) have continuous "glow" animations. Use `{ force: true }` on all clicks, otherwise Playwright waits indefinitely for the element to become "stable".
- A sheet's dark backdrop is rendered while a sheet is open, so clicking the other nav button will close the current sheet instead of opening the other one. First confirm/close the open sheet (e.g., click "Confirm Year" or "Confirm Location"), then open the next sheet.
- The WHEN sheet is `data-testid="round-when-sheet"` adjacent; the WHERE sheet contains a Leaflet map and a `input[type="text"]` search box.
- To submit, select a year in the WHEN sheet, confirm, then in the WHERE sheet search a place, pick a result, confirm, and finally click `data-testid="round-submit-btn"` (also with `force: true`).

# Visual regression of the WHEN icon
- `.whenBtn .btnIcon { object-fit: cover; }` is the fix in `src/components/compete/RoundActiveSection.module.css`.
- The source asset `public/badges/when.webp` is 276x184 with a transparent background and a purple calendar; the visible part is the white grid. With the default `object-fit: fill` removed, the rectangular calendar squishes to a 64x64 square and the white grid looks narrow. With `object-fit: cover` the icon fills most of the purple circle.
- For a quick regression demo in the running page, set `document.querySelector('button[data-testid="round-when-btn"] img').style.objectFit = 'fill'`, screenshot, then clear the inline style.
