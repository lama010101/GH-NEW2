# Relax 6-Player Coder 1 QA Report

**Workstream:** lobby, roster, config, independent start/pacing
**Test IDs:** L01–L14, C01–C09, S01–S08
**Branch:** `test/relax-6p-coder-1`
**Date:** 2026-08-01

## Summary

Both Playwright specs passed locally in Chromium and WebKit, covering the lobby/roster/config and independent-start/pacing surfaces for the 6-player Relax (async) mode.

- `scripts/test/playwright/specs/relax-6p-lobby.spec.ts` — L01–L14 & C01–C09
- `scripts/test/playwright/specs/relax-6p-start-pacing.spec.ts` — S01–S08
- Shared helpers: `tests/helpers/relaxRoom.ts`, `tests/helpers/relaxAssertions.ts`

## Run command

```bash
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
npx playwright test \
  --config=scripts/test/playwright/playwright.config.ts \
  scripts/test/playwright/specs/relax-6p-lobby.spec.ts \
  scripts/test/playwright/specs/relax-6p-start-pacing.spec.ts
```

> The `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` prefix was only needed to bypass strict host-library validation on the local VM; the Chromium and WebKit binaries ran successfully once validation was skipped.

## Results

```
4 passed (4.6m)
```

| # | Test | Project | Status |
|---|------|---------|--------|
| 1 | Relax 6-player lobby & config — L01–L14 & C01–C09 | chromium | passed |
| 2 | Relax 6-player lobby & config — L01–L14 & C01–C09 | webkit | passed |
| 3 | Relax 6-player independent start & pacing — S01–S08 | chromium | passed |
| 4 | Relax 6-player independent start & pacing — S01–S08 | webkit | passed |

No snapshot invariant violations were recorded.

## Key assertions exercised

- `viewerPlayerId` matches the receiving player after the first per-player `STATE_UPDATE`.
- `snapshotVersion` and `dbVersion` are monotonic; `currentRoundIndex` never regresses.
- Banned strings (`waiting for others`, `starting soon`, `players ready`) never appear.
- One player's start (`lobby-ready-btn`) transitions only that player to `ROUND_ACTIVE`; all others stay in `LOBBY`.
- `Next Round` (`data-testid="round-next-btn"`) is enabled whenever a player is in `ROUND_COMPLETE`.
- Host-only config UI is disabled for guests; timer/deadline/year range changes broadcast correctly.

## Screenshots captured

| File | Description |
|------|-------------|
| `reports/screenshots/relax-6p-lobby-roster.png` | Full 6-player roster in LOBBY with host and joined pills |
| `reports/screenshots/relax-6p-lobby-config-ui.png` | Host config UI (RELAX selected, 3-day deadline, year/round sliders) |
| `reports/screenshots/relax-6p-independent-start-host.png` | Host in `ROUND_ACTIVE` while other players are still in `LOBBY` |
| `reports/screenshots/relax-6p-independent-start-guest.png` | Guest still in `LOBBY` with host shown as `playing` |
| `reports/screenshots/relax-6p-roster-mixed-states.png` | Roster showing `finished`, `playing`, and `joined` players simultaneously |

## Notes

- The user-specified `docs/RELAX_6_PLAYER_QA_TEST_PLAN.md` and `docs/RELAX_6_PLAYER_CODER_PROMPTS.md` were not present in the repo, so coverage was mapped from `docs/RELAX_MODE_SPEC.md` and the existing Relax Playwright specs.
- Small harness reliability fixes were required in `scripts/test/playwright/fixtures/auth.ts`, `scripts/test/playwright/helpers/auth-ui.ts`, and `scripts/test/playwright/orchestrator/websocketClient.ts` to resolve TypeScript errors and Supabase/PartyKit login flakiness under 6-browser load.
