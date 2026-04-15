# Backend Architecture (v5 — Hard-Enforced Real DB Execution)

**TASK:** MP-CORE-LOOP-005  
**STATUS:** IMPLEMENTED  
**PREVIOUS:** MP-CORE-LOOP-004 (Execution Proof Layer)

---

## 🔴 NON-NEGOTIABLE FOUNDATION

### Authority Model (HARD)

* **Postgres DB = Absolute Source of Truth**
* **Append-only tables = Canonical history**
* **PartyKit DO = Deterministic executor ONLY**
* **Client = Stateless renderer**

Derived from MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE v3.0 Section 0.1.

---

## 🔴 CORE INVARIANT (CRITICAL)

> **NO DB WRITE = NO STATE CHANGE**

This is not conceptual. It is enforced at runtime.

* Any state transition MUST be backed by a verified DB write
* Any in-memory mutation without DB persistence = INVALID
* Any failure to verify persistence = HARD CRASH
* Any missing execution proof = INVALID VERIFICATION

---

## 🔒 EXECUTION PROOF LAYER v2 (HARD-ENFORCED — MP-CORE-LOOP-005)

### Hard DB Connection Enforcement

**CRITICAL:** System CANNOT start without real Supabase DB connection.

```typescript
// Module load — immediate connection test
enforceDbConnection() → throws if SUPABASE_DB_CONNECTION missing
assertDbConnectionVerified() → throws if connection never verified
```

**Anti-Fake Guarantees:**
- NO env fallback logic
- NO "if missing → skip" 
- NO mock mode
- Immediate `process.exit(1)` on connection failure

### Cross-Connection Proof with Backend PIDs

```typescript
export type ConnectionHandle = {
  client: DbTransactionClient;
  backendPid: number;      // PostgreSQL backend process ID
  connectionId: string;
};

// Acquire with PID logging
const connA = await acquireConnectionA(); // Write connection
const connB = await acquireConnectionB(); // Verify connection
// PIDs MUST be different
```

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
db_backend_pid_a: <pid_write>
db_backend_pid_b: <pid_verify>
transaction_id: <xid>
commit_timestamp: <db_timestamp>
row_count_verified: <count>
isolation_proven: TRUE | FALSE
```

### Transaction Boundary Validation

```typescript
verifyTransactionIsolation(gameId, operation) → IsolationProof
```

**Proves:**
1. Uncommitted writes visible to writer (Connection A) — YES
2. Uncommitted writes visible to reader (Connection B) — NO (isolation)
3. Committed writes visible to writer — YES
4. Committed writes visible to reader — YES (durability)

**Failure = system isolation broken**

---

## 🔒 EXECUTION PROOF LAYER v1 (MP-CORE-LOOP-004)

### Unforgeable Proof Format

Every critical operation produces a `DB_EXECUTION_PROOF` block:

```
[DB_EXECUTION_PROOF]
test: <test_name>
table: <table_name>
primary_key: <value>
operation: INSERT | UPDATE | VERIFY | CORRUPT | REPLAY
verification_token: <uuid_from_db>
cross_connection: TRUE
result: PASS | FAIL
timestamp: <db_timestamp>
db_source: supabase
details: <context>
```

### Proof Requirements (MANDATORY)

1. **Token Source**: verification_token MUST originate from DB logic (verification_token column), NOT generated manually for display
2. **Timestamp Source**: timestamp MUST come from DB (NOW() or created_at), NOT local system time
3. **Cross-Connection Proof**: cross_connection MUST use NEW DB connection via `getNewPoolConnection()`
4. **No Fake Layers**: No hardcoded success, no mocked verification, no stubbed DB functions

### Anti-Fake Enforcement

The following are **STRICTLY FORBIDDEN**:

* Returning hardcoded success
* Bypassing verification functions
* Mocking `verifyWriteCrossConnection` / `verifyRowIntegrity`
* Generating fake verification tokens
* Skipping DB reads after write
* Using in-memory values for verification

---

A database write is considered **VALID** only if ALL conditions are met:

1. Transaction is **COMMITTED**
2. Row is observable from a **NEW, independent DB connection**
3. Row is retrievable via deterministic identifiers (PK or equivalent)

### Explicit Rejections

The following are **NOT valid verification**:

* Same-transaction reads
* Same-connection reads
* ORM-returned objects
* Cached values
* In-memory assumptions
* Fake proof blocks

### Enforcement Rule

> If a write cannot be verified cross-connection → THROW  
> If execution proof is missing → FAIL

---

## � CORE SPEC REFERENCES

All backend implementation MUST reference:
- **Event Stream:** `docs/core/EVENT_STREAM_SPEC.md`
- **Phase FSM:** `docs/core/PHASE_FSM_SPEC.md`
- **Determinism:** `docs/core/DETERMINISM_SPEC.md`

---

## �🔍 ZERO-TRUST VERIFICATION LAYER (MP-CORE-LOOP-003 + MP-CORE-LOOP-004)

### Implementation: `src/server/db.ts`

```typescript
// Token generation for write tracking
export function generateVerificationToken(): string

