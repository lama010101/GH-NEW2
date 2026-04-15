# Operational Rules

## Core Spec References

All operations MUST comply with:
- `docs/core/EVENT_STREAM_SPEC.md` — Event stream authority
- `docs/core/PHASE_FSM_SPEC.md` — Phase transition rules
- `docs/core/DETERMINISM_SPEC.md` — Determinism guarantees

---

## DB Schema Enforcement Rules (MP-DB-RESET-ENFORCE-001)

Schema enforced baseline as of 2026-04-07. These rules are non-negotiable:

- **Schema is enforced baseline.** The 5 multiplayer tables (sessions, session_players, round_commits, round_results, round_events) are now exactly as defined in FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 and MASTER IMPLEMENTATION PLAN v3.0 Section 0.2.
- **Migrations are a mandatory gate.** Any schema change MUST be a new numbered migration file in `scripts/migrations/` applied via Supabase MCP. No ad-hoc DDL is permitted.
- **DB = Absolute Source of Truth.** No state mutation is valid without a DB write.
- **Append-only logs.** `round_commits` and `round_events` are append-only. No UPDATE on these tables.
- **Composite PKs enforce idempotency.** Duplicate submissions to `round_commits` (game_id, player_id, round_index) or `round_results` (game_id, round_index, player_id) are rejected by PK constraint.
- **round_events is required.** Every phase transition must be logged to `round_events`. Skipping this breaks deterministic replay.
- **No legacy columns.** Any column not in the spec DDL is forbidden. Do not ADD COLUMN without a migration that maps to spec authority.
- **RLS = TRUE on all 5 multiplayer tables.** Service role bypasses; authenticated users SELECT own rows only; no client writes.

## Runtime Verification Layer v4 — Execution Proof (MP-CORE-LOOP-004)

**IMPLEMENTED:** Real DB Execution Proof Harness  
**STATUS:** ACTIVE  
**FILE:** `src/server/zeroTrust.execution.test.ts`

The Execution Proof Harness provides **unforgeable verification** using REAL Supabase database:

### DB Connection Requirements (HARD)

* **Connection Method**: `SUPABASE_DB_CONNECTION` environment variable with direct PostgreSQL connection via `pg.Pool`
* **DB Target**: Real Supabase PostgreSQL (NO mocks, NO fakes, NO SQLite, NO in-memory)
* **New Connection Creation**: `getNewPoolConnection()` uses `dbPool.connect()` for cross-connection verification

### Anti-Fake Enforcement Rules

**STRICTLY FORBIDDEN:**
- Returning hardcoded success
- Bypassing verification functions (`verifyRowIntegrity`, `verifyWriteSet`, `verifyFullReplay`)
- Mocking verification functions
- Generating fake verification tokens for display
- Skipping DB reads after write
- Using in-memory values for verification
- Simulated or synthetic test data

### Required Test Scenarios

All 7 scenarios MUST be implemented and passing:

| # | Test | Expected Result | Verification |
|---|------|-----------------|--------------|
| 1 | BASELINE | PASS | Full lifecycle with all verification functions |
| 2 | PAYLOAD CORRUPTION | FAIL | `verifyRowIntegrity` detects manual UPDATE |
| 3 | MISSING WRITE | FAIL | `verifyWriteSet` detects missing round_results |
| 4 | DUPLICATE INSERT | FAIL | PK constraint + `verifyUniquenessInvariant` |
| 5 | TOKEN MISMATCH | FAIL | Wrong verification token rejected |
| 6 | REPLAY DRIFT | FAIL | `verifyFullReplay` detects modified inputs |
| 7 | DETERMINISTIC REPLAY | PASS | Exact match between stored and recomputed |

### Execution Proof Format

Every test emits unforgeable proof:

```
[DB_EXECUTION_PROOF]
test: <name>
table: <table>
primary_key: <value>
operation: INSERT | UPDATE | VERIFY | CORRUPT | REPLAY
verification_token: <uuid_from_db>
cross_connection: TRUE
result: PASS | FAIL
timestamp: <db_timestamp>
db_source: supabase
```

### Proof Requirements

1. **Token Source**: MUST come from DB (verification_token column), not manually generated
2. **Timestamp Source**: MUST come from DB (NOW() or created_at)
3. **Cross-Connection**: MUST use NEW DB connection for verification
4. **DB-Only**: All validation reads MUST come from DB, not memory

### Running the Harness

```bash
npm run test zeroTrust.execution
```

