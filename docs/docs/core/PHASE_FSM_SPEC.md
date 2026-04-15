# PHASE FSM SPECIFICATION

## 0. AUTHORITY

**PRIMARY:** `docs/MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE.md` Section 2

**Status:** CANONICAL — All phase transitions MUST comply.

---

## 1. PURPOSE

This document defines the ONLY valid Phase Finite State Machine (FSM) for the Guess-History multiplayer system.

The FSM ensures deterministic, event-driven phase progression with explicit transitions only.

---

## 2. PHASE DEFINITIONS

### 2.1 Core Phases

| Phase | Code | Description |
|-------|------|-------------|
| `LOBBY` | lobby | Session created, players joining |
| `ROUND_ACTIVE` | round_active | Round in progress, timer running |
| `ROUND_COMPLETE` | round_complete | Round ended, showing results |
| `SESSION_COMPLETE` | session_complete | All rounds finished |

### 2.2 Phase Sources

- Phases are DERIVED from `round_events` table ONLY
- Runtime phase in DO memory is NON-AUTHORITATIVE cache
- On recovery, phase is ALWAYS reconstructed from event stream

---

## 3. FSM TRANSITION MAP

### 3.1 Allowed Transitions

```
SESSION_CREATED
  ├──→ ROUND_STARTED
  └──→ SESSION_COMPLETE (abandon)

ROUND_STARTED
  ├──→ GUESS_SUBMITTED
  └──→ ROUND_COMPLETE (timeout)

GUESS_SUBMITTED
  ├──→ GUESS_SUBMITTED (more guesses)
  └──→ ROUND_COMPLETE (all submitted or timeout)

ROUND_COMPLETE
  ├──→ ROUND_STARTED (next round)
  └──→ SESSION_COMPLETE (last round)

SESSION_COMPLETE
  └──→ (terminal — no exits)
```

### 3.2 Formal Transition Table

| From State | Event | To State | Condition |
|------------|-------|----------|-----------|
| `(start)` | `SESSION_CREATED` | `LOBBY` | Always |
| `LOBBY` | `ROUND_STARTED` | `ROUND_ACTIVE` | Host starts game |
| `ROUND_ACTIVE` | `GUESS_SUBMITTED` | `ROUND_ACTIVE` | Within timer |
| `ROUND_ACTIVE` | `ROUND_COMPLETE` | `ROUND_COMPLETE` | Timer expires or all submitted |
| `ROUND_COMPLETE` | `ROUND_STARTED` | `ROUND_ACTIVE` | Next round exists |
| `ROUND_COMPLETE` | `SESSION_COMPLETE` | `SESSION_COMPLETE` | Last round complete |

### 3.3 Invalid Transitions (HARD REJECT)

| Invalid Transition | Error Code |
|-------------------|------------|
| `LOBBY` → `ROUND_COMPLETE` | `INVALID_PHASE_TRANSITION` |
| `LOBBY` → `SESSION_COMPLETE` (without rounds) | `INVALID_PHASE_TRANSITION` |
| `ROUND_ACTIVE` → `SESSION_COMPLETE` | `INVALID_PHASE_TRANSITION` |
| `ROUND_COMPLETE` → `LOBBY` | `INVALID_PHASE_TRANSITION` |
| `SESSION_COMPLETE` → ANY | `INVALID_PHASE_TRANSITION` |
| `ROUND_STARTED` → `ROUND_STARTED` | `INVALID_PHASE_TRANSITION` |
| `ROUND_COMPLETE` → `ROUND_COMPLETE` | `INVALID_PHASE_TRANSITION` |

---

## 4. PHASE DERIVATION RULES

### 4.1 Derivation from Event Stream

Phase is derived **EXCLUSIVELY** from the last event:

```typescript
function derivePhase(lastEvent: EventRecord): Phase {
  switch (lastEvent.eventType) {
    case 'SESSION_CREATED':
      return 'LOBBY';
    case 'ROUND_STARTED':
    case 'GUESS_SUBMITTED':
      return 'ROUND_ACTIVE';
    case 'ROUND_COMPLETE':
      return 'ROUND_COMPLETE';
    case 'SESSION_COMPLETE':
      return 'SESSION_COMPLETE';
    default:
      throw new Error(`MISSING_PHASE_EVENT: ${lastEvent.eventType}`);
  }
}
```

