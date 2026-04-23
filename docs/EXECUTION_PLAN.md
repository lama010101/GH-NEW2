# GUESS-HISTORY — AUTHORITATIVE EXECUTION PLAN

**Project:** Guess-History  
**Task ID:** MP-PLAN-001  
**Version:** 1.1  
**Created:** 2026-04-23  
**Updated:** 2026-04-23  
**Status:** ACTIVE

---

## 0. DOCUMENT AUTHORITY

Binding references:
- `docs/GUESS_HISTORY_MASTER_SPEC.md`
- `docs/core/DETERMINISM_SPEC.md`
- `docs/PROGRESS.md`
- `src/server/engine/executeCommand.ts`
- `src/server/sessionCore.ts`
- `src/app/api/compete/[gameId]/guess/route.ts`

Any conflict detected between this plan and binding references → STOP and report with exact references.

---

## 1. SYSTEM STATUS SNAPSHOT

### 1.1 Current Execution Path

```
Client guess POST
  → /api/compete/:gameId/guess
    → executeCommand({ type: "SUBMIT_GUESS", payload: input })
      → validateCommandInput(input)
      → loadCompeteSessionSnapshot(gameId, null)   // DB read only
      → deepFreeze(snapshot)
      → validateCommandState(snapshot, input)
      → handleCommand(snapshot, input)              // RETURNS UNCHANGED
      → return snapshot                             // NO WRITE OCCURRED
```

### 1.2 Real Write Path (Present but Disconnected)

```
sessionCore.submitGuess(input)
  → BEGIN
  → INSERT INTO round_commits (...)
  → appendEvent(client, gameId, "GUESS_SUBMITTED", ...)
  → computeAndWriteRoundResults(...)        // if all active submitted
  → appendEvent(client, gameId, "ROUND_COMPLETE", ...)
  → COMMIT
  → verifyRowIntegrity + verifyWriteSet + verifyFullReplay
  → return loadCompeteSessionSnapshot(gameId, playerId)
```

**Location of real write authority:** `src/server/sessionCore.ts:754-1018`

### 1.3 Connection Status

| Path | Status |
|------|--------|
| API → executeCommand | **ACTIVE** (but NO-OP) |
| API → submitGuess | **DISCONNECTED** |
| PartyKit DO → submitGuess | **UNKNOWN / UNVERIFIED** |

### 1.4 Critical Finding

**CURRENT SYSTEM IS BROKEN: WRITE PATH IS NOT USED**

Evidence:
- `src/app/api/compete/[gameId]/guess/route.ts:35-49` calls `executeCommand`, not `submitGuess`
- `src/server/engine/executeCommand.ts:32-37` — `handleCommand` returns snapshot unchanged
- `src/server/engine/executeCommand.ts:137-153` — zero INSERT statements, zero `appendEvent` calls
- `src/server/sessionCore.ts:754-1018` — real write logic exists but is unreachable from the active API path

---

## 2. ARCHITECTURE TRUTH

| Component | Role | Source of Truth | Notes |
|-----------|------|-----------------|-------|
| **PostgreSQL (Supabase)** | Persistent state | **YES** | All tables append-only or PK-updated. round_events = phase authority. |
| **sessionCore** | Write authority | **YES** | `submitGuess`, `advanceRound`, `createCompeteSession`, `joinCompeteSession`, `startCompeteSession` contain all DB INSERT/UPDATE logic. |
| **executeCommand** | Read-only validator | **NO** | Validates input + state, loads snapshot, returns it unchanged. NO DB writes. |
| **PartyKit DO** | Transport relay + timer scheduler | **NO** | Pure relay after MP-PARTYKIT-DETHRONE-003. Only in-memory state: `connections Map<connId, playerId>`. Holds `scheduleRoundTimer` / `triggerRoundExpiry` to call API. Does NOT own gameplay state. |
| **Client** | Stateless renderer | **NO** | Receives STATE_UPDATE snapshots via WS. Sends action intents only. |
| **getGameState** | Canonical read model | **YES (read-only)** | Pure deterministic reconstruction from DB. Zero mutations. |

**Authority Chain (Intended):**
```
Client intent → PartyKit DO (validate + route) → API route → sessionCore (validate + write)
  → DB write → broadcast snapshot
```

**Authority Chain (Actual):**
```
Client intent → PartyKit DO → API route → executeCommand (NO-OP) → snapshot returned
  → NO DB write → state never changes
```

---

## 3. EXECUTION PHASES (STRICT ORDER)

