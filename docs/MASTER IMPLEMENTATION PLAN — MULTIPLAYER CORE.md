
# 🔴 FINAL MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE v3.0

**PROJECT:** Guess-History
**STATUS:** SINGLE SOURCE OF TRUTH
**ENFORCEMENT:** HARD (any deviation = reject)

---

# 0. NON-NEGOTIABLE FOUNDATIONS

## 0.1 Authority Model (RESOLVED CONFLICT)

* **Database (Postgres) = Supabase = Absolute Source of Truth**
* **Append-only logs = canonical game history**
* **PartyKit Durable Object = deterministic executor + cache**
* **Client = stateless renderer**

👉 This resolves the biggest flaw in v1.1 (in-memory authority risk)

---

## 0.2 State Layers (CLEAR SEPARATION)

### Layer 1 — Persistent Truth (DB)

* sessions
* session_players
* round_commits (answers)
* round_results
* round_events (phase transitions, scoring)

### Layer 2 — Runtime State (DO memory)

* current phase
* timers
* cached players
* derived state (leaderboard, etc.)

⚠️ Rule:

> If DO crashes → full state must be rebuildable from DB

---

## 0.3 Determinism

* Session has fixed **seed**
* All randomness uses deterministic PRNG
* All transitions are event-driven (no hidden logic)
* Replay must produce identical results

---

## 0.4 Client Contract

* Receives **sanitized state only**
* Never receives:

  * correct answers (before reveal)
  * hidden scoring data
* Sends only **intents**, never state mutations

---

# 1. SYSTEM ARCHITECTURE

## 1.1 Flow

```
Client → Action → DO validates → DB commit (append-only)
        → DO updates runtime → Broadcast sanitized state
```

## 1.2 Golden Rule

> No DB write = no state change

If it’s not persisted, it does not exist.

---

# 2. PHASE STATE MACHINE

## Phases (STRICT ORDER)

1. LOBBY
2. STARTING
3. QUESTION
4. ANSWER
5. LOCKED
6. RESULT
7. SCOREBOARD
8. NEXT_ROUND / END

### Rules

* Every phase has:

  * `phaseStartAt`
  * `phaseEndsAt`
* Server time is authoritative
* All transitions are logged in DB (`round_events`)

---

# 3. PHASE EXECUTION MODEL

## 3.1 Transition Mechanism

DO loop:

```
if (now >= phaseEndsAt):
   validate transition
   write event to DB
   compute next phase
   broadcast update
```

## 3.2 Idempotency

* Each transition has unique ID
* Re-running transition must not duplicate effects

---

# 4. CONTENT SYSTEM (FROM v1 — CORRECT, BUT LOCKED)

## Phase 0 (MANDATORY FIRST)

* Questions loaded from DB
* Each question has:

  * id
  * correct answer
  * difficulty
  * geo data

## Deterministic Selection

```
questionIndex = PRNG(seed + roundNumber)
```

No randomness outside PRNG.

---

# 5. ANSWER SYSTEM (MERGED + FIXED)

## 5.1 Submission

* Player sends:

  ```
  { sessionId, roundId, playerId, answer, timestamp }
  ```

## 5.2 Server Flow

1. Validate phase == ANSWER
2. Validate not already submitted
3. Insert into `round_commits` (append-only)
4. Ignore duplicates via unique constraint

---

## 5.3 Lock Phase

* No more writes allowed
* DO enforces
* DB enforces (optional constraint window)

---

# 6. SCORING SYSTEM (FIXED FROM BOTH PLANS)

## Requirements

* Deterministic
* Recomputable from DB only

## Flow

1. Fetch all answers
2. Compute distance / correctness
3. Normalize score
4. Write results → `round_results`

⚠️ Never compute scores only in memory

---

# 7. TIMER SYSTEM (FROM v1, HARDENED)

## Rules

* Single source: `serverTime`
* Clients sync via offset
* No client timers trusted

## Fail-safe

If DO restarts:

* recompute timers from DB timestamps

---

# 8. NETWORKING PROTOCOL

## 8.1 Client → Server (Intent Only)

* JOIN_SESSION
* SUBMIT_ANSWER
* READY_NEXT

## 8.2 Server → Client

* STATE_UPDATE (sanitized)
* PHASE_CHANGE
* ERROR (standardized)

---

## 8.3 Error Format

```
{
  code: string,
  message: string,
  recoverable: boolean
}
```

---

# 9. RECONNECT & RECOVERY (FROM v2 — CRITICAL)

## On reconnect:

1. DO reloads state from DB
2. Rebuild:

   * phase
   * timers
   * players
3. Send full state snapshot

---

# 10. LATE JOIN POLICY

* Allowed only before QUESTION phase
* After that:

  * spectator mode OR reject

---

# 11. HOST & SESSION CONTROL

## Host Role

* Only used for:

  * start game
  * kick (optional)

## Migration

If host leaves:

* assign next player deterministically

---

# 12. ANTI-CHEAT GUARANTEES

* No client authority
* Append-only logs
* Idempotent writes
* Server validation on every action
* No hidden state leaks

---

# 13. IMPLEMENTATION ROADMAP (CORRECTED ORDER)

## Phase 0 — Content System

👉 DB schema + question loading

## Phase 1 — DB + Commit Log Layer

👉 sessions, players, commits, results, events

## Phase 2 — Session & Lobby (DO + DB sync)

## Phase 3 — Phase State Machine

## Phase 4 — Timer System

## Phase 5 — Answer Pipeline (commit-based)

## Phase 6 — Scoring Engine (DB-driven)

## Phase 7 — Networking Protocol

## Phase 8 — Reconnect & Recovery

## Phase 9 — Thin Client Refactor

---

# 14. CRITICAL DIFFERENCES FROM ORIGINAL PLANS

## What was WRONG in v1.1

* ❌ Implicit in-memory authority risk
* ❌ Replay not guaranteed
* ❌ No commit log enforcement

## What was OVERKILL / RISKY in v2.0

* ❌ Too DB-heavy without execution discipline
* ❌ Lacked clear phase runtime mechanics

## What this v3 FIXES

* ✅ DB = truth
* ✅ DO = executor
* ✅ Phases = deterministic engine
* ✅ Replay = guaranteed
* ✅ No desync possible (if followed)

---

# 15. FAILURE CONDITIONS (EXPLICIT)

System is INVALID if:

* Any state mutation bypasses DB
* Any randomness is non-deterministic
* Any client influences game state
* Any phase transition is not logged
* Any score cannot be recomputed from DB

---

# 16. FINAL DIRECTIVE

This is not a guideline.

This is a **constraint system**. Do not simplify.