// Cross-connection verification — opens NEW pool connection
export async function verifyWriteCrossConnection(
  table: string,
  whereClause: string,
  params: unknown[],
  operation: string,
  keys: Record<string, string | number>,
  token?: string
): Promise<VerificationResult>

// Zero-Trust v2.0 — Full payload verification
export async function verifyRowIntegrity(
  table: string,
  expectedRow: Record<string, unknown>,
  whereClause: string,
  whereParams: unknown[],
  operation: string,
  token?: string
): Promise<RowIntegrityResult>

// Zero-Trust v2.0 — Write-set verification
export async function verifyWriteSet(
  operation: string,
  expectations: WriteSetExpectation[],
  token?: string
): Promise<WriteSetResult>

// Zero-Trust v2.0 — Uniqueness invariant
export async function verifyUniquenessInvariant(
  table: string,
  constraintFields: string[],
  whereClause: string,
  whereParams: unknown[],
  operation: string,
  token?: string
): Promise<UniquenessResult>

// Zero-Trust v2.0 — Full deterministic replay
export async function verifyFullReplay(
  gameId: string,
  roundIndex: number,
  event: EventRecord,
  operation: string,
  token?: string
): Promise<FullReplayResult>

// Migration integrity check — server startup gate
export async function verifyMigrationIntegrity(): Promise<MigrationStatus>
export async function assertMigrationIntegrity(): Promise<void>