### PHASE 0 — Architecture Verification
Goal: Prove the system can write to DB and broadcast the result.  
Unblock: All subsequent phases.

### PHASE 1 — Authority Collapse
Goal: Delete executeCommand. All API routes call sessionCore directly. Single write path.  
Unblock: Deterministic replay validation.

### PHASE 2 — Determinism
Goal: All state changes produce identical replay from event stream.  
Unblock: Event model hardening.

### PHASE 3 — Event Model
Goal: Harden appendEvent, transitionCause, and FSM to be unforgeable.  
Unblock: Security rules.

### PHASE 4 — Security
Goal: RLS, anti-cheat, input sanitization, host verification.  
Unblock: Game loop completion.

### PHASE 5 — Game Loop
Goal: Full playable round lifecycle (lobby → start → guess → complete → advance → summary).  
Unblock: Validation harness.

### PHASE 6 — Validation
Goal: Automated end-to-end tests, replay drift detection, zero-trust verification.  
Unblock: Performance tuning.

### PHASE 7 — Performance
Goal: Connection pooling, query optimization, timer accuracy, broadcast efficiency.  
Unblock: Feature expansion.

### PHASE 8 — Features
Goal: Late join, reconnect, spectate, tournaments, AI opponents.  
Unblock: Final system proof.

### PHASE 9 — System Proof
Goal: Full deterministic reconstruction from empty DB, catastrophic recovery, load test.  
Unblock: Production release.

---

## 4. ATOMIC TASK DEFINITIONS

### Format

Each task:
- Modifies **ONE file only**
- Implements **ONE behavior change only**
- Must include: Task ID, Phase, File, Function, Before/After, Validation

---

### PHASE 0 — Architecture Verification

#### TASK-0.1: Verify API-to-sessionCore connectivity
**ID:** `MP-PLAN-0.1`  
**Phase:** 0  
**File:** `src/app/api/compete/[gameId]/guess/route.ts`  
**Function:** `POST handler`  
**Behavior:** Confirm `submitGuess` is importable and callable from the route.  
**Before:** Route calls `executeCommand` (NO-OP).  
**After:** Route calls `submitGuess` with identical input shape.  
**Validation:** Guess POST writes `round_commits` row to DB.

#### TASK-0.2: Verify PartyKit-to-sessionCore connectivity
**ID:** `MP-PLAN-0.2`  
**Phase:** 0  
**File:** `partykit/server.ts`  
**Function:** `SUBMIT_GUESS handler`  
**Behavior:** Confirm DO action handler routes to API (or directly to sessionCore).  
**Before:** DO may forward to `/api/compete/:gameId/guess` (which is NO-OP).  
**After:** DO forwards to a path that actually writes.  
**Validation:** Two-player round completes with scores persisted.

---

### PHASE 1 — Authority Collapse

#### TASK-1.1: Delete executeCommand and wire API route directly to sessionCore
**ID:** `MP-PLAN-1.1`  
**Phase:** 1  
**File:** `src/server/engine/executeCommand.ts`  
**Function:** `executeCommand` / `handleCommand`  
**Behavior:** Delete `executeCommand.ts` entirely. All callers in API routes must import and call `sessionCore` functions directly. `sessionCore.submitGuess` is the canonical write entry point — do not move its logic.  
**Decision:** LOCKED — Option B. No migration of logic into executeCommand. No new wrapper functions.  
**Before:** `executeCommand` exists and is called by API routes. It performs no DB writes.  
**After:** File does not exist. `grep -r "executeCommand" src/` returns zero matches.  
**Validation:** `grep -r "executeCommand" src/` returns zero matches. `grep -n "INSERT INTO round_commits" src/server/*.ts` shows exactly one location: `sessionCore.ts`.

#### TASK-1.2: Consolidate all DB writes under sessionCore
**ID:** `MP-PLAN-1.2`  
**Phase:** 1  
**File:** `src/server/sessionCore.ts`  
**Function:** `submitGuess`, `advanceRound`, `startCompeteSession`  
**Behavior:** Confirm all gameplay mutations flow through sessionCore exclusively. No split authority. No duplicate write paths introduced during TASK-1.1.  
**Validation:** `grep -n "INSERT INTO round_commits" src/server/*.ts` shows exactly one function path. `grep -n "INSERT INTO round_events" src/server/*.ts` shows exactly one function path.

---

### PHASE 2 — Determinism

#### TASK-2.1: Enforce deterministic event ordering in all queries
**ID:** `MP-PLAN-2.1`  
**Phase:** 2  
**File:** `src/server/getGameState.ts`  
**Function:** All load functions  
**Behavior:** Verify every query has `ORDER BY` on deterministic columns.  
**Validation:** `grep -n "ORDER BY" src/server/getGameState.ts` covers all SELECTs.

