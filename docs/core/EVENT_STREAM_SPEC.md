# EVENT STREAM SPECIFICATION

## 0. AUTHORITY

**PRIMARY:** `docs/MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE.md` Section 0.1, 0.2

**Status:** CANONICAL — All event stream processing MUST comply.

---

## 1. PURPOSE

This document defines the ONLY valid event stream model for the Guess-History multiplayer system.

The event stream is the **canonical replay source**. All game state must be reconstructible from the event stream alone.

---

## 2. SOURCE OF TRUTH

**Table:** `round_events` (append-only)

**Authority:** Event stream is the ONLY source for:
- Phase state (current phase derived from last event)
- Round progression
- Session lifecycle

**Enforcement:**
- Every phase transition MUST emit an event
- No state change without corresponding event
- Events are IMMUTABLE — never updated or deleted

---

## 3. EVENT SCHEMA

### 3.1 Database Schema

```sql
CREATE TABLE round_events (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES sessions(game_id),
  round_index INT,                    -- null for session-level events
  event_type VARCHAR NOT NULL,        -- from EventType enum
  payload JSONB,                      -- event-specific data
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 3.2 EventType Enum

| Event Type | Scope | Purpose |
|------------|-------|---------|
| `SESSION_CREATED` | Session | Initial session establishment |
| `ROUND_STARTED` | Round | Round begins (timer starts) |
| `GUESS_SUBMITTED` | Round | Player submits guess |
| `ROUND_COMPLETE` | Round | Round ends (all guesses in or timeout) |
| `SESSION_COMPLETE` | Session | Game ends (all rounds complete) |

### 3.3 Payload Schemas

#### SESSION_CREATED
```typescript
{
  mode: "sync" | "async",
  totalRounds: number,
  roundTimerSec: number,
  yearMin: number,
  yearMax: number,
  seed: string
}
```

#### ROUND_STARTED
```typescript
{
  roundIndex: number,
  eventId: string,           // selected event for this round
  startedAt: string,         // ISO timestamp
  phaseEndsAt: string        // ISO timestamp
}
```

#### GUESS_SUBMITTED
```typescript
{
  playerId: string,
  roundIndex: number,
  yearGuess: number,
  locationLat: number,
  locationLng: number,
  hintsUsed: number,
  submittedAt: string
}
```

#### ROUND_COMPLETE
```typescript
{
  roundIndex: number,
  completedAt: string,
  submissionCount: number,
  trigger: "timer" | "all_submitted"
}
```

#### SESSION_COMPLETE
```typescript
{
  completedAt: string,
  finalRoundIndex: number,
  trigger: "normal" | "abandoned"
}
```

---

## 4. ORDERING GUARANTEES

### 4.1 Primary Ordering

**SQL:** `ORDER BY created_at ASC, id ASC`

- `created_at` is non-decreasing
- `id` serves as tie-breaker for equal timestamps

### 4.2 Global Invariants

| Invariant | Rule | Violation |
|-----------|------|-----------|
| **Chronological** | `created_at` must be non-decreasing | `EVENT_ORDER_VIOLATION` |
| **Round Continuity** | Round indices must be 0, 1, 2... | `ROUND_CONTINUITY_ERROR` |
| **No Regression** | Round index cannot decrease | `ROUND_CONTINUITY_ERROR` |
| **Valid Rounds** | No null/NaN/negative/non-integer for gameplay events | `INVALID_ROUND_INDEX` |

### 4.3 Strict Validation Rules

1. **Input Protection:** Input array cloned + frozen at function start
2. **Single Pass:** Full stream validation in one iteration
3. **Fail-Fast:** ANY violation throws immediately
4. **No Fallback:** No inferred corrections

---

## 5. IDEMPOTENCY RULES

### 5.1 Event-Level Idempotency

- Duplicate events with same `id` are ignored (PK constraint)
- Duplicate `GUESS_SUBMITTED` for same `(game_id, player_id, round_index)` rejected by PK on `round_commits`

### 5.2 Replay Idempotency

- Same event stream → Same derived state (always)
- Re-running transition must not duplicate effects
- All derived state must be recomputable

---

## 6. REPLAY CONTRACT

### 6.1 Reconstruction Guarantee

Given:
- `round_events` (ordered by created_at ASC, id ASC)
- `sessions` (configuration)
- `session_players` (player list)
- `round_commits` (submissions)

System MUST produce:
- Identical phase state
- Identical round progression
- Identical scores (when combined with scoring_spec.md)

### 6.2 Determinism Requirements

- Fixed seed per session (from SESSION_CREATED payload)
- No uncontrolled randomness during replay
- No race-condition-dependent logic
- Time-based transitions use stored `phaseEndsAt`

### 6.3 Phase Derivation

Phase is derived **ONLY** from the last event in the stream:

```typescript
const lastEvent = events[events.length - 1];
const currentPhase = derivePhaseFromEventType(lastEvent.eventType);
const currentRound = lastEvent.roundIndex ?? 0;
```

**Phase Mapping:**
| Last Event Type | Derived Phase |
|-----------------|---------------|
| `SESSION_CREATED` | `LOBBY` |
| `ROUND_STARTED` | `ROUND_ACTIVE` |
| `GUESS_SUBMITTED` | `ROUND_ACTIVE` |
| `ROUND_COMPLETE` | `ROUND_COMPLETE` |
| `SESSION_COMPLETE` | `SESSION_COMPLETE` |

---

## 7. INVARIANTS

### 7.1 Round Continuity

- Round indices must start at 0
- Must increment by 1 (no gaps)
- Cannot decrease

**Valid sequence:** 0, 0, 0, 1, 1, 2, 2, 2, 3...
**Invalid:** 0, 2 (gap), 1, 0 (regression), null (invalid)

### 7.2 Phase Correctness

- First event MUST be `SESSION_CREATED`
- `ROUND_STARTED` must follow `SESSION_CREATED` or `ROUND_COMPLETE`
- `GUESS_SUBMITTED` must be within active round
- `ROUND_COMPLETE` must have corresponding `ROUND_STARTED`
- `SESSION_COMPLETE` must follow `ROUND_COMPLETE`

### 7.3 Event Stream Completeness

- Empty stream = error (no session)
- Single event stream must start with `SESSION_CREATED`
- All gameplay events require valid `roundIndex`

---

## 8. VALIDATION API

### 8.1 deriveStateFromEventStream()

**Location:** `src/server/getGameState.ts`

**Contract:**
```typescript
function deriveStateFromEventStream(events: EventRecord[]): DerivedState;
```

**Validations:**
1. Clone & freeze input
2. Empty check
3. Chronological ordering
4. Round validity
5. Round continuity
6. Phase FSM transitions
7. Derive state from last event

**Errors:**
- `EVENT_ORDER_VIOLATION`
- `ROUND_CONTINUITY_ERROR`
- `INVALID_ROUND_INDEX`
- `INVALID_PHASE_TRANSITION`
- `MISSING_PHASE_EVENT`

---

## 9. FORBIDDEN

- Ad-hoc event validation outside `deriveStateFromEventStream()`
- Partial stream processing (filtered subsets)
- Inferred phases without explicit events
- Event updates or deletions
- Non-deterministic event ordering
- Client-side event emission authority

---

## 10. COMPLIANCE

All event stream processing MUST:
- Use `deriveStateFromEventStream()` exclusively
- Validate full stream (no partial processing)
- Fail fast on ANY violation
- Derive phase ONLY from explicit events

Violation of this spec = SYSTEM INVALID
