---
name: hint-rebalance-testing
description: How to end-to-end test the Practice round Hints modal, hint tier rates, cost-pill colors, and round scoring penalties in the GH-NEW2 Next.js app.
---

## When to use

Use when a PR changes hint tier penalty rates, hint modal sorting, cost-pill coloring, or scoring penalty formulas and you need to verify the changes in a live Practice round.

## Devin secrets needed

- `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets`
- `/home/ubuntu/repos/GH-NEW2/.dev.vars` (for `PARTYKIT_SECRET` if testing compete/multiplayer)

For Practice rounds, only the env secrets file is required.

## One-time environment

```bash
cd /home/ubuntu/repos/GH-NEW2
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
export DISPLAY=:0
export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
```

## Start the dev server

For Practice rounds, PartyKit is **not** required. Only `next dev` needs to be running:

```bash
npx next dev
```

If port 3000 is occupied by a stale `next-server` process, kill it before restarting:

```bash
pkill -f 'next-server'
```

## Test user

The standard test account is:

- Email: `gh-test-player-1@test.guess-history.com`
- Password: `TestPass123!`

When using `@supabase/supabase-js` from Node 20, import `ws` and pass `realtime: { transport: ws }` to `createClient` or you will get a "Node.js 20 detected without native WebSocket support" error.

## Useful browser / DOM selectors

- Hints button: `[data-testid="round-hints-btn"]`
- Hints modal: `[role="dialog"][aria-modal="true"]`
- Cost-pill element: `[class*="costPill"]` (also carries one of `costG`, `costY`, `costO`, `costR`)
- Modal total penalty values: `[class*="axisVal"]` (When then Where) and `[class*="totalBig"]`
- Round active section: `[data-testid="round-active-section"]`
- Round complete section: `[data-testid="round-complete-section"]`
- Round complete mini XP: `[class*="miniXpVal"]`
- Round complete Hints Used card: `[class*="hintsCard"]`
- Round complete total XP: `[class*="totalXpVal"]`

Many buttons (Play PRACTICE, round action buttons, hints button) have CSS pulse/glow animations, so Playwright `click()` may fail the stability check. Use `{ force: true }` on those clicks.

## Quick verification flow

1. Authenticate via Supabase password grant and inject the `sb-<project-ref>-auth-token` cookie.
2. Navigate `/home` → click **Play PRACTICE** → click **Start Practice**.
3. Wait for `/practice/<gameId>` with `[data-status="ROUND_ACTIVE"]`.
4. Click the Hints button.
5. Verify the When and Where tab rows read `−20%, −30%, −40%, −50%, −50%` top-to-bottom and that Decade/Region appear before Visual Clues in the 50% pair.
6. Verify cost-pill classes: `costY` for 20%, `costO` for 30/40%, `costR` for 50%.
7. Purchase one cheap (−20%) and one expensive (−50%) hint from different dimensions.
8. Verify the modal total penalty strip shows When/Where values summing to the total.
9. Submit a year and location guess.
10. Wait for RoundComplete and compare `time_score`, `location_score`, `score` from `round_results` against `evaluateRound`/`applyHintPenalty` from `src/core/rules.ts`.

## Authoritative data sources

- Hint tier rates in the UI: `src/components/HintModal.tsx` (`TIER_PENALTIES`)
- Authoritative backend penalty rates: `src/server/sessionCore.ts` (`TIER_PENALTY_RATE`)
- Scoring formulas: `src/core/rules.ts` (`applyHintPenalty`, `evaluateRound`)
- Round-complete hint breakdown UI: `src/components/compete/RoundCompleteSection.tsx`

## Database queries for verification

Round event IDs are stored in the `SESSION_CREATED` event payload:

```sql
SELECT (payload->'eventIds')::jsonb AS event_ids
FROM round_events
WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
ORDER BY id ASC LIMIT 1;
```

Submitted penalty rates, guess, and hints used:

```sql
SELECT year_guess, location_lat, location_lng, hints_used,
       acc_penalty_when_rate, acc_penalty_where_rate
FROM round_commits
WHERE game_id = $1 AND round_index = 0 AND player_id = $2;
```

Final scores:

```sql
SELECT score, location_score, time_score, distance_km, year_diff
FROM round_results
WHERE game_id = $1 AND round_index = 0 AND player_id = $2;
```

## Common pitfalls

- A standalone Playwright/TS script placed in `/tmp` cannot resolve `playwright` from repo `node_modules`. Put the temporary script in the repo root and run it with `npx tsx <script>`.
- The `%` character in the RoundComplete Hints Used card is rendered in a separate `<span>`, so `innerText` returns `−20\n%` rather than `−20%`. Allow that split when parsing.
- If you import `evaluateRound` from `src/core/rules.ts`, ensure the temporary script is inside the repo so relative TypeScript imports resolve.