#### TASK-2.2: Lock PRNG seed contract
**ID:** `MP-PLAN-2.2`  
**Phase:** 2  
**File:** `src/server/sessionCore.ts`  
**Function:** `createCompeteSession`  
**Behavior:** Seed stored at creation NEVER changes. `fetchRandomEventsForSession` uses seed + roundIndex only.  
**Validation:** `Math.random` and `Date.now` absent from event selection.

#### TASK-2.3: Rebuild verifyFullReplay after write-path fix
**ID:** `MP-PLAN-2.3`  
**Phase:** 2  
**File:** `src/server/db.ts`  
**Function:** `verifyFullReplay`  
**Behavior:** Must pass after real writes are restored. Currently may drift because writes do not occur.  
**Validation:** `npm run test zeroTrust.execution` passes Test 6 and Test 7.

---

### PHASE 3 — Event Model

#### TASK-3.1: Harden appendEvent write-time guards
**ID:** `MP-PLAN-3.1`  
**Phase:** 3  
**File:** `src/server/eventStore.ts`  
**Function:** `appendEvent`  
**Behavior:** `CAUSE_CARRYING_EVENTS` + `isTransitionCause()` rejection is active. Ensure all entry paths use it.  
**Validation:** Invalid cause string → `INVALID_CAUSE` error, zero rows in `round_events`.

#### TASK-3.2a: Remove inline cause literals from partykit/server.ts
**ID:** `MP-PLAN-3.2a`  
**Phase:** 3  
**File:** `partykit/server.ts`  
**Function:** All cause emitters  
**Behavior:** Replace all inline cause string literals (`"player"`, `"timeout"`, `"system"`) with imports from `src/core/transitionCause.ts`.  
**Validation:** `grep -n '"player"\|"timeout"\|"system"' partykit/server.ts` returns zero matches outside comments/tests.

#### TASK-3.2b: Remove inline cause literals from sessionCore.ts
**ID:** `MP-PLAN-3.2b`  
**Phase:** 3  
**File:** `src/server/sessionCore.ts`  
**Function:** All cause emitters  
**Behavior:** Replace all inline cause string literals (`"player"`, `"timeout"`, `"system"`) with imports from `src/core/transitionCause.ts`.  
**Validation:** `grep -n '"player"\|"timeout"\|"system"' src/server/sessionCore.ts` returns zero matches outside comments/tests.

#### TASK-3.2c: Remove inline cause literals from advance route
**ID:** `MP-PLAN-3.2c`  
**Phase:** 3  
**File:** `src/app/api/compete/[gameId]/advance/route.ts`  
**Function:** All cause emitters  
**Behavior:** Replace all inline cause string literals (`"player"`, `"timeout"`, `"system"`) with imports from `src/core/transitionCause.ts`.  
**Validation:** `grep -n '"player"\|"timeout"\|"system"' src/app/api/compete/[gameId]/advance/route.ts` returns zero matches outside comments/tests.

#### TASK-3.3: Verify DB trigger trg_validate_event is live
**ID:** `MP-PLAN-3.3`  
**Phase:** 3  
**File:** Migration `017_event_validation_trigger.sql`  
**Behavior:** DB independently rejects invalid FSM transitions.  
**Validation:** Direct SQL insert of invalid transition → trigger error.

---

### PHASE 4 — Security

#### TASK-4.1: Enforce host-only start game
**ID:** `MP-PLAN-4.1`  
**Phase:** 4  
**File:** `src/server/sessionCore.ts`  
**Function:** `startCompeteSession`  
**Behavior:** `is_host=true` partial unique index enforced. Non-host start → error.  
**Validation:** Guest calling start → `403` or equivalent.

#### TASK-4.2: Audit RLS on all multiplayer tables
**ID:** `MP-PLAN-4.2`  
**Phase:** 4  
**File:** None — read-only audit, no file modification.  
**Behavior:** Verify all 5 multiplayer tables have RLS enabled and policies match DATABASE_SCHEMA_STATE.md exactly. Report any deviation. Do not modify migrations.  
**Validation:** `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('sessions','session_players','round_commits','round_results','round_events')` — all return `relrowsecurity = true`. Policy types match spec.