Expected output:
- Real DB writes confirmed
- Corruption applied and detected
- All failures trigger deterministically
- Replay validated with exact match
- Execution proofs present for all operations

### Verification Functions

| Function | Purpose | Cross-Connection |
|----------|---------|------------------|
| `verifyRowIntegrity()` | Full payload field comparison | YES |
| `verifyWriteSet()` | Exact row count verification | YES |
| `verifyUniquenessInvariant()` | Exactly 1 row per PK | YES |
| `verifyFullReplay()` | Recompute and compare all scores | YES |
| `verifyWriteCrossConnection()` | Basic existence check | YES |

---

## Event Stream Invariant Enforcement (MP-CORE-LOOP-006)

**IMPLEMENTED:** Strict Event Stream Validation Layer  
**STATUS:** ACTIVE  
**FILE:** `src/server/getGameState.ts`
**SPEC:** `docs/core/EVENT_STREAM_SPEC.md`

### Hard Invariants (NON-NEGOTIABLE)

1. **No unordered events** — `created_at` must be chronologically non-decreasing
2. **No skipped rounds** — Round indices must be continuous (0, 1, 2, ...) with no gaps
3. **No round regressions** — Round index cannot decrease after increasing
4. **No invalid round indices** — Reject null/undefined/NaN/negative/non-integer for gameplay events
5. **No implicit phase transitions** — Every transition MUST be explicit in event stream
6. **No inferred phases** — Phase derived ONLY from last event, never computed
7. **No input mutation** — Input array cloned + frozen at function start

**Full specification:** `docs/core/EVENT_STREAM_SPEC.md` Section 4, 7

### Error Codes (Fail-Fast)

| Code | Trigger | Example |
|------|---------|---------|
| `EVENT_ORDER_VIOLATION` | Out-of-order timestamps | Event 2 has earlier created_at than Event 1 |
| `ROUND_CONTINUITY_ERROR` | Skipped or regressed round | Round 0 → Round 2, or Round 1 → Round 0 |
| `INVALID_ROUND_INDEX` | Invalid round value | null, undefined, NaN, -1, 1.5 |
| `INVALID_PHASE_TRANSITION` | Illegal FSM transition | SESSION_COMPLETE → ROUND_STARTED |
| `MISSING_PHASE_EVENT` | Missing last event phase | Empty or corrupt event stream |

### Compliance Requirements

- ALL event stream processing MUST use `deriveStateFromEventStream()`
- NO ad-hoc event validation allowed
- NO partial stream processing (full stream required)
- NO derived phases without explicit event

---

## Runtime Verification Layer v5 — Hard Enforcement (MP-CORE-LOOP-005)

**IMPLEMENTED:** Hard DB Connection Enforcement + Transaction Isolation Proof  
**STATUS:** ACTIVE  
**FILE:** `src/server/db.ts`

### Hard Enforcement Rules (NON-NEGOTIABLE)

1. **DB is mandatory at module load** — System CANNOT start without `SUPABASE_DB_CONNECTION`
2. **No env fallback** — If env var missing → HARD CRASH (no skip, no mock)
3. **Immediate connection test** — Pool creation fires test query immediately
4. **Process exit on failure** — `process.exit(1)` if DB unreachable

### Anti-Fake Guard

```typescript
assertDbConnectionVerified() → throws if connection never verified
```

**Use at module load:**
```typescript
// This throws if DB was never connected
assertDbConnectionVerified();
```

### Cross-Connection Proof with Backend PIDs

```typescript
export type ConnectionHandle = {
  client: DbTransactionClient;
  backendPid: number;  // PostgreSQL backend process ID
  connectionId: string;
};

// Acquire separate connections with PID tracking
const connA = await acquireConnectionA(); // For writes
const connB = await acquireConnectionB(); // For verification

// PIDs MUST be different
console.log(`Write PID: ${connA.backendPid}`);
console.log(`Verify PID: ${connB.backendPid}`);
```

### Transaction Boundary Validation

```typescript
verifyTransactionIsolation(gameId, operation) → IsolationProof
```

**Proof Steps:**
1. Connection A: BEGIN, INSERT (no COMMIT)
2. Connection B: SELECT → MUST return 0 rows (isolation proven)
3. Connection A: COMMIT
4. Connection B: SELECT → MUST return 1 row (durability proven)

**Failure = PostgreSQL isolation broken**

### Execution Proof Format v2

