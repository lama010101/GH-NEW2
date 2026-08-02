PROJECT: Guess-History (lama010101/GH-NEW2)
TASK ID: MP-PLAN-PROTECTEDBASELINE-RELAXPRACTICE-001
TASK TITLE: Plan protected-baseline regression guards for Relax and Practice modes

## 1. Executive summary
Extend the existing `sync-compete` pre-push baseline into a **mode-aware baseline** that covers Rush, Relax, and Practice. The core rule is:

> Any file that is on the critical path of **all three modes** must trigger **all three** golden-path specs. Mode-specific files trigger only the relevant spec(s).

Relax already has a partial spec (`relax-start-roster-golden-path.spec.ts`, S1–S7). Practice has a broad edge-case spec (`practice-mode.spec.ts`) but **no dedicated golden-path spec**. This plan lists the file overlap map, proposed golden-path scenarios, manifest/hook design, and a phased rollout.

---

## 2. File overlap map (read-only inventory)

### 2.1 Files in ALL THREE modes — strictest guard
These files are shared by Rush, Relax, and Practice and must run all three golden-path specs on change.

**Server / core shared**
- `src/server/sessionCore.ts`
- `src/server/getGameState.ts`
- `src/server/eventStore.ts`
- `src/server/eventStream.ts`
- `src/server/engine/transition.ts`
- `src/server/events.ts`
- `src/server/db.ts`
- `src/server/partykitAuth.ts`
- `src/core/types.ts`
- `src/core/competeTypes.ts`
- `src/core/competeApi.ts`
- `src/core/competeUtils.ts`
- `src/core/rules.ts`
- `src/core/accuracyColor.ts`
- `src/core/rank.ts`
- `src/core/transitionCause.ts`
- `src/core/identity.ts`
- `src/core/supabaseBrowser.ts`
- `src/core/supabaseServer.ts`

**Shared gameplay UI (`src/components/compete/*`)**
- `src/components/compete/RoundActiveSection.*`
- `src/components/compete/RoundCompleteSection.*`
- `src/components/compete/SessionComplete.*`
- `src/components/compete/WhereCard.*`
- `src/components/compete/WhenCard.*`
- `src/components/compete/RainbowRing.*`
- `src/components/compete/BadgePopup.*`
- `src/components/compete/PlayerAvatar.*`
- `src/components/compete/RatingControl.*`
- `src/components/compete/InlineImageBadge.*`

**Other shared UI**
- `src/components/GameMap.*`
- `src/components/YearPicker.*`
- `src/components/HintModal.*`
- `src/components/AccuracySuffix.*`
- `src/components/NotificationBell.*`
- `src/components/NavModal.*`
- `src/components/layout/TopBar.*`

**API routes used by all modes**
- `src/app/api/compete/[gameId]/route.ts`
- `src/app/api/compete/[gameId]/all-results/route.ts`
- `src/app/api/compete/[gameId]/round/[roundIndex]/results/route.ts`
- `src/app/api/geocode/reverse/route.ts`
- `src/app/api/geocode/search/route.ts`

**Home / mode entry**
- `src/app/home/page.tsx` (orchestrates Practice and Compete panels)

### 2.2 Files in Rush + Relax only (multiplayer / PartyKit path)
- `partykit/server.ts`
- `src/core/competeWebSocket.ts`
- `src/hooks/useCompeteSocket.ts`
- `src/hooks/useCompeteTimer.ts`
- `src/app/compete/[gameId]/page.tsx`
- `src/app/compete/page.tsx`
- `src/components/compete/LobbySection.*`
- `src/components/home/CompetePanel.*`
- `src/server/partykitAuth.ts` *(also used by Relax-only `start-player`, but its real role is PartyKit auth)*