#### TASK-4.3: Inventory all compete API route files
**ID:** `MP-PLAN-4.3`  
**Phase:** 4  
**File:** None — investigation only, no file modification.  
**Behavior:** Run `find src/app/api/compete -name "route.ts"` and return the full list. This output will be used to define individual input sanitization tasks (4.4, 4.5, …).  
**Validation:** Full file list returned. No code changes made.

> ⚠️ Tasks 4.4+ (one per route file) will be defined after TASK-4.3 output is received.

---

### PHASE 5 — Game Loop

#### TASK-5.1: Complete playable lobby → round → result → advance flow
**ID:** `MP-PLAN-5.1`  
**Phase:** 5  
**File:** `src/app/compete/[gameId]/page.tsx`  
**Function:** `onStateUpdate` handlers  
**Behavior:** Client renders all phases: LOBBY → ROUND_ACTIVE (with timer) → ROUND_COMPLETE (with leaderboard) → SESSION_COMPLETE (with summary).  
**Validation:** Two real players complete 3-round game without refresh.

#### TASK-5.2: Implement timer expiry auto-advance
**ID:** `MP-PLAN-5.2`  
**Phase:** 5  
**File:** `partykit/server.ts`  
**Function:** `scheduleRoundTimer`, `triggerRoundExpiry`  
**Behavior:** Timer derived from `ROUND_STARTED.payload.phaseEndsAt`. On expiry, DO sends `ADVANCE_ROUND` with `cause: TIMEOUT`.  
**Validation:** Round auto-advances after `phaseEndsAt` with no player action.

#### TASK-5.3a: Implement graceful leave with grace period
**ID:** `MP-PLAN-5.3a`  
**Phase:** 5  
**File:** `src/app/api/compete/[gameId]/leave/route.ts`  
**Behavior:** Implement 5s grace period on leave. Route mutates `session_players.left_at` only — no gameplay state mutation. Reconnect within grace period cancels the leave.  
**Validation:** Player calls leave → `left_at` is null for 5s → set only if no reconnect occurs. Gameplay state unchanged.

#### TASK-5.3b: Implement reconnect cancels leave and deterministic host reassignment
**ID:** `MP-PLAN-5.3b`  
**Phase:** 5  
**File:** `partykit/server.ts`  
**Behavior:** On reconnect within 5s grace window, cancel pending leave. On host disconnect, reassign host deterministically by join order from `session_players.joined_at`.  
**Validation:** Player refreshes page mid-round → rejoins, does not lose progress. Host disconnect → next player in join order becomes host.

---

### PHASE 6 — Validation

#### TASK-6.1: Golden path regression test
**ID:** `MP-PLAN-6.1`  
**Phase:** 6  
**File:** `scripts/testGameFlow.ts` or new test  
**Behavior:** End-to-end event stream produces deterministic state.  
**Validation:** `npm run test:golden` passes.

#### TASK-6.2: Zero-trust harness restoration
**ID:** `MP-PLAN-6.2`  
**Phase:** 6  
**File:** `src/server/zeroTrust.execution.test.ts`  
**Behavior:** All 9 test scenarios pass with real DB writes.  
**Validation:** `npm run test zeroTrust.execution` — 9/9 PASS.

#### TASK-6.3: Add WS action round-trip test
**ID:** `MP-PLAN-6.3`  
**Phase:** 6  
**File:** New test file  
**Behavior:** Client sends SUBMIT_GUESS via WS → DO → API → DB → broadcast → client receives updated snapshot with `hasSubmitted=true`.  
**Validation:** Test completes in < 2s with real PartyKit dev server.

---

### PHASE 7 — Performance

#### TASK-7.1: Connection pool audit
**ID:** `MP-PLAN-7.1`  
**Phase:** 7  
**File:** `src/server/db.ts`  
**Behavior:** Pool size appropriate for expected concurrent sessions. No connection leaks.  
**Validation:** Load test 100 concurrent games, zero `timeout acquiring connection`.

#### TASK-7.2: Broadcast payload minimization
**ID:** `MP-PLAN-7.2`  
**Phase:** 7  
**File:** `partykit/server.ts`  
**Function:** `broadcastStateUpdate`  
**Behavior:** Sanitized snapshot excludes answers, internal IDs, scoring secrets.  
**Validation:** Packet capture confirms no `eventId` or correct answers in STATE_UPDATE.

#### TASK-7.3: Timer accuracy verification
**ID:** `MP-PLAN-7.3`  
**Phase:** 7  
**File:** `partykit/server.ts`  
**Function:** Timer scheduling  
**Behavior:** `phaseEndsAt` absolute timestamp prevents drift across DO restarts.  
**Validation:** Timer fires within 500ms of `phaseEndsAt`.

