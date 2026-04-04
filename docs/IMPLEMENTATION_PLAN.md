# IMPLEMENTATION PLAN — GUESS-HISTORY Practice Mode

## Overview

This document provides the revised implementation roadmap based on current codebase assessment (April 2026). The architecture has evolved from the original draft plan:

**Current Architecture (Correct Direction):**
- Single authoritative `GameState` snapshot persisted via PostgreSQL (`game_sessions` table)
- Reducer-based state machine with guarded transitions (`src/core/gameEngine.ts`)
- Full-state persistence through `/api/game` and `/api/game/[gameId]` endpoints
- UI derived from state, not driving it

**Key Decisions Validated:**
- Canonical `GameState` as single source of truth
- Reducer enforces valid phase transitions
- Pure evaluation functions (testable, deterministic)
- Full-snapshot persistence (save/load entire game state)

**Key Issues to Address:**
- Scoring formulas need calibration, not architectural change
- Hint system UI dependencies need finalization
- Asset preloading for cinematic screen
- Persistence edge-case hardening

**Completed Architecture Refactors (April 2026):**
- UI orchestration extracted from `game-client.tsx` → `game-client-hooks.ts`
- Screens split into `game-client-screens.tsx`
- Shared UI parts extracted to `game-client-parts.tsx`
- Redundant derived fields removed from `GameState` (`lastRoundResult`, `summary`, `preflightPassed`)
- Selectors layer created (`game-selectors.ts`)

---

## Revised Roadmap

### Phase A — Core Loop Hardening ✅ COMPLETE (April 2026)

**Goal:** Finalize the canonical state model and reduce UI orchestration burden.

| Deliverable | Status | Location |
|-------------|--------|----------|
| Finalize `GameState` invariants | ✅ Done | `src/core/types.ts` |
| Remove redundant derived fields | ✅ Done | Removed `lastRoundResult`, `summary`, `preflightPassed` |
| Extract orchestration from `game-client.tsx` | ✅ Done | `src/app/game-client-hooks.ts` |
| Extract selectors layer | ✅ Done | `src/core/gameSelectors.ts` |
| Extract screen components | ✅ Done | `src/app/game-client-screens.tsx` |
| Extract shared UI parts | ✅ Done | `src/app/game-client-parts.tsx` |
| Formalize phase transition guards | ✅ Done | `gameReducer` already validates transitions |

**Key Changes:**
- Store canonical facts only; derive display helpers at read time
- Move lifecycle advancement logic out of React effects
- Keep reducer as sole authority on state transitions

---

### Phase B — Scoring Calibration ⏳ PENDING

**Goal:** Calibrate scoring formulas against expected gameplay outcomes.

| Deliverable | Status | Location |
|-------------|--------|----------|
| Extract scoring constants | Pending | `src/engine/constants.ts` |
| Define gold-path fixtures | Pending | Test suite |
| Define edge-case fixtures (timeout, max penalty) | Pending | Test suite |
| Calibrate `evaluateYear` formula | Pending | `src/core/rules.ts` |
| Calibrate `evaluateLocation` formula | Pending | `src/core/rules.ts` |
| Verify accuracy/XP independence | Pending | Test suite |

**Fixture Categories:**
- Perfect guess (year + location exact)
- Near miss (small year diff, small distance)
- Wrong year / right location
- Right year / wrong location
- Timeout with partial inputs
- Timeout with no inputs
- Max hint penalty impact

---

### Phase C — Playable Round UX ⏳ PENDING

**Goal:** Complete the core round loop with polished screens.

| Deliverable | Status | Location |
|-------------|--------|----------|
| Cinematic screen (5s auto-pan, skippable) | Pending | Component in `src/app/game/` |
| Guess screen (year slider + map) | Partial | Exists, needs polish |
| Result screen (manual advance) | Partial | Exists, needs polish |
| Asset preloading (next round ready) | Pending | Add to orchestration |
| Input validation (no hidden defaults) | Done | Enforced in UI |
| Manual progression only | Done | No auto-advance |

---

### Phase D — Persistence & Recovery Hardening ⏳ PENDING

**Goal:** Ensure reliable save/load and session recovery.

| Deliverable | Status | Location |
|-------------|--------|----------|
| Restore exact snapshot reliably | Partial | Works, needs edge-case tests |
| Handle stale/invalid persisted states | Pending | Add validation layer |
| Verify restart/new-session behavior | Pending | Add tests |
| Recovery flow (browser refresh mid-game) | Pending | Test and verify |

**Note:** Persistence is already implemented via `game_sessions` JSONB store. This phase is about hardening edge cases.

---

### Phase E — Optional Systems (Post-Core) ⏳ PENDING