```
[DB_EXECUTION_PROOF_v2]
test: <name>
table: <table>
primary_key: <value>
operation: INSERT | UPDATE | VERIFY | CORRUPT | REPLAY | ISOLATION
verification_token: <uuid>
cross_connection: TRUE
result: PASS | FAIL
timestamp: <db_timestamp>
db_source: supabase
db_backend_pid_a: <pid_write>      ← NEW
db_backend_pid_b: <pid_verify>      ← NEW
transaction_id: <xid>                ← NEW
commit_timestamp: <db_timestamp>     ← NEW
row_count_verified: <count>          ← NEW
isolation_proven: TRUE | FALSE        ← NEW
```

### Required Test Scenarios (9 Total)

| # | Test | Expected | Description |
|---|------|----------|-------------|
| 1 | BASELINE | PASS | Full lifecycle with all verification functions |
| 2 | PAYLOAD CORRUPTION | FAIL | `verifyRowIntegrity` detects manual UPDATE |
| 3 | MISSING WRITE | FAIL | `verifyWriteSet` detects missing round_results |
| 4 | DUPLICATE INSERT | FAIL | PK constraint + `verifyUniquenessInvariant` |
| 5 | TOKEN MISMATCH | FAIL | Wrong verification token rejected |
| 6 | REPLAY DRIFT | FAIL | `verifyFullReplay` detects modified inputs |
| 7 | DETERMINISTIC REPLAY | PASS | Exact match DB-only recompute |
| 8 | **TRANSACTION ISOLATION** | **PASS** | **Uncommitted writes NOT visible to B** |
| 9 | **HARD ENFORCEMENT** | **PASS** | **DB connection verified at module load** |

### New Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `enforceDbConnection()` | `db.ts` | Module-load DB connection enforcement |
| `assertDbConnectionVerified()` | `db.ts` | Runtime anti-fake guard |
| `acquireConnectionA()` | `db.ts` | Write connection with PID tracking |
| `acquireConnectionB()` | `db.ts` | Verify connection with PID tracking |
| `verifyTransactionIsolation()` | `db.ts` | Prove transaction boundaries |
| `emitExecutionProofV2()` | `db.ts` | Hardened proof with PIDs |

---

## Runtime Verification Layer v3 — Zero-Trust (MP-CORE-LOOP-003)

**IMPLEMENTED:** Cross-Connection Verification
**STATUS:** ACTIVE

All critical DB writes now use **cross-connection verification** — opening a NEW pool connection to verify durability.

### Functions in `src/server/db.ts`

| Function | Purpose |
|----------|---------|
| `generateVerificationToken()` | Cryptographically unique token (UUID) |
| `verifyWriteCrossConnection()` | Opens NEW connection, queries by PK, asserts existence |
| `verifyMigrationIntegrity()` | Compares expected vs applied migrations at startup |
| `assertMigrationIntegrity()` | Hard-throws if migration mismatch detected |
| `verifyDeterministicReplay()` | Loads commits from DB, verifies runtime state reproducibility |

### Cross-Connection Verification Flow

```
WRITE → COMMIT → NEW CONNECTION VERIFY → CONTINUE
                    ↓
            [VERIFY][CROSS_CONN][PASS]
                    ↓
            [VERIFY][CROSS_CONN][FAIL] → THROW
```

### Log Output Format

```
[VERIFY][CROSS_CONN][PASS] <operation> <table> — <elapsed>ms token=<token>
[VERIFY][CROSS_CONN][FAIL] <operation>: Row not found in <table> after <elapsed>ms — keys=<keys>
[VERIFY][MIGRATION][PASS] All <count> migrations applied
[VERIFY][MIGRATION][FAIL] Missing: <list>, Extra: <list>
[VERIFY][REPLAY][PASS] game_id=<id> round=<n> commits=<n>
[VERIFY][REPLAY][FAIL] Commit count mismatch: runtime=<n>, db=<n>
```

### Wrapped Write Paths (Cross-Connection Verified)

| Function | Table | Verification |
|----------|-------|--------------|
| `createCompeteSession` | `sessions` | `verifyWriteCrossConnection` AFTER commit |
| `createCompeteSession` | `session_players` (host) | `verifyWriteCrossConnection` AFTER commit |
| `joinCompeteSession` | `session_players` | `verifyWriteCrossConnection` AFTER write |
| `submitGuess` | `round_commits` | `verifyWriteCrossConnection` AFTER commit |
| `submitGuess` | `round_results` | `verifyWriteCrossConnection` + count assertion |
| `submitGuess` | — | `verifyDeterministicReplay` after round complete |

### Migration Integrity (Startup Gate)