### 4.2 Round Index Derivation

```typescript
const currentRound = lastEvent.roundIndex ?? 0;
```

- `SESSION_CREATED`: round = 0 (next round will be 0)
- `ROUND_STARTED`: round = event.roundIndex
- `GUESS_SUBMITTED`: round = event.roundIndex
- `ROUND_COMPLETE`: round = event.roundIndex
- `SESSION_COMPLETE`: round = finalRoundIndex from payload

---

## 5. TRANSITION MECHANISM

### 5.1 Server-Side Transition Flow

```
1. Validate current phase (from event stream)
2. Validate transition is allowed (per FSM map)
3. Write event to DB (round_events)
4. Verify write cross-connection
5. Derive new phase from updated event stream
6. Broadcast state update
```

### 5.2 Idempotency

- Transition events are idempotent via unique constraints
- Re-running same transition produces same result
- No side effects from duplicate events (PK enforcement)

### 5.3 Fail-Fast Rules

- Invalid transition attempt → THROW immediately
- Missing current phase (empty stream) → THROW
- No implicit transitions allowed → THROW

---

## 6. VALIDATION API

### 6.1 validatePhaseTransition()

**Purpose:** Validate a proposed transition before execution.

```typescript
function validatePhaseTransition(
  currentPhase: Phase,
  eventType: EventType,
  context: TransitionContext
): void;
```

**Throws:**
- `INVALID_PHASE_TRANSITION` — transition not in allowed map
- `MISSING_PHASE_EVENT` — current phase cannot be determined

### 6.2 FSM Validation in deriveStateFromEventStream()

Each event in stream is validated against FSM:

```typescript
// Per-event validation
const expectedTransitions = FSM_MAP[previousEvent.eventType];
if (!expectedTransitions.includes(currentEvent.eventType)) {
  throw new Error(`INVALID_PHASE_TRANSITION: ${previousEvent.eventType} → ${currentEvent.eventType}`);
}
```

---

## 7. TIMER INTEGRATION

### 7.1 Phase Timers

| Phase | Timer Source | Authority |
|-------|--------------|-----------|
| `ROUND_ACTIVE` | `ROUND_STARTED.payload.phaseEndsAt` | Event payload |
| `ROUND_COMPLETE` | `completedAt + 30s` (sync) or player-driven (async) | Derived |

### 7.2 Timer Expiration

When `now >= phaseEndsAt`:
1. Validate current phase is `ROUND_ACTIVE`
2. Emit `ROUND_COMPLETE` event
3. Transition to `ROUND_COMPLETE` phase

---

## 8. MODE DIFFERENCES

### 8.1 Sync Mode

- `ROUND_ACTIVE` timer: strict (e.g., 120s)
- Pressure mechanic: 20s clamp on first submission
- `ROUND_COMPLETE` auto-advance: 30s

### 8.2 Async Mode

- `ROUND_ACTIVE` timer: session-level deadline (days)
- No pressure mechanic
- `ROUND_COMPLETE` advancement: all players must finish

---

## 9. RECOVERY BEHAVIOR

On DO restart:
1. Load full event stream from DB
2. Reconstruct phase via `deriveStateFromEventStream()`
3. Recompute timers from event timestamps
4. Resume at correct phase

**Guarantee:** Phase after recovery === Phase before crash

---

## 10. FORBIDDEN

- Client-side phase changes
- Implicit phase transitions (without event)
- Phase derived from runtime memory (on recovery)
- Multiple valid transitions for same state/event
- Non-deterministic phase progression

---

## 11. COMPLIANCE

All phase handling MUST:
- Use FSM transition map exclusively
- Validate transitions before execution
- Log every transition to `round_events`
- Derive phase from event stream only
- Fail fast on invalid transitions

Violation of this spec = SYSTEM INVALID