// Deterministic replay verification
export async function verifyDeterministicReplay(
  gameId: string,
  expectedRoundIndex: number,
  expectedCommitCount: number
): Promise<ReplayVerificationResult>
```

### Execution Flow (ENFORCED)

```
1. Validate intent (DO)
2. BEGIN TRANSACTION
3. INSERT (append-only or derived)
4. COMMIT
5. VERIFY (NEW DB CONNECTION) ← ZERO-TRUST
6. EMIT EXECUTION PROOF ← MP-CORE-LOOP-004
7. THEN update runtime state
8. THEN broadcast
```

### Log Format

```
[VERIFY][CROSS_CONN][PASS] <operation> <table> — <elapsed>ms token=<token>
[VERIFY][CROSS_CONN][FAIL] <operation>: Row not found in <table> after <elapsed>ms
[VERIFY][MIGRATION][PASS] All <count> migrations applied
[VERIFY][MIGRATION][FAIL] Missing: ..., Extra: ...
[VERIFY][REPLAY][PASS] game_id=... round=... commits=...
```

---

## 🎯 ROUND AUTHORITY RULE (CORE-VALID-003)

**Status:** ENFORCED  
**File:** `src/server/eventStream.ts`  
**Task:** CORE-VALID-003 — Enforce Deterministic Round Authority (Target Source Lock)

### Core Principle

> **target is derived ONLY from ROUND_STARTED event**

### Rules (HARD ENFORCED)

| Rule | Enforcement | Error Code |
|------|-------------|------------|
| **Single Source** | target set ONLY when processing ROUND_STARTED | `INVALID_TARGET` |
| **Immutable** | target CANNOT be modified after initialization | N/A (no assignment path) |
| **No Fallback** | No default target, no external injection | `TARGET_NOT_INITIALIZED` |
| **Single Writer** | Duplicate ROUND_STARTED for same round rejected | `ROUND_ALREADY_INITIALIZED` |

### Error Conditions

```
TARGET_NOT_INITIALIZED  → GUESS_SUBMITTED received for round without ROUND_STARTED
ROUND_ALREADY_INITIALIZED → Duplicate ROUND_STARTED for same round index
INVALID_TARGET          → ROUND_STARTED payload.target is not a number
```

### Determinism Guarantee

```
Replay same events twice → identical RoundState.target
```

The target is reconstructible from event stream ONLY. No hidden state.

---

## 🧱 STATE LAYERS

### Layer 1 — Persistent Truth (DB)

Canonical, append-only or recomputable:

* `sessions`
* `session_players`
* `round_commits` (append-only)
* `round_results` (derived, recomputable)
* `round_events` (append-only phase log)

### Layer 2 — Runtime (DO Memory)

Non-authoritative cache:

* current phase
* timers
* derived leaderboard
* connected players

### Hard Constraint

> If DO crashes → full state MUST be rebuilt from DB only

---

## 🗄️ CANONICAL SCHEMA (LOCKED)

Source: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3

### sessions

* Primary configuration only

### session_players

* Composite PK ensures membership integrity

### round_commits (APPEND-ONLY)

* Immutable submissions
* PK: (game_id, player_id, round_index)
* verification_token column for replay validation

### round_results

* Server-computed
* MUST be reproducible from commits
* PK: (game_id, round_index, player_id)
* Includes replay fields: distance_km, year_diff, location_score, time_score

### round_events (APPEND-ONLY)

* Every phase transition MUST be logged
* **Deterministic reconstruction via `deriveStateFromEventStream()`**
  * Full event stream validation (ALL rounds)
  * Ordering: `created_at ASC, id ASC`
  * Validations: global ordering, round continuity, phase sequence
  * Fail-fast on ANY violation

Violation = system invalid

---

## 🔁 WRITE PIPELINE (ENFORCED FLOW)

All mutations MUST follow:

```
1. Validate intent (DO)
2. BEGIN TRANSACTION
3. INSERT (append-only or derived)
4. COMMIT
5. VERIFY (NEW DB CONNECTION)
6. EMIT EXECUTION PROOF
7. THEN update runtime state
8. THEN broadcast
```

### Forbidden Orderings

* ❌ Update runtime before DB commit
* ❌ Verify inside same transaction
* ❌ Broadcast before verification

---

## 🔍 CROSS-CONNECTION VERIFICATION (MANDATORY)

Every critical write MUST:

1. Generate deterministic lookup key (PK or token)
2. After COMMIT:

   * Open NEW DB connection from pool
   * SELECT the written row
3. Assert existence

### Failure Behavior

* Immediate THROW
* Include:

  * table
  * keys
  * operation
  * timestamp

No retry. No fallback.

---

## 🧾 APPEND-ONLY ENFORCEMENT

### round_commits

* INSERT ONLY
* No UPDATE / DELETE allowed

### round_events

* Immutable event log
* All phase transitions MUST be recorded

Violation = system invalid

---

## � EVENT STREAM VALIDATION LAYER (HARD INVARIANTS — MP-CORE-LOOP-006)

**IMPLEMENTED:** `deriveStateFromEventStream()` — Strict Event Stream Invariant Enforcement  
**FILE:** `src/server/getGameState.ts`  
**STATUS:** ACTIVE

### Invariants Enforced

| Invariant | Rule | Error Code |
|-----------|------|------------|
| **Input Protection** | Input array cloned + frozen — no mutation allowed | N/A (prevention) |
| **Chronological Ordering** | `created_at` must be non-decreasing; id tie-break for equal timestamps | `EVENT_ORDER_VIOLATION` |
| **Round Continuity** | No skips, no regressions; rounds must be 0, 1, 2... | `ROUND_CONTINUITY_ERROR` |
| **Round Validity** | Reject null/undefined/NaN/negative/non-integer for gameplay events | `INVALID_ROUND_INDEX` |
| **Phase FSM** | Strict transition map; first event must be SESSION_CREATED | `INVALID_PHASE_TRANSITION` |
| **Explicit Phase** | Phase derived ONLY from last event — no inference | `MISSING_PHASE_EVENT` |

### Validation Flow

```
1. Clone & freeze input array
2. Empty stream check
3. STRICT ORDERING — per-event timestamp + id validation
4. STRICT ROUND VALIDATION — per-event null/NaN/negative check
5. STRICT ROUND CONTINUITY — track expectedRound, detect skips/regressions
6. GLOBAL ROUND CONTINUITY — verify no gaps across all rounds
7. FORMAL PHASE FSM — first event validation + transition map enforcement
8. Derive state from last event — explicit only
```

### Fail-Fast Behavior

* ANY validation failure → immediate throw with explicit error code
* NO fallback values
* NO silent corrections
* NO inferred transitions

---

## � DETERMINISTIC REPLAY (ENFORCED)

Full game state MUST be reconstructable from:

* `sessions`
* `session_players`
* `round_commits`
* `round_events`

### Replay Requirements

* Same inputs → same outputs
* Scores recomputed exactly
* Phase progression identical

### Runtime Check

If:
```
replayed_state !== runtime_state
```
→ THROW and halt execution

### Implementation

After round completion:
```typescript
await verifyFullReplay(gameId, roundIndex, event, operation, token);
```

This:
1. Loads commits from DB
2. Recomputes all scores using `evaluateRound`
3. Compares to stored `round_results`
4. Throws if ANY mismatch

---

## 🧠 DETERMINISM RULES

**CANONICAL SOURCE:** `docs/core/DETERMINISM_SPEC.md`

Derived from MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE v3.0 Section 0.3

* Fixed seed per session
* No uncontrolled randomness
* No race-condition-dependent logic
* No non-deterministic DB reads

**Full specification:** `docs/core/DETERMINISM_SPEC.md`

---

## 🧪 MIGRATION INTEGRITY (RUNTIME GATE)

### Rule

> Schema is INVALID unless migrations are fully applied

### At Startup:

1. Load expected migrations from `scripts/migrations/`
2. Query `supabase_migrations.schema_migrations`
3. Compare sets

### Failure Conditions

* Missing migration
* Extra migration
* Order mismatch

→ HARD FAILURE (server must not start)

### Implementation

```typescript
await assertMigrationIntegrity();
```

---

## 🔐 SECURITY MODEL (RLS)

From master spec:

* Service role:

  * Full INSERT / UPDATE / SELECT
* Client (authenticated):

  * SELECT only (scoped)

### Absolute Rule

> Clients NEVER write to DB

All writes go through DO.

---

## 🚫 NO CLIENT TRUST

* Client sends **intent only**
* Server validates everything
* Server computes:

  * scores
  * ranks
  * results

Client data is always treated as untrusted input.

---

## ⚙️ IDENTITY & IDEMPOTENCY

### round_commits PK:

```
(game_id, player_id, round_index)
```

Guarantees:

* No duplicate submissions
* Safe retry behavior

---

## 🧨 FAILURE CONDITIONS (SYSTEM INVALID)

System MUST crash if:

* Any state mutation bypasses DB
* Any write is not cross-connection verified
* Any append-only table is mutated
* Replay does not match runtime
* Migration state is inconsistent
* Determinism is violated
* Execution proof is missing or faked

---

## 📡 RUNTIME LOGGING (MANDATORY)

All writes MUST produce logs:

```
[VERIFY][WRITE][BEGIN]
[VERIFY][COMMIT][SUCCESS]
[VERIFY][CROSS_CONN][PASS]
[VERIFY][CROSS_CONN][FAIL]
[VERIFY][ROW_INTEGRITY][PASS]
[VERIFY][ROW_INTEGRITY][FAIL]
[VERIFY][WRITE_SET][PASS]
[VERIFY][WRITE_SET][FAIL]
[VERIFY][UNIQUENESS][PASS]
[VERIFY][UNIQUENESS][FAIL]
[VERIFY][FULL_REPLAY][PASS]
[VERIFY][FULL_REPLAY][FAIL]
[VERIFY][MIGRATION][PASS]
[VERIFY][MIGRATION][FAIL]
```

Logs are not optional. They are audit proof.

---

## 🔄 RECOVERY MODEL

On DO restart:

1. Load DB state
2. Rebuild:

   * phase
   * timers
   * players
3. Resume execution deterministically

No reliance on memory.

---

## ⚠️ WHAT IS EXPLICITLY FORBIDDEN

* In-memory authority
* Silent failures
* Retry loops on integrity failure
* Partial writes
* Background reconciliation
* Eventual consistency
* Fake execution proofs
* Simulated verification

This system is **strict consistency only**.

---

## 🧠 PURE DERIVATION (ARCH-FIX-DERIVATION-001)

**Status:** ENFORCED  
**File:** `src/server/eventStream.ts`  
**Task:** ARCH-FIX-DERIVATION-001 — Make eventStream derivation pure

### Core Principle

> **eventStream.ts derivation is now pure. No mutation is allowed during state reconstruction.**

### Enforcement

| Forbidden | Required |
|-----------|----------|
| `obj.x = ...` | Always create NEW objects |
| `array.push(...)` | Always create NEW arrays |
| `array[index] = ...` | Use spread operators `{ ...obj, key: value }` |
| Modifying existing objects | Immutable updates only |

### Functions Affected

- `deriveStateFromEventStream()` — Input array cloned + frozen, no mutation
- `deriveFullStateFromEventStream()` — All round state updates via immutable patterns

### Verification

```typescript
// PURE: Creates new rounds record
rounds = {
  ...rounds,
  [roundIndex]: {
    ...round,
    guess: payload.guess
  }
};

