---
name: Home Compete completed-card rank badge verification
description: How to verify the /home Compete Completed tab shows a numeric rank badge (#1, #2, etc.) after a completed 2-player sync compete game.
---

# Home Compete completed-card rank badge verification

## Goal
Confirm that `src/app/api/compete/active-games/route.ts` correctly computes and returns `leaderboard_rank` and that `src/components/home/CompetePanel.tsx` renders it as `#1`, `#2`, etc. on the Completed tab.

## Devin Secrets Needed

- `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DB_CONNECTION`)
- `/home/ubuntu/repos/GH-NEW2/.dev.vars` (`PARTYKIT_SECRET`, `NEXTJS_BASE_URL`)

## One-time environment

```bash
cd /home/ubuntu/repos/GH-NEW2
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets 2>/dev/null || true
export SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
export PARTYKIT_SECRET=$(grep '^PARTYKIT_SECRET=' .dev.vars | cut -d= -f2-)
```

`partykit/server.ts` `onBeforeConnect` reads `lobby.env.SUPABASE_URL` and `lobby.env.SUPABASE_SERVICE_ROLE_KEY`, so `SUPABASE_URL` must be exported explicitly even though `.env.secrets` only provides `NEXT_PUBLIC_SUPABASE_URL`.

## Starting the dev stack

```bash
npx concurrently -n next,party -c cyan,magenta \
  "next dev" \
  "partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=$PARTYKIT_SECRET --var NEXTJS_BASE_URL=http://localhost:3000"
```

## Driving a completed 2-player sync game

The sync game completes by sending `READY_NEXT` after the **final** round's `ROUND_COMPLETE`. A harness that creates the game and uses `CompeteWSClient` from `scripts/test/playwright/orchestrator/websocketClient.ts` should:

1. `POST /api/compete/create` with `mode: 'sync'` and `roundTimerSec` (e.g. `120`).
2. Connect two `CompeteWSClient` instances and wait for `LOBBY`.
3. Both `toggleReady(true)` and wait for `ROUND_ACTIVE` round 0.
4. For each round `0..totalRounds-1`:
   - Both `submitGuess(round, ...)`.
   - Wait for `ROUND_COMPLETE` round.
   - If it is the final round, both `readyNext(round)` and wait for `SESSION_COMPLETE`.
   - Otherwise, both `readyNext(round)` and wait for `ROUND_ACTIVE` round+1.

The previous belief that the final `submitGuess` jumps directly to `SESSION_COMPLETE` is only true for async/relax; sync requires the final `READY_NEXT`.

## Verifying the UI

- Fetch `GET /api/compete/active-games` and assert `leaderboard_rank` is a positive integer.
- Open `http://localhost:3000/home`, dismiss the welcome modal if it appears, and click the `COMPLETED` tab.
- Completed rows use `[class*="gameRow"]` and contain a rank badge with `[class*="rankBadge"]`.
- To avoid matching rows from other tabs, scope selectors to `[class*="gameRow"]:has([class*="rankBadge"])`.
- Assert the badge text is exactly `#${leaderboard_rank}` (e.g. `#1`, `#2`) and not `#—`.

## Cleaning stale test games

If earlier runs leave completed rows, the canonical tables are `sessions`, `session_players`, `round_commits`, `round_results`, and `round_events` (not `game_players`/`guesses`). Delete by `game_id` for the test player IDs.
