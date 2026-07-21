# ROUND RESOLUTION (SERVER PIPELINE)

## 0. PRINCIPLE

Round resolution is a deterministic, server-only pipeline.

**Core Specifications:**
- Event Stream: `docs/core/EVENT_STREAM_SPEC.md`
- Phase FSM: `docs/core/PHASE_FSM_SPEC.md`
- Determinism: `docs/core/DETERMINISM_SPEC.md`

Rules:
- Triggered ONLY by server
- Based ONLY on DB commits
- Fully replayable

---

## 1. TRIGGER CONDITIONS

Round ends when:

SYNC MODE:
- timer expired OR all players submitted

ASYNC MODE (Relax — Option A):
- per-player: the individual player submitted OR their optional per-round timer expired
- session-wide: session deadline reached (finalizes unsubmitted rounds as 0 for all remaining players)

---

## 2. RESOLUTION PIPELINE

### STEP 1 — LOAD DATA

From DB:

- session config
- round_commits for round N
- event data (correct answers)

---

### STEP 2 — VALIDATION

For each player:

- ensure at most ONE commit exists
- ignore duplicates (PK enforced)

---

### STEP 3 — COMPUTE SCORES

For each player:

- compute distance
- compute year diff
- compute locationScore
- compute timeScore
- apply hint penalty

Using:
→ scoring_spec.md

---

### STEP 4 — WRITE RESULTS

Insert into:

`round_results`

Constraints:
- atomic transaction
- idempotent (no duplicate writes)

---

### STEP 5 — RANKING

Compute:

- rank per player
- tie-breaking rule (deterministic)

---

### STEP 6 — LOG EVENT

Insert into:

`round_events`

**Event Schema:** See `docs/core/EVENT_STREAM_SPEC.md` Section 3.3

Event:
- ROUND_COMPLETE

Includes:
- round_index
- timestamp
- trigger (timer | all_submitted)

---

### STEP 7 — UPDATE RUNTIME STATE

DO updates:

- phase → RESULT
- cache results
- prepare next phase

---

### STEP 8 — BROADCAST

Send to clients:

- sanitized results only
- no hidden data leakage

---

## 3. FAILURE HANDLING

If any step fails:

- abort transaction
- log error
- retry safe (idempotent)

---

## 4. REPLAY GUARANTEE

Given DB:

- round_commits
- event data

System must fully recompute:

- scores
- rankings
- results

No dependency on memory.

---

## 5. FORBIDDEN

- Client-triggered resolution
- Partial writes
- In-memory-only results
- Multiple resolution paths
- Non-idempotent logic