// MUTATION (FORBIDDEN):
round.guess = payload.guess;  // ❌ Never allowed
```

---

## 🧠 SUMMARY (NON-NEGOTIABLE)

This backend guarantees:

* DB is the **only truth**
* Every write is **provably persisted** (cross-connection verified)
* Every game is **replayable**
* Every failure is **visible and fatal**
* Migrations are **verified at startup**
* Every critical operation produces **unforgeable execution proof**
* State derivation is **pure** — no mutations during reconstruction

If any of these are weakened, the system becomes non-deterministic and invalid.

---

## 🧪 EXECUTION PROOF TEST HARNESS

### Test File: `src/server/zeroTrust.execution.test.ts`

**MANDATORY** tests that verify the execution proof system:

1. **BASELINE** — Real session, players, commits, results with full verification (MUST PASS)
2. **PAYLOAD CORRUPTION** — Direct DB UPDATE triggers verifyRowIntegrity failure (MUST FAIL)
3. **MISSING WRITE** — Skipped round_results triggers verifyWriteSet failure (MUST FAIL)
4. **DUPLICATE INSERT** — Same PK twice triggers uniqueness violation (MUST FAIL)
5. **TOKEN MISMATCH** — Incorrect verification token detected (MUST FAIL)
6. **REPLAY DRIFT** — Modified scoring inputs trigger full replay failure (MUST FAIL)
7. **DETERMINISTIC REPLAY** — Full recomputation matches stored results exactly (MUST PASS)

### Running Tests

```bash
npm run test zeroTrust.execution
```

Expected output shows:
* Real DB writes
* Corruption applied
* Failures triggered
* Replay validated
* Execution proofs emitted

---

## � PHASE AUTHORITY MODEL (ENFORCED) — CORE-FIX-001

**Status:** ENFORCED  
**Task:** CORE-FIX-001 — Enforce Single Source of Truth for Phase  
**Authority:** EVENT_STREAM_SPEC.md Section 6.3, PHASE_FSM_SPEC.md Section 4

---

### Core Principle

> **round_events = SINGLE SOURCE OF TRUTH for phase**

No alternative phase derivation is allowed. Period.

---

### Phase Derivation Rules (HARD ENFORCED)

| Event Type | Derived Phase |
|------------|---------------|
| `SESSION_CREATED` | `LOBBY` |
| `ROUND_STARTED` | `ROUND_ACTIVE` |
| `GUESS_SUBMITTED` | `ROUND_ACTIVE` |
| `ROUND_COMPLETE` | `ROUND_COMPLETE` |
| `SESSION_COMPLETE` | `SESSION_COMPLETE` |

---

### Enforcement Mechanisms

#### 1. Canonical Reconstruction Function

```typescript
// src/server/getGameState.ts
deriveStateFromEventStream(events: RoundEvent[]): { currentRound, currentPhase }
```

- **ONLY** valid method for phase derivation
- Full event stream validation (chronological, continuity, FSM)
- Fail-fast on ANY violation
- Pure function — no side effects, no mutations

#### 2. Forbidden (HARD REJECT)

| Violation | Consequence |
|-----------|-------------|
| Phase derived from `round_timing` | **REMOVED** — `loadCurrentRoundIndex()` deleted |
| Phase derived from `round_commits` count | **REMOVED** — `deriveSessionStatus()` deleted |
| Phase from in-memory state | **REJECT** — Must reconstruct from DB on DO restart |
| Implicit phase transitions | **REJECT** — Every phase change requires event |
| `PLAYER_JOINED` event (not in spec) | **REMOVED** — Event emission deleted from `joinCompeteSession()` |

#### 3. Replay Equivalence Guarantee

Every state read validates:

```typescript
// In loadCompeteSessionSnapshot():
const gameState = await getGameState(gameId);
const { currentRound, currentPhase } = deriveStateFromEventStream(gameState.events);