**Most `src/app/api/compete/*` routes**, including:
- `src/app/api/compete/create/route.ts`
- `src/app/api/compete/join/route.ts`
- `src/app/api/compete/[gameId]/start/route.ts`
- `src/app/api/compete/[gameId]/ready/route.ts`
- `src/app/api/compete/[gameId]/ready-next/route.ts`
- `src/app/api/compete/[gameId]/guess/route.ts`
- `src/app/api/compete/[gameId]/advance/route.ts`
- `src/app/api/compete/[gameId]/join/route.ts`
- `src/app/api/compete/[gameId]/leave/route.ts`
- `src/app/api/compete/[gameId]/kick/route.ts`
- `src/app/api/compete/[gameId]/cancel-invite/route.ts`
- `src/app/api/compete/[gameId]/timer/route.ts`
- `src/app/api/compete/[gameId]/results-timer/route.ts`
- `src/app/api/compete/[gameId]/year-range/route.ts`
- `src/app/api/compete/[gameId]/sub-mode/route.ts`
- `src/app/api/compete/[gameId]/era-selection/route.ts`
- `src/app/api/compete/[gameId]/region-selection/route.ts`
- `src/app/api/compete/[gameId]/complete/route.ts`
- `src/app/api/compete/[gameId]/snapshot/route.ts`
- `src/app/api/compete/[gameId]/active-games/route.ts`

### 2.3 Files in Relax only
- `src/app/api/compete/[gameId]/start-player/route.ts`
- `src/app/api/compete/[gameId]/advance-player/route.ts`
- `src/app/api/compete/[gameId]/next-expiry/route.ts`
- `src/app/api/compete/[gameId]/player-absent/route.ts`
- `src/app/api/compete/[gameId]/finalize-deadline/route.ts`

### 2.4 Files in Practice only
- `src/app/practice/page.tsx`
- `src/app/practice/[gameId]/page.tsx`
- `src/app/api/practice/create/route.ts`
- `src/app/api/practice/[gameId]/start/route.ts`
- `src/app/api/practice/[gameId]/guess/route.ts`
- `src/app/api/practice/[gameId]/advance/route.ts`
- `src/components/practice/PracticeSettingsModal.*`
- `src/components/practice/PracticeResumeModal.*`
- `src/components/practice/practiceSettings.ts`
- `src/components/home/PracticePanel.*`

### 2.5 Notable omissions / edge cases
- `src/app/daily/*` is outside scope but shares `RoundActiveSection`/`RoundCompleteSection`; those are already covered in the shared list.
- `src/i18n/*.json` is excluded from the baseline unless a test explicitly asserts on text strings; use `data-testid`s in the specs to avoid i18n churn.
- `src/middleware.ts` is currently non-functional (root-level, ignored by Next.js) and out of scope.

---

## 3. Relax golden-path scenario list

The original `MP-PLAN-RELAX-GOLDEN-PATH-001` document could not be located in the repo, docs, or conversation artifacts; the list below is a fresh proposal that reconciles with the existing `relax-start-roster-golden-path.spec.ts` (S1–S7) and adds the missing critical coverage.

Spec file: `scripts/test/playwright/specs/relax-golden-path.spec.ts` (rename/extend the existing `relax-start-roster-golden-path.spec.ts`).

**Configuration**
- 3 players: Host, Guest B, Guest C.
- Mode `async`, 5 rounds, round timer OFF.
- 3 separate browser contexts + per-context read-only WS observers.
- Assertions combine DOM state and per-player `CompeteWSClient` snapshots.

**Scenarios**
1. **A0 — Preflight**
   - Supabase reachable.
   - No `room.broadcast()` in `partykit/server.ts` (KC-002).
   - Relevant KC guards preserved.
2. **A1 — Lobby formation**
   - Host creates async session; 3 players navigate to `/compete/{gameId}`.
   - All 3 reach `LOBBY` with 3 players.
   - Roster shows Joined for all; no banned “waiting for others”/“starting soon” text.
3. **A2 — Host independent start**
   - Host clicks `lobby-ready-btn` (Relax shows “Start My Game”).
   - Only Host transitions to `ROUND_ACTIVE` round 0.
   - Guest B and Guest C remain in `LOBBY`; their WS snapshots unchanged.
   - Roster pill for Host becomes “playing”; B and C remain “joined”.
4. **A3 — Guest B independent start (regression guard for guest-start pull-in bug)**
   - Guest B starts after a delay.
   - B enters `ROUND_ACTIVE` round 0; Host remains unaffected; C stays in lobby.
   - No spillover; no “waiting for others” text.
5. **A4 — Start-inFlight / double-start guard**
   - Host or Guest sends a second `START_PLAYER` while already active.
   - Server rejects with `START_PLAYER only allowed in LOBBY phase` and state is unchanged.