**Goal:** Add features only after core loop is solid. Order matters.

| Priority | Feature | Reason |
|----------|---------|--------|
| E1 | Hint system UI (12 hints, dependency-aware) | Adds complexity, not needed for core loop validation |
| E2 | Settings panel (timer, auto-pan, year range) | Nice to have, not blocking |
| E3 | Session summary polish | Visual enhancement |
| E4 | Theme system (light/dark) | Visual enhancement |
| E5 | Localization (i18n) | Expansion feature |
| E6 | Mobile viewport polish (375–430px) | Optimization |
| E7 | E2E test coverage, Lighthouse >= 90 | Launch readiness |

**Do not start Phase E until Phases A–D are complete and tested.**

---

## Current State Model (`src/core/types.ts`)

```typescript
// Canonical GameState — single source of truth
type GameState = {
  gameId: string;                    // Unique session identifier
  phase: GamePhase;                  // Current lifecycle phase
  
  // Preflight (blocking checks before start)
  preflightIssues: string[];         // Blockers if any
  
  // Round progression
  currentRoundIndex: number;         // 0-based index into events
  timeRemaining: number | null;      // Seconds remaining in active round
  
  // Event pool (immutable after init)
  events: EventRecord[];             // 5 events for this session
  
  // Current guess (ROUND_ACTIVE only)
  currentGuess: GuessState;          // { year: number | null, location: LatLng | null }
  
  // Round history (canonical facts)
  roundResults: RoundResult[];       // Completed rounds
  
  // Penalties (hint system)
  penalty: PenaltyState;            // { accuracy: number, xp: number }
  
  // Transient (not persisted)
  pendingSubmission: PendingSubmission | null;
  pendingRoundResult: RoundResult | null;
};
```

## GameState Audit — Canonical vs Derived vs Transient

| Field | Keep / Change | Classification | Why |
|-------|---------------|----------------|-----|
| `gameId` | Keep | Canonical persisted | Stable session identity and route key. |
| `phase` | Keep | Canonical persisted | Authoritative lifecycle state for the whole session. |
| `preflightPassed` | ~~Remove as stored field~~ ✅ Removed | Derived | Derive from phase: preflight has passed whenever `phase !== "INIT" && phase !== "PREFLIGHT_CHECK"`. |
| `preflightIssues` | Keep | Canonical persisted | Needed to explain why startup was blocked after returning to `INIT`. |
| `currentRoundIndex` | Keep | Canonical persisted | Identifies which event is active and which round is in flight. |
| `timeRemaining` | Keep | Canonical persisted | Remaining seconds are primary round state and cannot be recomputed after hydration. |
| `events` | Keep | Canonical persisted | Immutable event set for deterministic session playback. |
| `currentGuess` | Keep | Canonical persisted | Current in-progress player input for the active round. |
| `roundResults` | Keep | Canonical persisted | Canonical completed-round history; everything summary-related should derive from this. |
| `lastRoundResult` | ~~Remove as stored field~~ ✅ Removed | Derived | Derive with `roundResults[roundResults.length - 1] ?? null`. |
| `summary` | ~~Remove as stored field~~ ✅ Removed | Derived | Derive with `summarizeRounds(roundResults)` when needed, especially for `SESSION_COMPLETE`. |
| `penalty` | Keep, but narrow scope | Canonical persisted in-round | This is real state if hints affect the current round, but it should be treated as current-round penalty, not session aggregate state. |
| `pendingSubmission` | Keep for now | Transient runtime state | Represents the locked submission payload between input lock and evaluation completion. |
| `pendingRoundResult` | Remove as stored field | Derived or eliminate | It is only an intermediate cache and can be recomputed from `currentEvent`, `currentGuess`, `currentRoundIndex`, `penalty`, and `pendingSubmission`. |

### Exact Derived Selectors Already Implemented

All selectors are now available in `src/core/gameSelectors.ts`:

- `selectHasPassedPreflight(state)` ✅
- `selectCurrentEvent(state)` ✅
- `selectLatestRoundResult(state)` ✅
- `selectSessionSummary(state)` ✅
- `selectIsSessionComplete(state)` ✅
- `selectRoundProgress(state)` ✅
- `selectCanProceed(state)` ✅
- `selectIsLastRoundResult(state)` ✅

### Recommended Next-State Shape

The current `GameState` now matches this canonical shape:

- Canonical persisted facts:
  - `gameId`
  - `phase`
  - `preflightIssues`
  - `currentRoundIndex`
  - `timeRemaining`
  - `events`
  - `currentGuess`
  - `roundResults`
  - `penalty`
  - `pendingSubmission`