// Hard validation:
if (lastEvent.eventType === "ROUND_COMPLETE" && status !== "ROUND_COMPLETE") {
  throw new Error("[REPLAY_MISMATCH] Phase derivation mismatch...");
}
```

**Guarantee:** `DB replay === runtime state` (strict equality)

Failure = **HARD ERROR** (system invalid)

---

### Implementation Changes (CORE-FIX-001)

#### Removed Functions

| Function | Reason |
|----------|--------|
| `deriveSessionStatus()` | Shadow phase derivation from `round_timing` + `round_commits` |
| `loadCurrentRoundIndex()` | Used `round_timing` for round state |
| `loadRoundTiming()` | Used `round_timing` for phase derivation |
| `loadRoundTimingWithLock()` | Used `round_timing` for round validation |

#### Refactored Functions

| Function | Change |
|----------|--------|
| `loadCompeteSessionSnapshot()` | Now uses `getGameState()` → `deriveStateFromEventStream()` exclusively |
| `submitGuess()` | Round validation now uses `round_events` (ROUND_STARTED check) |
| `joinCompeteSession()` | Removed `PLAYER_JOINED` event emission (not in spec) |

---

### Compliance Verification

System is **VALID** only if:

- [x] There is exactly ONE phase derivation path
- [x] `deriveSessionStatus` no longer influences phase (DELETED)
- [x] `loadCompeteSessionSnapshot` uses canonical reconstruction
- [x] Replay state ALWAYS equals runtime state (hard validation)
- [x] Event contract matches implementation exactly
- [x] No phase logic exists outside event stream

---

### Document Authority Chain

```
MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE.md
    ↓