6. **A5 — Staggered round advancement and partial leaderboard**
   - Host submits round 0 and advances to round 1.
   - Guest B is still on round 0; B’s screen must not change when Host submits/advances.
   - Host sees ROUND_COMPLETE with leaderboard containing only Host.
   - Guest B submits round 0; B’s leaderboard now shows both Host and B.
   - “Next” button remains enabled for both A and B at all times (no group gating).
7. **A6 — One player finishes while others are mid-session**
   - Fast-forward Host through all 5 rounds to `SESSION_COMPLETE`.
   - Guest B is on round 2; Guest C is still in lobby.
   - Roster shows `finished` (Host), `playing` (B), `joined` (C) simultaneously.
   - Host final screen has correct cumulative score.
8. **A7 — Late joiner after first player finished**
   - Guest C starts after Host has finished.
   - C enters `ROUND_ACTIVE` round 0 and can play independently.
   - Session deadline is the global deadline (no per-player extension).
9. **A8 — Reconnect / identity persistence**
   - Mid-session, Guest B refreshes the browser.
   - B reconnects, re-joins the session at the correct round/score, identity preserved.
   - WS resyncs to the correct per-player snapshot.
10. **A9 — Session complete with divergent scores**
    - All 3 players finish at different times.
    - Final leaderboard for any player shows all three rows with correct per-round and cumulative scores.
    - No crash, no stale state, no cross-player leak.
11. **A10 — Banned text never appears**
    - Assert after every phase: body text does not contain “waiting for others”, “starting soon”, or “players ready”.

---

## 4. Practice golden-path scenario list

Practice has **no dedicated golden-path spec**. The existing `practice-mode.spec.ts` is a broad edge-case suite and is too heavy for the pre-push gate. Proposed new spec: `scripts/test/playwright/specs/practice-golden-path.spec.ts`.

**Configuration**
- Single player, authenticated.
- Default settings (all eras, timer OFF).
- Use `data-testid`s; no text-string assertions.

**Scenarios**
1. **P0 — Auth / entry**
   - Unauthenticated POST to `/api/practice/create` returns 401/307 and creates no session.
2. **P1 — Home → settings → start**
   - From `/home`, click Practice tile → `PracticeSettingsModal` opens.
   - Default state: timer OFF, all eras selected.
   - Click Start → navigate to `/practice/{gameId}` and auto-start to `ROUND_ACTIVE` round 0.
3. **P2 — Full 5-round solo flow**
   - Set year and location each round, submit, reach `ROUND_COMPLETE`, click Next.
   - After round 5, click Next → `SESSION_COMPLETE`.
   - Final screen shows total XP, average accuracy, round breakdown.
4. **P3 — Play Again**
   - Click Play Again; a **new** `/practice/{gameId}` is created with the same settings.
   - New game starts at `ROUND_ACTIVE` round 0 (not a continuation of the previous session).
5. **P4 — Resume vs new-game modal**
   - Start a game, navigate away before finishing.
   - Return to `/home` and click Practice tile.
   - `PracticeResumeModal` appears with “Resume game in progress” and “Create new game”.
   - Resume → returns to the exact round/state of the in-progress session.
   - Create new → removes `gh_practice_game_{playerId}` from localStorage and opens settings.
6. **P5 — Direct-URL navigation**
   - Navigating directly to `/practice` auto-creates a session and redirects to `/practice/{gameId}`.
   - Navigating to `/practice/{bogus-id}` renders an error/no-match screen without a Next.js application crash.
7. **P6 — Next-button `connectionState` regression guard**
   - In `ROUND_COMPLETE`, assert `round-next-btn` is **not** disabled due to `connectionState` (Practice passes `connectionState="OPEN"` to `RoundCompleteSection`).
   - Click Next and verify `ROUND_ACTIVE` round N+1 is reached.
   - Regression: any change that makes the Next button depend on a real WS `connectionState` will disable it in Practice and fail this scenario.
8. **P7 — Network failure during resume**
   - Block or 500 the `/api/compete/{gameId}?playerId=...` resume request.
   - `/practice/{gameId}` must surface a non-crash error and show the 10s escape hatch.
   - Restore network, retry, and confirm the session resumes.
9. **P8 — Settings persistence**
   - Toggle timer ON, set a non-default value, deselect all but one era, start.
   - `localStorage.practice_settings` stores the chosen values.
   - Re-open settings modal; values are restored.

---

## 5. Manifest / hook design

### 5.1 Recommended shape: single YAML manifest
Use **one file** `scripts/dev/protected-baseline-manifest.yaml` with mode-tagged sections.