- Removed from stored state (now derived):
  - ~~`preflightPassed`~~ ✅ Removed — derive via `selectHasPassedPreflight()`
  - ~~`lastRoundResult`~~ ✅ Removed — derive via `selectLatestRoundResult()`
  - ~~`summary`~~ ✅ Removed — derive via `selectSessionSummary()`

### Important Invariants

- `roundResults.length <= MAX_ROUNDS`
- `currentRoundIndex >= roundResults.length`
- `phase === "SESSION_COMPLETE"` implies `roundResults.length === MAX_ROUNDS`
- `phase === "ROUND_COMPLETE"` implies `roundResults.length >= 1`
- `pendingSubmission !== null` only during `ROUND_LOCK` and optionally `ROUND_EVALUATE`
- `timeRemaining !== null` only during `ROUND_START` or `ROUND_ACTIVE`
- `currentGuess` is meaningful only during an in-flight round (`ROUND_START`, `ROUND_ACTIVE`, `ROUND_LOCK`, `ROUND_EVALUATE`)

### Phase Transitions (Enforced in Reducer)

```
INIT → PREFLIGHT_CHECK → READY → ROUND_START → ROUND_ACTIVE → ROUND_LOCK → ROUND_EVALUATE → ROUND_COMPLETE
                                                                          |
                                                                    (next round)
                                                                          |
                                                                   ROUND_START (next)
                                                                          |
                                                                   ... (repeat 5x)
                                                                          |
                                                                   SESSION_COMPLETE
```

**Transition Guards:**
- Each action checks `state.phase` before applying changes
- Invalid transitions return unchanged state
- This is NOT "just string flags" — transitions are enforced

---

## Architecture Decisions

### Keep: Single Authoritative GameState
- One object represents entire game session
- Full snapshot persisted to PostgreSQL
- Derive all UI state from this source

### Keep: Reducer-Centered State Machine
- All transitions go through `gameReducer`
- Guards prevent invalid phase jumps
- Side effects (persistence, timers) live outside reducer

### Improve: Reduce Redundancy
Fields that could be derived instead of stored:
- `preflightPassed` → derive from `phase === 'READY'`
- `lastRoundResult` → derive from `roundResults.at(-1)`
- `summary` → derive from `roundResults` when `phase === 'SESSION_COMPLETE'`

### Improve: Move Orchestration Out of UI ✅ DONE

Current `game-client.tsx` responsibilities have been relocated:

| Responsibility | Before | After |
|----------------|--------|-------|
| Timer ticking | Inline `useEffect` | `useRoundTimer` hook |
| Lifecycle advancement | Inline `useEffect` | `useRoundResolution` hook |
| Preflight completion | Inline `useEffect` | `usePreflightPhase` hook |
| Persistence triggers | Inline `useEffect` | `useGameAutosave` hook |
| URL synchronization | Inline `useEffect` | `useGameRouteSync` hook |
| Bootstrap/hydration | Inline `useEffect` | `useGameBootstrap` hook |
| Phase-specific rendering | Large inline JSX | `game-client-screens.tsx` |
| Shared UI components | Duplicated inline | `game-client-parts.tsx` |

**Result:** `game-client.tsx` now only composes hooks and renders screens based on `state.phase`.

## `game-client.tsx` Refactor Roadmap (Completed)

### Current Responsibilities in `game-client.tsx`

Today the component owns too many concerns at once:

- Session bootstrap and hydration
- Autosave / persistence error handling
- URL synchronization
- Preflight orchestration
- Timer orchestration
- Round evaluation orchestration
- Derived selectors for UI display
- All phase-specific rendering
- Some low-level input mapping (`map click -> lat/lng`)

### Target Split of Responsibilities

#### 1. Container / Composition Layer
Keep `GameClient` as the top-level composition component only.

Responsibilities:
- create reducer state
- wire hooks together
- choose which screen component renders for current phase
- pass `state`, `dispatch`, and derived view models downward

#### 2. Session Hooks

Create separate hooks for non-visual side effects:

- `useGameBootstrap(routeGameId, dispatch)`
  - load persisted snapshot or create new game
  - expose `isBootstrapping`, `isHydrated`, `bootError`

- `useGameAutosave(state, isHydrated)`
  - persist every authoritative state change
  - expose `persistenceError`

- `useGameRouteSync(gameId, isHydrated)`
  - keep the current URL aligned with `buildGamePath(gameId)`

#### 3. Phase Orchestration Hooks

- `usePreflightPhase(state.phase, dispatch, events)`
  - when phase enters `PREFLIGHT_CHECK`, run preflight and dispatch completion

- `useRoundTimer(state.phase, dispatch)`
  - start/stop the timer interval only for `ROUND_START` and `ROUND_ACTIVE`

