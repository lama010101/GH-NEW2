# DETERMINISM SPECIFICATION

## 0. AUTHORITY

**PRIMARY:** `docs/MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE.md` Section 0.3

**Status:** CANONICAL — All deterministic behavior MUST comply.

---

## 1. PURPOSE

This document defines the requirements for deterministic behavior in the Guess-History multiplayer system.

Determinism ensures:
- Identical replay from event stream
- Consistent scoring across all executions
- Reproducible game sessions

---

## 2. DETERMINISM GUARANTEE

### 2.1 Core Principle

Given the same inputs, the system MUST produce identical outputs.

### 2.2 Replay Contract

```
sessions + session_players + round_commits + round_events
  ↓
[deterministic reconstruction]
  ↓
identical game state
```

### 2.3 Verification

After any round completion:
```typescript
await verifyDeterministicReplay(gameId, roundIndex, commitCount);
```

Failure = SYSTEM INVALID

---

## 3. PRNG RULES

### 3.1 Seeding

- Each session has a fixed `seed` (stored in `SESSION_CREATED` payload)
- Seed is cryptographically random at session creation
- Seed NEVER changes during session

### 3.2 PRNG Implementation

```typescript
// Deterministic PRNG using seed + roundNumber
function getEventForRound(seed: string, roundIndex: number): string {
  const input = `${seed}:${roundIndex}`;
  const hash = deterministicHash(input);
  const index = hash % eventPool.length;
  return eventPool[index];
}
```

**Requirements:**
- Same `(seed, roundIndex)` → Same event
- No external randomness (Math.random, Date, etc.)
- Hash algorithm is fixed and versioned

### 3.3 Prohibited Random Sources

| Source | Status |
|--------|--------|
| `Math.random()` | FORBIDDEN |
| `Date.now()` for selection | FORBIDDEN |
| Crypto random during gameplay | FORBIDDEN |
| External API randomness | FORBIDDEN |
| System entropy | FORBIDDEN |

### 3.4 Allowed Random Sources

| Source | Use Case |
|--------|----------|
| Session seed | Event selection |
| Deterministic hash | Index calculation |
| DB sequence | Event ordering tie-break |

---

## 4. TIME HANDLING RULES

### 4.1 Time Sources

| Purpose | Source | Authority |
|---------|--------|-----------|
| Phase end | `ROUND_STARTED.payload.phaseEndsAt` | Event payload |
| Submission time | `GUESS_SUBMITTED.payload.submittedAt` | Event payload |
| Current time | Server clock | Transition trigger only |

### 4.2 Timer Determinism

- Timers are stored as absolute timestamps in events
- Relative durations are computed deterministically
- No reliance on "elapsed time" calculations across restarts

### 4.3 Time Comparison

```typescript
// Deterministic comparison
if (serverTime >= phaseEndsAt) {
  // Trigger transition
}
```

### 4.4 Time Zone Handling

- All timestamps stored as UTC
- No local time in any game logic
- Display conversion happens client-side only

---

## 5. SCORING DETERMINISM

### 5.1 Scoring Formula

Defined in `docs/backend/scoring_spec.md`:

```
locationScore = round(max(0, 100 - (distanceKm / MAX_DISTANCE_KM) * 100))
timeScore = round(max(0, 100 - (yearDiff / MAX_YEAR_DIFF) * 100))
rawScore = locationScore + timeScore
finalScore = max(0, rawScore - hints_used * PENALTY_PER_HINT)
```

### 5.2 Determinism Requirements

- Identical inputs → Identical scores
- No random modifiers
- No time-based variation
- No floating-point approximation differences

### 5.3 Distance Calculation

```typescript
// Haversine formula (identical implementation required)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Fixed formula, no approximations
}
```

### 5.4 Verification

```typescript
// Recompute and compare
const recomputed = evaluateRound(commits, eventData);
for (const player of players) {
  if (recomputed[player.id].score !== stored[player.id].score) {
    throw new Error(`REPLAY_DRIFT: Score mismatch for ${player.id}`);
  }
}
```

---

## 6. RANKING DETERMINISM

### 6.1 Tie-Breaking Rules

When scores are equal:
1. Earlier submission wins (submitted_at ASC)
2. If still tied: lower player_id (alphabetically) wins

### 6.2 Ranking Formula

```typescript
function computeRanks(results: RoundResult[]): RankedResult[] {
  return results
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.submitted_at.localeCompare(b.submitted_at);
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
```

---

## 7. DB QUERY DETERMINISM

### 7.1 Ordering Requirements

All queries MUST use explicit ORDER BY:

```sql
-- Events: strict chronological
SELECT * FROM round_events
WHERE game_id = $1
ORDER BY created_at ASC, id ASC;

-- Commits: deterministic grouping
SELECT * FROM round_commits
WHERE game_id = $1 AND round_index = $2
ORDER BY submitted_at ASC, player_id ASC;

-- Results: deterministic ranking
SELECT * FROM round_results
WHERE game_id = $1 AND round_index = $2
ORDER BY score DESC, rank ASC;
```

### 7.2 Non-Deterministic Forbidden

| Pattern | Status |
|---------|--------|
| `SELECT *` without ORDER BY | FORBIDDEN |
| `LIMIT` without ORDER BY | FORBIDDEN |
| Database-dependent ordering | FORBIDDEN |
| Non-deterministic window functions | FORBIDDEN |

---

## 8. CONCURRENCY RULES

### 8.1 Race Condition Prevention

- All writes use transactions with proper isolation
- PK constraints prevent duplicate commits
- Events are append-only (no updates)
- Round resolution is single-threaded per game

### 8.2 Transaction Isolation

```sql
BEGIN;
  INSERT INTO round_commits ...;
  -- No other writes in same transaction for same (game, round, player)
COMMIT;
```

### 8.3 Verification

Cross-connection verification ensures durability:
```typescript
// Write on Connection A, verify on Connection B
await verifyWriteCrossConnection(...);
```

---

## 9. RECOVERY DETERMINISM

### 9.1 Recovery Contract

After DO restart:
1. Load events in deterministic order
2. Reconstruct phase from last event
3. Recompute all scores from commits
4. Result MUST match pre-crash state

### 9.2 Recovery Verification

```typescript
async function verifyRecovery(gameId: string): Promise<void> {
  const dbState = await getGameState(gameId);      // From DB only
  const replayState = await replayFromEvents(gameId); // Recomputed
  
  if (!deepEqual(dbState, replayState)) {
    throw new Error('RECOVERY_DRIFT: State mismatch after replay');
  }
}
```

---

## 10. FORBIDDEN

- Non-deterministic randomness in game logic
- Client-side state authority
- Implicit state transitions
- Time-dependent scoring
- Unordered queries
- Race-condition-dependent logic
- Non-reproducible computations

---

## 11. COMPLIANCE

All system components MUST:
- Use deterministic PRNG with fixed seed
- Store timestamps as absolute values
- Recompute scores identically
- Order queries explicitly
- Verify replay on critical operations

Violation of this spec = SYSTEM INVALID
