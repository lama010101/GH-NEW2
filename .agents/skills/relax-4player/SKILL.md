---
name: Relax 4-player async end-to-end test
description: How to run and validate the full 4-player Relax (async) compete flow, including staggered starts, leaderboards, MVP awards, and best-player per round.
---

# Relax 4-player async end-to-end test

## Devin Secrets Needed

- `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets` (Supabase credentials, `SUPABASE_DB_CONNECTION`)
- `/home/ubuntu/repos/GH-NEW2/.dev.vars` (`PARTYKIT_SECRET`)

## One-time environment

```bash
cd /home/ubuntu/repos/GH-NEW2
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets 2>/dev/null || true
export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
export PARTYKIT_SECRET=$(grep '^PARTYKIT_SECRET=' .dev.vars | cut -d= -f2-)
```

## Starting the dev stack

```bash
npx concurrently -n next,party -c cyan,magenta \
  "next dev" \
  "partykit dev --var SUPABASE_URL=$SUPABASE_URL --var SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY --var PARTYKIT_SECRET=$PARTYKIT_SECRET --var NEXTJS_BASE_URL=http://localhost:3000"
```

## Running the spec

```bash
npx playwright test --config=scripts/test/playwright/playwright.config.ts \
  scripts/test/playwright/specs/relax-4player-results.spec.ts \
  --project=chromium --retries=0
```

The HTML report will be at `/home/ubuntu/repos/GH-NEW2/playwright-report/index.html`.

## Harness gotchas

1. **Do NOT send `START_PLAYER` concurrently.** `partykit/server.ts` uses a global `startInFlight` boolean; concurrent messages are dropped. Start players in a `for...of` loop.
2. **Async Relax currently always creates 5 rounds.** `createCompeteSession` in `src/server/sessionCore.ts` forces `MAX_ROUNDS` for `mode === 'async'`. Tests must read `totalRounds` from the create response rather than relying on the requested value.
3. **Final submission lands on `ROUND_COMPLETE` for round 5.** `submitGuess` on the last round produces a normal `ROUND_COMPLETE` state for that round; the player must explicitly tap the "Next"/"Final Results" button (`readyNext`) to transition to `SESSION_COMPLETE`. Wait for `status === 'ROUND_COMPLETE' && currentRoundIndex === 4` before sending `readyNext(4)`, then wait for `status === 'SESSION_COMPLETE'`.
4. **`RoundActiveSection` "Guessed" toasts only render on the final round.** On earlier rounds unsubmitted opponents are shown with the `waiting_for` text. If asserting on non-final rounds, expect `Waiting for` but not `Guessed`.
5. **Leaderboard selectors must be scoped.** The `WhereCard` and `WhenCard` components embedded in `RoundCompleteSection` reuse `lbRow`/`lbRank`/`lbAccPill` class names. Use a selector scoped to the main leaderboard card, e.g. `[data-testid="round-complete-section"] [class*="leaderboardCard"] [class*="lbRow"]`.
6. **Cumulative accuracy uses raw per-round values.** Do not pre-round each round's accuracy before averaging; the UI computes `cumulativeAccuracy` from the raw `(location_score + time_score) / 2` values and rounds only the final average.
7. **Current-player labels differ by section.** `SessionComplete` final ranking and round breakdown append `(you)` to the display name. The MVP section uses `mvp_you` (`You`) as the whole name.
8. **Round breakdown defaults to only round 0 expanded.** Use the `roundItemOpen` class to determine whether a `roundTop` click will collapse an already-open round before asserting `bestRow`.

## Multi-context final-results gotchas

9. **Disable Chromium background throttling for multi-context Relax specs.** Background tabs are heavily throttled by default, so the `session-complete-section` may not render on the host page if it is not in the foreground. Launch Chromium with:
   ```
   --disable-background-timer-throttling
   --disable-backgrounding-occluded-windows
   --disable-renderer-backgrounding
   --disable-features=CalculateNativeWinOcclusion
   ```
   and call `await page.bringToFront()` before the final `/compete/{gameId}` navigation that asserts `SessionComplete`.

10. **Set `SUPABASE_URL` for PartyKit when `NEXT_PUBLIC_SUPABASE_URL` is the only Supabase URL exported.** Some secret files export only `NEXT_PUBLIC_SUPABASE_URL`; PartyKit's `--var SUPABASE_URL` needs an explicit value. Add `export SUPABASE_URL=${SUPABASE_URL:-$NEXT_PUBLIC_SUPABASE_URL}` to the environment before starting `partykit dev`.

## Ground truth

Authoritative numbers come from `round_results` rows for the created `game_id`. The spec template uses `pg.Client` with `SUPABASE_DB_CONNECTION` and compares UI text against DB-computed ranks, cumulative accuracy, final ranking, MVP categories, and best player per round.