- `useRoundResolution(state, dispatch)`
  - when phase enters `ROUND_LOCK`, advance to evaluation
  - when phase enters `ROUND_EVALUATE`, complete the round

This keeps orchestration outside the render function while preserving the reducer as the authority.

#### 4. Selectors Layer

Create a selectors module, for example `src/core/gameSelectors.ts`.

Move these derived values out of the component:

- `currentEvent(state)`
- latest round result
- share path
- session completion flags
- last-round flag
- round progress
- preflight-passed display flag

#### 5. Screen Components

Split rendering into focused screens:

- `GameBootScreen`
- `GameBootErrorScreen`
- `GameInitScreen`
- `GamePreflightScreen`
- `GameReadyScreen`
- `RoundStartScreen`
- `RoundActiveScreen`
- `RoundProcessingScreen`
- `RoundCompleteScreen`
- `SessionCompleteScreen`

Each screen should receive only the slice of data and callbacks it needs.

#### 6. Shared View Components

Extract repeated visual blocks:

- `GameHeader`
- `PersistenceErrorBanner`
- `RoundHero`
- `GuessLocationCard`
- `GuessYearCard`
- `RoundActionsCard`
- `RoundStatusCard`
- `RoundSummaryMetrics`
- `BadgePills`

### Recommended Refactor Order ✅ COMPLETED

All refactor steps have been implemented (April 2026):

| Step | Status | Outcome |
|------|--------|---------|
| Step 1 — Extract selectors | ✅ Done | `src/core/gameSelectors.ts` created |
| Step 2 — Extract side-effect hooks | ✅ Done | `src/app/game-client-hooks.ts` created |
| Step 3 — Extract screens | ✅ Done | `src/app/game-client-screens.tsx` created |
| Step 4 — Extract shared cards | ✅ Done | `src/app/game-client-parts.tsx` created |
| Step 5 — Revisit controller boundary | N/A | Not needed — composition pattern sufficient |

### Explicit Non-Goals For This Refactor

- Do not replace `useReducer` with Zustand/Redux
- Do not change persistence architecture
- Do not change scoring formulas during this refactor
- Do not add new gameplay features while extracting responsibilities
- Do not change the reducer authority model

---

## Hard Constraints (Non-Negotiable)

| Constraint | Enforcement |
|------------|-------------|
| NO auto-submit except timeout | `SUBMIT` action checks `didTimeout` or `canSubmit()` |
| NO auto-advance rounds | `NEXT_ROUND` requires explicit user action |
| NO timer pause | Timer runs continuously from `ROUND_START` through `ROUND_ACTIVE` |
| NO partial submission | `canSubmit()` requires both year and location |
| NO round start without ready assets | Asset preloading gate before `ROUND_START` |
| NO randomness after initialization | Events selected once at session start |
| NO hidden defaults | Year slider and map marker start empty |
| NO draggable markers | Click-to-place only |
| NO XP/Accuracy coupling | Computed independently in `evaluateRound()` |

---

## Testing Strategy

### Unit Tests (Critical Path)
- `gameReducer`: All phase transitions, invalid transition rejection
- `evaluateRound`: Scoring accuracy for fixture cases
- `canSubmit`: Input validation logic
- `summarizeRounds`: Aggregation correctness

### Integration Tests
- Full round flow: start → guess → submit → result → next
- Timer expiry path
- Preflight failure path
- Persistence round-trip

### E2E Tests (Phase E)
- Complete session flow
- Browser refresh recovery
- Mobile viewport behavior

---

## Success Criteria

| Criterion | Phase |
|-----------|-------|
| Canonical `GameState` invariants finalized | A |
| Scoring formulas calibrated against fixtures | B |
| Core round loop playable without bugs | C |
| Save/load reliable across all edge cases | D |
| Optional features deferred until core solid | Ongoing |

---

## Risk Mitigation

| Risk | Current Mitigation |
|------|-------------------|
| State drift from redundant fields | Audit and derive in Phase A |
| UI orchestration complexity | Extract to hooks in Phase A |
| Scoring feels arbitrary | Fixture-based calibration in Phase B |
| Persistence edge cases | Explicit test cases in Phase D |
| Scope creep into non-core features | Strict Phase E gating |

---

## Notes

- **Do not introduce Zustand/Redux.** The current reducer pattern is sufficient.
- **Do not rewrite the state model.** Evolve it by removing redundancy, not adding abstractions.
- **Do not build features ahead of the roadmap.** Complete Phase A before starting Phase B, etc.
- **Persistence is solved.** The PostgreSQL JSONB snapshot approach is correct; harden it, don't replace it.

---

Last updated: 2026-04-02