---

### PHASE 8 — Features

#### TASK-8.1: Late join policy
**ID:** `MP-PLAN-8.1`  
**Phase:** 8  
**File:** TBD — to be defined after Phase 5 game loop is verified.  
**Behavior:** Define and implement late-join rules (spectate only? join next round?).  
**Validation:** Documented in spec, implemented in FSM.

#### TASK-8.2: Reconnect with state catch-up
**ID:** `MP-PLAN-8.2`  
**Phase:** 8  
**File:** `partykit/server.ts`  
**Behavior:** On reconnect, client receives full snapshot immediately. No action loss.  
**Validation:** Disconnect mid-round → reconnect → UI shows current round with remaining time.

#### TASK-8.3: Reconnect UI state catch-up
**ID:** `MP-PLAN-8.3`  
**Phase:** 8  
**File:** `src/app/compete/[gameId]/page.tsx`  
**Behavior:** Client re-renders correctly from snapshot received on reconnect. No stale state displayed.  
**Validation:** Disconnect mid-round → reconnect → UI shows correct phase and remaining time.

#### TASK-8.4: Spectator mode — server enforcement
**ID:** `MP-PLAN-8.4`  
**Phase:** 8  
**File:** TBD — to be defined after Phase 5 game loop is verified.  
**Behavior:** Non-playing viewer can receive STATE_UPDATE but cannot submit guesses. Server enforces rejection.  
**Validation:** Spectator SUBMIT_GUESS → rejected with `403`. Spectator receives STATE_UPDATE correctly.

---

### PHASE 9 — System Proof

#### TASK-9.1: Catastrophic recovery test
**ID:** `MP-PLAN-9.1`  
**Phase:** 9  
**File:** New script  
**Behavior:** Kill PartyKit DO mid-round. Restart. Reconstruct state from DB. Continue game exactly.  
**Validation:** Round timer and scores identical pre/post crash.

#### TASK-9.2: Full deterministic replay from empty DB
**ID:** `MP-PLAN-9.2`  
**Phase:** 9  
**File:** `src/server/getGameState.ts`  
**Function:** `getGameState`  
**Behavior:** Given only `sessions`, `session_players`, `round_commits`, `round_results`, `round_events` → identical game state.  
**Validation:** Replay test: `deepEqual(reconstructed, original)` for 100 completed sessions.

#### TASK-9.3: Load test — 100 concurrent sessions
**ID:** `MP-PLAN-9.3`  
**Phase:** 9  
**File:** New script  
**Behavior:** 100 games, 2-4 players each, full lifecycle, zero data loss.  
**Validation:** 10,000 round_commits rows, all verifiable by `verifyFullReplay`.

---

## 5. PROGRESS TRACKING

After each atomic task completion, update:
- `docs/PROGRESS.md` — add row to log table
- This file — mark task `[x] DONE` with date

### Current Phase
**PHASE 0 — Architecture Verification** (IN PROGRESS)

### Completed Tasks
- [ ] TASK-0.1
- [ ] TASK-0.2

### Blocked Tasks
None.

---

## 6. LOCKED RULES (CTO Enforcement)

These are invariant across all phases. No task may violate them.

| Rule | Violation = FAIL |
|------|------------------|
| `[SNAPSHOT-UNIQUE]` | ONE snapshot builder: `loadCompeteSessionSnapshot()` → `getGameState()` |
| `[TIMER-DETERMINISM]` | `phaseEndsAt` = `phaseStartAt + duration`, stored in `round_events.payload` |
| `[LEAVE-MEMBERSHIP-ONLY]` | `/leave` mutates `session_players.left_at` only, never gameplay state |
| `[TRANSITION-CAUSE]` | Domain-only contract in `src/core/transitionCause.ts`. UI/transport concerns forbidden. |
| `[CAUSE-WRITE-TIME]` | `appendEvent` enforces: `eventType ∈ CAUSE_CARRYING_EVENTS` → `payload.cause` must pass `isTransitionCause()` |
| `[SHARED-CONTRACTS]` | Any domain type crossing Next.js/PartyKit boundary MUST live in `src/core/*` |
| `[NO-DB-READ-AFTER-WRITE]` | API-returned snapshot is the write result. No separate DB read. |
| `[NO-DUAL-WRITES]` | Only sessionCore writes to DB for gameplay actions. No client direct writes. executeCommand must not exist. |
| `[ONE-FILE-PER-TASK]` | Every atomic task modifies exactly one file. Multi-file changes must be split. |

---

END OF EXECUTION PLAN