FULL_CORE_GAME_MASTER_SPEC.md (Section 3.3 — Schema)
    ↓
EVENT_STREAM_SPEC.md (Section 6.3 — Phase Derivation)
    ↓
PHASE_FSM_SPEC.md (Section 4 — FSM Rules)
    ↓
DETERMINISM_SPEC.md (Replay Equivalence)
    ↓
backend_architecture.md (THIS SECTION)
    ↓
src/server/getGameState.ts (deriveStateFromEventStream)
    ↓
src/server/sessionCore.ts (loadCompeteSessionSnapshot)
```

---

## � DISABLED MODULES

### minimalGameLoop.ts (ARCH-KILL-MUTATION-001)

**Status:** DISABLED — Hard crash on import  
**Date:** 2026-04-09  
**Task:** ARCH-KILL-MUTATION-001

This module previously contained an orphan in-memory game loop with direct state mutation. It violated:
- Single source of truth (global mutable `gameState`)
- Determinism requirements (uncontrolled mutation)
- No lifecycle ownership (file-level global state)

**Enforcement:**
```typescript
throw new Error(
  "minimalGameLoop.ts is disabled — orphan mutation authority is forbidden"
);
```

Any in-memory mutation-based game loop is **forbidden**.

---

## �📋 CHANGE LOG

| Version | Task | Status | Key Addition |
|---------|------|--------|--------------|
| v1 | MP-CORE-LOOP-002 | DEPRECATED | Same-transaction verification |
| v2 | MP-CORE-LOOP-003 | COMPLETE | Cross-connection verification |
| v3 | MP-DB-RESET-ENFORCE-001 | COMPLETE | Schema hard reset |
| v4 | MP-CORE-LOOP-004 | COMPLETE | Execution Proof Layer, anti-fake enforcement |
| v5 | MP-CORE-LOOP-005 | COMPLETE | Hard DB enforcement, transaction isolation proof, backend PID tracking |
| v6 | DOC-CORE-001 | COMPLETE | Core spec authority enforcement (EVENT_STREAM_SPEC, PHASE_FSM_SPEC, DETERMINISM_SPEC) |
| v7 | CORE-FIX-001 | **ENFORCED** | Single source of truth for phase — shadow derivation eliminated |
| v8 | CORE-GAMEPLAY-001 | **IMPLEMENTED** | Deterministic 1-player full game simulation CLI |
| v9 | ARCH-KILL-MUTATION-001 | **ENFORCED** | minimalGameLoop.ts disabled — orphan mutation authority eliminated |
| v10 | ARCH-FIX-DERIVATION-001 | **ENFORCED** | eventStream.ts derivation is now pure — no mutation during state reconstruction |

---