Why one file vs separate manifests:
- Makes overlap explicit. A file in the `shared` section is immediately visible as all-three.
- Avoids duplicating shared entries across `rush.txt`, `relax.txt`, `practice.txt`, `shared.txt`.
- Easy to review in a single PR diff.

Structure:

```yaml
shared:
  patterns:
    - "src/server/sessionCore.ts"
    - "src/server/getGameState.ts"
    - "src/components/compete/RoundActiveSection.*"
    - "src/app/api/compete/[gameId]/route.ts"
    # ... all files from §2.1
  specs:
    - sync-golden
    - relax-golden
    - practice-golden

rush:
  patterns:
    - "partykit/server.ts"
    - "src/hooks/useCompeteSocket.ts"
    - "src/app/api/compete/[gameId]/start/route.ts"
    # ... other §2.2 files
  specs:
    - sync-golden

relax:
  patterns:
    - "src/app/api/compete/[gameId]/start-player/route.ts"
    - "src/app/api/compete/[gameId]/advance-player/route.ts"
    # ... other §2.3 files
  specs:
    - relax-golden

practice:
  patterns:
    - "src/app/practice/**"
    - "src/app/api/practice/**"
    - "src/components/practice/**"
    - "src/components/home/PracticePanel.*"
    # ... other §2.4 files
  specs:
    - practice-golden
```

### 5.2 Hook algorithm
1. `git diff --name-only` between `@{push}`/`origin/main` and `HEAD`.
2. For each changed file, match against all patterns in the YAML.
3. Collect the union of `spec` names.
4. If `shared` is in the union, run all three `sync-golden`, `relax-golden`, `practice-golden`.
5. Otherwise run only the collected mode specs.
6. For each selected spec:
   - Run the appropriate liveness script (`check-compete-stack.sh` for Rush/Relax; `check-nextjs-server.sh` for Practice-only).
   - Run `npx playwright test --config=scripts/test/playwright/playwright.config.ts --project=<spec-name>`.
7. If any spec fails, block the push.

### 5.3 Performance guardrail
A change to a purely mode-specific file (e.g. `start-player/route.ts` or `PracticeSettingsModal.tsx`) runs only that mode’s spec. A change to a shared core/component file runs all three — this is intentional and is exactly what the recent Practice `connectionState` regression proved is needed.

---

## 6. Phase-in sequence

Following the prior ruling for Relax (manual-run first, pre-push wire only after ~1 week stable), apply the same caution to Practice’s brand-new spec.

1. **Spec implementation**
   - Extend/relax `relax-start-roster-golden-path.spec.ts` into `relax-golden-path.spec.ts` covering A1–A10.
   - Create `practice-golden-path.spec.ts` covering P1–P8.
   - Add `relax-golden` and `practice-golden` projects to `scripts/test/playwright/playwright.config.ts` (mirroring `sync-golden`, 5-min timeout, retries 0).

2. **Manual burn-in (~1 week)**
   - Run each new spec manually at least once per day and after any core change:
     - `npx playwright test --project=relax-golden`
     - `npx playwright test --project=practice-golden`
   - Log flaky timing issues and adjust waits/assertions.
   - Do **not** add to `.husky/pre-push` yet.

3. **Manifest / hook rollout**
   - After manual stability, add `protected-baseline-manifest.yaml` and update `.husky/pre-push`.
   - Keep the existing `scripts/dev/sync-compete-protected-files.txt` as the `rush` section or migrate it into the YAML; either is acceptable as long as Rush coverage is preserved.

4. **Post-wire monitoring**
   - For the first 7–10 pushes after enabling the hook, watch for false positives.
   - If a non-obvious shared file keeps triggering all three specs, either move it to a more precise mode section or add a dedicated lightweight regression test rather than removing it from the manifest.

---

## 7. Open questions / CTO decisions needed
1. Should the existing `scripts/dev/sync-compete-protected-files.txt` be kept as a legacy Rush manifest, or folded into the new YAML under the `rush` section?
2. Is a 5-minute timeout per project acceptable for shared-file changes that run all three specs (~15 min total)?
3. Should `practice-golden` be allowed to run with `retries: 1` during manual burn-in and switch to `retries: 0` only when wired to pre-push?

TASK REF: MP-PLAN-PROTECTEDBASELINE-RELAXPRACTICE-001 — Guess-History