Server startup MUST call:

```typescript
await assertMigrationIntegrity();
```

This queries `supabase_migrations.schema_migrations` and compares against expected list. Mismatch = HARD FAILURE.

### Deterministic Replay Verification

After round completion with all commits:

```typescript
await verifyDeterministicReplay(gameId, roundIndex, commitCount);
```

Verifies:
1. DB commit count matches runtime count
2. All commits have required fields (score for replay)
3. State is reconstructable from DB alone

### Failure Behavior

* Immediate `throw` with full context
* Logs include: table, keys, operation, token, elapsed time
* No retry loops
* No fallback paths

## Deterministic DB Reconstruction Layer (MP-CORE-LOOP-005)

**IMPLEMENTED:** `getGameState()` — Canonical Read Model  
**STATUS:** ACTIVE  
**FILE:** `src/server/getGameState.ts`

### Rule: ALL Reads Must Use `getGameState()`

**MANDATORY:** This function is the **ONLY read model** for game state.

**Used by:**
- Client polling endpoints
- DO recovery after restart
- Debugging / replay tools

### Compliance Requirements

| Requirement | Implementation |
|-------------|----------------|
| DB = source of truth | Pure DB reads only (no memory fallback) |
| round_events = phase authority | Phase derived from events ONLY |
| Deterministic output | Stable ORDER BY on all queries |
| No mutations | Read-only function (no side effects) |
| Fail-fast | Throws explicit error if session not found |

### State Reconstruction

```
sessions        → SessionState (config)
session_players → PlayerState[]
round_commits   → RoundState[].submissions
round_results   → RoundState[].results
round_events    → phase (authority) + events[]
```

### Phase Derivation — Deterministic Event Stream Processor

**Implementation:** `deriveStateFromEventStream()` — FULL event stream validation

**Input:** Complete ordered event list (ALL rounds) via `loadRoundEvents()`  
**Ordering Guarantee:** `ORDER BY created_at ASC, id ASC` (SQL-level)

**Validation (Single Pass):**

| Check | Invariant | Error on Violation |
|-------|-----------|-------------------|
| Global Ordering | `created_at` non-decreasing, `id` tie-break | `INVALID_EVENT_ORDER` |
| Round Continuity | Rounds must be 0, 1, 2... no gaps | `ROUND_GAP_DETECTED` |
| Phase Sequence | Strict transition map enforcement | `INVALID_PHASE_TRANSITION` |

**### Phase FSM Transition Map:

**CANONICAL SOURCE:** `docs/core/PHASE_FSM_SPEC.md` Section 3

```
SESSION_CREATED  → ROUND_STARTED | SESSION_COMPLETE
ROUND_STARTED    → GUESS_SUBMITTED | ROUND_COMPLETE
GUESS_SUBMITTED  → GUESS_SUBMITTED | ROUND_COMPLETE
ROUND_COMPLETE   → ROUND_STARTED | SESSION_COMPLETE
```

**Derivation:**
```typescript
const lastEvent = events[events.length - 1];
return {
  currentRound: lastEvent.roundIndex ?? 0,
  currentPhase: lastEvent.eventType
};
```

**Constraints:**
- NO filtered subsets — full stream validation REQUIRED
- NO fallback values — hard errors on ANY violation
- NO inference — phase derived ONLY from explicit event log

---

## Runtime Verification Layer Legacy (MP-CORE-LOOP-002)

**DEPRECATED:** Same-transaction verification replaced by cross-connection verification (MP-CORE-LOOP-003).

Original implementation used `verifyWritten()` inside transaction — now superseded.


## Reducer Integrity Rules

Removed `pendingSubmission` — reducer is strictly single-step evaluation.
No intermediate submission state exists in the model.

Operational requirements:

- All state transitions occur through `gameReducer`.
- Reducer execution remains pure and synchronous.
- `assertGameStateInvariant(nextState)` runs after every reducer execution.
- Manual submission and timeout both resolve in one reducer step.
- Submission state exists only as `currentGuess` before submit and `roundResults` after submit.
- `ROUND_COMPLETE` and `SESSION_COMPLETE` must clear `currentGuess` and set `timeRemaining` to `null`.
- Double submission remains idempotent because completed phases ignore `SUBMIT_AND_EVALUATE`.

**Practice Mode:** Client-authoritative deterministic reducer (see `src/core/gameEngine.ts`)
**Compete Mode:** Server-authoritative with DB-backed event stream (see `docs/core/EVENT_STREAM_SPEC.md`)
