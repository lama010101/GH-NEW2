# Relax 6-Player QA — Coder 2 Report

**Workstream:** Round gameplay, concurrent submit/advance, leaderboards, notifications  
**Test plan sections:** §4.4, §4.5, §4.6 (docs unavailable in repo; implemented from prompt invariants)  
**Test IDs:** G01–G11, CS01–CS06, R01–R10, N01–N03  
**Branch:** `test/relax-6p-coder-2`  
**PR:** `test(relax-6p): coder 2 — roundplay concurrency and leaderboards`  

## Deliverables

- `scripts/test/playwright/specs/relax-6p-round-play.spec.ts` — G01–G11
- `scripts/test/playwright/specs/relax-6p-concurrent.spec.ts` — CS01–CS06
- `scripts/test/playwright/specs/relax-6p-leaderboard.spec.ts` — R01–R10 and N01–N03
- `reports/relax-6p-coder-2-report.md` (this file)

## Invariant coverage

Every spec asserts the following through the shared `create6PlayerRelaxRoom` observer plus per-test `expect` calls:

- `viewerPlayerId` matches the receiving player.
- `snapshotVersion` and `dbVersion` are monotonic; `currentRoundIndex` never regresses.
- Banned text (`waiting for others`, `starting soon`, `players ready`) is absent.
- One player’s submit/advance does not change another player’s screen or `currentRoundIndex`.
- Leaderboards update live but the `Next Round` button is never disabled.
- Notifications fire only on final (5th) round completion, not per-round submits (N01–N03 marked as expected failure until the per-round toast guard is implemented — see Findings).

## Static checks

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | Passed (0 errors, pre-existing warnings in unrelated files) |
| Typecheck | `npm run typecheck` | Passed after minimal type-cast fixes in pre-existing orchestrator files (see `scripts/test/playwright/orchestrator/websocketClient.ts` and `scripts/test/playwright/fixtures/auth.ts`) |

## Local Playwright execution

**Result:** Blocked by environment — could not reach the Supabase Auth endpoint.

Symptoms:
- Direct `curl` to `https://gzvixlvkwjsrtmtybtkf.supabase.co/auth/v1/token?grant_type=password` returns `upstream request timeout`.
- `curl` to the admin create-user endpoint hangs and eventually returns `email_exists` for existing test users, then subsequent `createUser` calls via `supabase.auth.admin.createUser` raise `AuthRetryableFetchError: {}`.
- Next.js dev server later failed with `Connection terminated unexpectedly` from the DB pool.

Impact:
- Global setup (`scripts/test/playwright/fixtures/auth.ts`) cannot create/verify test users.
- `AuthModal` UI login (`scripts/test/playwright/helpers/auth-ui.ts`) times out waiting for the `sb-gzvixlvkwjsrtmtybtkf-auth-token` cookie because the auth token endpoint is unreachable from the browser.
- All six submitted specs fail at `create6PlayerRelaxRoom` login; no green screenshots could be captured.

A single DB query via `pg` to `SUPABASE_DB_CONNECTION` succeeded (`SELECT 1`), so the DB string is valid, but the public Auth REST endpoint and the Next.js app’s pooled connection are unstable from this VM.

## Code status

- The three spec files are written and type-checked.
- The `test.fail` marker on N01–N03 documents the current source behavior: `src/app/compete/[gameId]/page.tsx` renders `playerSubmittedToast` whenever `config.mode === 'async' && status === 'ROUND_ACTIVE'`, and `src/components/compete/RoundActiveSection.tsx` renders `submittedToasts` for any opponent `hasSubmitted`. Both fire on every round, not only the final round.
- Once the per-round notification guard is implemented, remove `test.fail` from the N01–N03 test and the assertions should pass.

## Reconciliation with Coder 1

`tests/helpers/relaxRoom.ts` and `tests/helpers/relaxAssertions.ts` were copied from `origin/test/relax-6p-coder-1` and not otherwise modified. Two pre-existing type errors in `scripts/test/playwright/orchestrator/websocketClient.ts` and `scripts/test/playwright/fixtures/auth.ts` were fixed so `npm run typecheck` passes; these are infra-only casts and do not change runtime behavior.

## Recommendations

1. Re-run the suite in an environment with stable Supabase Auth/DB connectivity (or with a local Supabase stack) before merging.
2. Verify that `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env.local` for `next dev` and in the CI secret store.
3. Implement the final-round-only guard for async notifications, then un-`test.fail` N01–N03.
4. Add the missing `docs/RELAX_6_PLAYER_QA_TEST_PLAN.md` and `docs/RELAX_6_PLAYER_CODER_PROMPTS.md` to main so future coders can map exact test IDs.
