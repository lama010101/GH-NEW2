
# STATS_SYSTEM.md
## Single Source of Truth — Long-Term Player Metrics

---

# 1. PURPOSE

The Stats System is the **only authority for all persistent player performance data across games**.

It exists to:

- Track long-term player performance
- Enable progression systems (badges, improvements, analytics)
- Provide deterministic, reusable metrics

---

# 2. HARD RULES

1. **Single Source of Truth**
   - ALL persistent metrics MUST live here
   - No duplication allowed anywhere else

2. **Single Writer Principle**
   - ONLY Control can update stats
   - No other system can mutate stats

3. **Read-Only Consumers**
   - UI, Badge System, Analytics can ONLY read

4. **Deterministic Updates**
   - Stats updates occur ONLY at defined lifecycle points

5. **No Session Leakage**
   - Session/Game State MUST NOT act as long-term storage

---

# 3. SYSTEM OWNERSHIP

| Layer | Responsibility |
|------|----------------|
| Control | Triggers updates |
| Stats System | Stores + aggregates |
| UI | Read-only display |
| Badge System | Read-only evaluation |

---

# 4. LIFECYCLE

## 4.1 Round Lifecycle (NO STATS WRITE)

```text
Round End
→ roundFinalScore computed
→ stored in Game State ONLY
````

👉 Stats are NOT updated per round.

---

## 4.2 Game Lifecycle (ONLY WRITE POINT)

```text
Game End
→ Control aggregates full session
→ Control sends payload to Stats System
→ Stats System updates deterministically
→ Stats persisted
```

👉 This is the ONLY mutation point.

---

## 4.3 Persistence

Stats MUST be:

* persisted after each game
* fully reloadable before next session
* version-safe (future-proofed)

---

# 5. DATA MODEL (AUTHORITATIVE)

## 5.1 Root Structure

```ts
Stats = {
  totalGamesPlayed: number
  totalRoundsPlayed: number

  averageScore: number

  accuracy: {
    global: number
    byYear: Record<year, number>
    byDecade: Record<decade, number>
    byCentury: Record<century, number>
    byCountry: Record<countryCode, number>
  }

  distribution: {
    scoreBuckets: Record<bucketId, number>
  }
}
```

---

## 5.2 DEFINITIONS

### averageScore

* Mean of final round scores across ALL games

---

### accuracy.global

* Mean accuracy across ALL rounds ever played

---

### accuracy.byYear

* Key: exact year (e.g. 1994)
* Value: average accuracy for that year

---

### accuracy.byDecade / byCentury

* MUST be derived during update (NOT computed on read)
* Prevent runtime recomputation

---

### accuracy.byCountry

* Based on round location

---

### distribution.scoreBuckets

Example buckets:

```ts
0–20
21–40
41–60
61–80
81–100
```

---

# 6. UPDATE LOGIC (STRICT)

## 6.1 INPUT (FROM CONTROL)

At Game End:

```ts
GameResultPayload = {
  rounds: [
    {
      year: number
      country: string
      score: number
    }
  ]
}
```

---

## 6.2 UPDATE RULES

For EACH round:

* increment totalRoundsPlayed
* update:

  * accuracy.global
  * accuracy.byYear[year]
  * accuracy.byCountry[country]
  * distribution bucket

After ALL rounds:

* increment totalGamesPlayed
* update averageScore

---

## 6.3 AGGREGATION METHOD

All averages MUST be updated using **running average formula**:

```ts
newAvg = (oldAvg * count + newValue) / (count + 1)
```

👉 Prevents recomputation and ensures determinism.

---

## 6.4 DERIVED METRICS

During update ONLY:

* decade = floor(year / 10) * 10
* century = floor(year / 100) * 100

Update:

```ts
accuracy.byDecade[decade]
accuracy.byCentury[century]
```

---

# 7. STATE OWNERSHIP

| Data           | Owner             |
| -------------- | ----------------- |
| Stats          | Stats System      |
| Update Trigger | Control           |
| Storage        | Persistence Layer |

---

# 8. ACCESS RULES

## Allowed Reads

* Badge System
* UI (Profile, Results, Summary)
* Analytics

---

## Forbidden

* Direct mutation outside Control
* UI-driven stat updates
* Badge-driven stat updates

---

# 9. ANTI-PATTERNS (STRICTLY FORBIDDEN)

❌ Recomputing stats from history
❌ Storing full round history in Stats
❌ Multiple stat sources
❌ Session-based stats reuse
❌ UI caching stats as source of truth
❌ Badge system maintaining its own counters

---

# 10. EXTENSIBILITY RULES

New metrics:

* MUST be added here
* MUST follow:

  * single writer
  * deterministic update
  * lifecycle compliance

---

# 11. VERSIONING

```ts
Stats.version: number
```

Required for:

* migrations
* backward compatibility

---

# 12. VALIDATION CHECKLIST

Stats System is valid ONLY IF:

* [ ] Single writer (Control only)
* [ ] Updated ONLY at Game End
* [ ] No duplication elsewhere
* [ ] All metrics deterministic
* [ ] No dependency on UI or Badge logic
* [ ] Fully reloadable between sessions

---

# 13. FINAL PRINCIPLE

> If a value influences progression, difficulty, or rewards,
> it MUST come from the Stats System — or it does not exist.
