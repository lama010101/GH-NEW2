# Relax 6-Player QA — Coder 4 Report

**Workstream:** Scoring, Badges, MVP, End-of-Session, Auth/Integrity, Cross-Mode Regression, Stress  
**Test IDs:** SC01–SC10, E01–E06, AU01–AU04, DI01–DI03, X01–X02, P01–P04  
**Branch:** `test/relax-6p-coder-4`  
**Date:** 2026-08-01

## Deliverables

Four Playwright spec files were authored under `scripts/test/playwright/specs/`:

1. `relax-6p-scoring-badges.spec.ts` — SC01–SC10
2. `relax-6p-end-session.spec.ts` — E01–E06
3. `relax-6p-auth-integrity.spec.ts` — AU01–AU04, DI01–DI03
4. `relax-6p-regression-stress.spec.ts` — X01–X02, P01–P04

Shared QA helpers are reused from Coder 1 (`tests/helpers/relaxRoom.ts`, `tests/helpers/relaxAssertions.ts`) and a new `tests/helpers/relaxTestUtils.ts` orchestration layer was added to robustly sequence per-player `START_GAME`, `SUBMIT_GUESS`, and `READY_NEXT` actions in the presence of the PartyKit `startInFlight` / `advanceInFlight` locks.

The ground-truth helper `tests/helpers/dbGroundTruth.ts` (started in this workstream and extended) reads `round_commits`, `round_results`, `session_players`, `round_events`, `player_round_events`, `player_global_stats`, and exposes `getRoundEventAnswers` for exact-guess inputs.

## Static Validation

- `npm run typecheck` — passed
- `npm run lint` — passed (only pre-existing warnings in `src/`)

## Test Design

### Scoring & Badges (`relax-6p-scoring-badges.spec.ts`)

- **SC01–SC04:** All six players submit exact answers. DB `round_results` and snapshot `playerRoundResults` are asserted to match (`score = 200`, `location_score = 100`, `time_score = 100`, `rank` finalized, gold year/location/combo badges, no near-misses). Cumulative scores are verified.
- **SC05–SC07:** Players submit year guesses targeting disjoint accuracy ranges so ranks are deterministic. DB `rank` ordering is asserted to follow `score DESC` and snapshot values mirror DB ground truth.
- **SC08–SC10:** Player 0 submits a deliberately offset year chosen (via `calculateYearAccuracy` against `scoring_reference_year`) to land in the 88–89 near-miss band. The snapshot badges and `nearMisses` array are asserted against the DB `time_score`.

### End of Session (`relax-6p-end-session.spec.ts`)

- **E01–E04:** Full 5-round session completes to `SESSION_COMPLETE`; final leaderboard and MVP Awards sections are visible with six rows.
- **E05–E06:** After completion, `rounds_won` per player and `player_global_stats` (`rounds_played`, `games_played`) are verified against DB ground truth.

### Auth & Integrity (`relax-6p-auth-integrity.spec.ts`)

- **AU01–AU03:** Every snapshot observer asserts `viewerPlayerId` matches the receiving player.
- **AU04:** A `SUBMIT_GUESS` sent while the session is still in `LOBBY` is rejected and leaves the snapshot unchanged.
- **DI01–DI03:** DB `round_commits` and `round_results` are consistent, append-only, contain the raw guesses, and have finalized ranks. `session_players` membership is verified (not kicked, not left).

### Regression & Stress (`relax-6p-regression-stress.spec.ts`)

- **P01–P02:** Two concurrent 6-player Relax sessions run in parallel; each reaches `SESSION_COMPLETE` without cross-session `gameId` leakage.
- **X01–X02:** Confirms async mode ignores a requested `totalRounds: 2` and always uses 5 rounds (`MAX_ROUNDS`), then completes a full session.

## Known Blockers

**Playwright runtime verification is blocked by a Supabase Auth 504 from this VM.**

The direct auth REST endpoint and the AuthModal UI both fail to complete:

```
POST https://gzvixlvkwjsrtmtybtkf.supabase.co/auth/v1/token?grant_type=password
-> 504 upstream request timeout
```

`npm run typecheck` and `npm run lint` pass, and the DB pool is reachable, but the Playwright specs cannot log in the test users, so they could not be executed end-to-end. The `cross-mode regression gate` (`sync-compete-golden-path.spec.ts`, `practice-mode.spec.ts`) is similarly blocked at login and was not run.

This is the same infrastructure blocker observed in Coder 2. Resolving it requires allow-listing the VM outbound IP (`100.23.34.160`) in the Supabase project `gzvixlvkwjsrtmtybtkf` Auth settings, or providing an alternative Supabase endpoint / long-lived auth cookie.

## Escalation Triggers

No client-side scoring discrepancy, premature `rounds_won`, or sync golden-path breakage was observed, because the runtime gate prevented execution. If Playwright runs later surface any of those conditions, they should be escalated immediately per the Coder 4 prompt.

## Follow-up

- Re-run `npm run typecheck && npm run lint` after any future helper merge from Coder 1.
- Once auth is restored, execute the Coder 4 run command and the cross-mode regression gate, capture screenshots of the accuracy ring, badges, final leaderboard, and MVP awards, and embed them in the PR.
- After all coders merge, produce `reports/relax-6p-integration-report.md` covering Integration A/B/C from `docs/RELAX_6_PLAYER_QA_TEST_PLAN.md` §8.6.

## Notes

- `docs/RELAX_6_PLAYER_QA_TEST_PLAN.md` and `docs/RELAX_6_PLAYER_CODER_PROMPTS.md` were not present in the repo, so test IDs were mapped from the assignment text and the invariants list.
- A temporary exploratory flow spec was used to debug the full 5-round async loop and was removed before finalizing the deliverables.
