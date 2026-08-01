# Coder 3 — Relax 6-Player QA Report

**Workstream:** Timers, deadlines, disconnect/reconnect/refresh, absent/invalid inputs  
**Test plan sections:** `docs/RELAX_6_PLAYER_QA_TEST_PLAN.md` §4.7, §4.8, §4.9  
**Test IDs covered:** T01–T08, DR01–DR10, A01–A10  
**Branch:** `test/relax-6p-coder-3`

## Run command

```bash
npx playwright test \
  --config=scripts/test/playwright/playwright.config.ts \
  --project=chromium \
  scripts/test/playwright/specs/relax-6p-timer-deadline.spec.ts \
  scripts/test/playwright/specs/relax-6p-reconnect.spec.ts \
  scripts/test/playwright/specs/relax-6p-absent-invalid.spec.ts
```

## Validation

- `npm run typecheck` — passed
- `npm run lint` — passed (only pre-existing warnings)
- Playwright three-spec command — **8/8 passed** in Chromium, worker 1

## Results summary

| Test ID(s) | Spec | Focus | Result |
|---|---|---|---|
| T01 | timer-deadline | Per-round timer off by default; rounds do not auto-expire | passed |
| T02–T05, T08 | timer-deadline | Timer expiry auto-submits only that player; no pressure clamp | passed |
| T06–T07 | timer-deadline | Session deadline finalizes only unsubmitted players | passed |
| DR01–DR08 | reconnect | Tab close/reopen/refresh does not pause or regress other players | passed |
| DR09–DR10 | reconnect | Reconnect after timer expiry and after session deadline | passed |
| A01–A02, A08 | absent-invalid | Absent players score zero and can still advance | passed |
| A03–A05 | absent-invalid | Invalid UI inputs blocked; duplicate submit is a no-op | passed |
| A06–A10 | absent-invalid | Wrong-round / post-deadline API calls rejected | passed |

## Invariant assertions

Every test asserts:

- `viewerPlayerId` matches the receiving player after the first per-player view.
- `snapshotVersion` and `dbVersion` are monotonically non-decreasing; `currentRoundIndex` never regresses.
- Banned text (`waiting for others`, `starting soon`, `players ready`) does not appear.
- Per-round timer expiry auto-submits **only** the expiring player; no pressure clamp in Relax.
- Session deadline affects only the player(s) with unsubmitted rounds.
- Disconnect/reconnect does not pause the game for others.

No invariant violations were observed during the final run.

## Visual verification

| Requirement | Screenshot |
|---|---|
| Timer countdown reaching zero | `reports/relax-6p-coder-3-screenshots/relax-6p-timer-before-zero-p1.png` |
| Timer-expired result screen | `reports/relax-6p-coder-3-screenshots/relax-6p-timer-expired-result-p1.png` |
| P2 reconnect UI (still in ROUND_ACTIVE round 0) | `reports/relax-6p-coder-3-screenshots/relax-6p-dr02-p2-reconnect-round0.png` |
| Reconnect after timer expiry (ROUND_COMPLETE) | `reports/relax-6p-coder-3-screenshots/relax-6p-dr09-reconnect-after-timer-expiry.png` |
| Reconnect after session deadline (SESSION_COMPLETE) | `reports/relax-6p-coder-3-screenshots/relax-6p-dr10-reconnect-after-deadline.png` |
| Deadline-finalized result screens | `reports/relax-6p-coder-3-screenshots/relax-6p-deadline-finalized-p1-complete.png`, `relax-6p-deadline-finalized-p2-finalized.png` |
| Invalid submit blocked (no inputs) | `reports/relax-6p-coder-3-screenshots/relax-6p-invalid-submit-no-inputs.png` |
| Invalid submit blocked (year only) | `reports/relax-6p-coder-3-screenshots/relax-6p-invalid-submit-year-only.png` |
| Valid submit result | `reports/relax-6p-coder-3-screenshots/relax-6p-valid-submit-round-complete.png` |

## Notable implementation notes

- `relax-6p-reconnect.spec.ts` starts players sequentially (`for ... startPlayerViaWS`) to avoid the `startInFlight` lock in `partykit/server.ts` that can drop parallel `START_GAME` actions in Relax async mode.
- Reconnect scenarios open a fresh Playwright browser context per reconnection and re-authenticate via `loginViaAuthModal` before navigating back to `/compete/{gameId}`. This keeps the reconnect flow deterministic while still exercising server-side session resumption.
- Invalid UI-submit assertions look for the localized hint text (`Select WHERE and WHEN first`) after clicking the submit button with missing inputs.
- Deadline expiry uses the `POST /api/compete/{gameId}/finalize-deadline` route followed by per-round `/api/compete/{gameId}/round/{roundIndex}/results` inspection.

## Deliverables

- `scripts/test/playwright/specs/relax-6p-timer-deadline.spec.ts`
- `scripts/test/playwright/specs/relax-6p-reconnect.spec.ts`
- `scripts/test/playwright/specs/relax-6p-absent-invalid.spec.ts`
- `reports/relax-6p-coder-3-report.md`
- `reports/relax-6p-coder-3-screenshots/`
