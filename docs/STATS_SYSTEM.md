
# STATS_SYSTEM.md

## PROJECT: Guess-History

## SYSTEM: Stats System (Single Source of Truth)

## VERSION: V2 (Badge-Aligned, Deterministic, Scalable)

---

# 1. PURPOSE

The Stats System is the **only authority for all persistent player performance data across games**.

It exists to:

* Track long-term player performance
* Enable progression systems (badges, skill metrics, analytics)
* Provide deterministic, replayable metrics

---

# 2. HARD RULES

## 2.1 Single Source of Truth

> ALL persistent progression data MUST live here

* No duplication allowed
* No parallel systems

---

## 2.2 Single Writer Principle

> ONLY Control can update stats

* No other system may mutate Stats
* Badge System is strictly read-only

---

## 2.3 Read-Only Consumers

Allowed readers:

* Badge System
* UI
* Analytics

---

## 2.4 Deterministic Updates

* Updates occur ONLY at **Game End**
* Must be reproducible from DB state

---

## 2.5 No Session Leakage

* Game/session state MUST NOT store long-term metrics
* Stats must persist independently

---

# 3. SYSTEM OWNERSHIP

| Layer        | Responsibility            |
| ------------ | ------------------------- |
| Control      | Triggers updates          |
| Stats System | Stores + aggregates       |
| Badge System | Evaluation only (derived) |
| UI           | Read-only                 |

---

# 4. LIFECYCLE

## 4.1 Round Lifecycle (NO WRITE)

```text
Round End
→ score computed
→ stored in round_results
→ badges evaluated (NOT persisted)
```

---

## 4.2 Game Lifecycle (ONLY WRITE POINT)

```text
Game End
→ Control loads all round_results
→ Control evaluates badges (derived)
→ Control aggregates stats
→ Stats System updated
→ Stats persisted
```

---

## 4.3 Persistence

Stats MUST:

* Persist after each game
* Be reloadable before next session
* Support versioning

---

# 5. DATA MODEL (AUTHORITATIVE)

```ts
Stats = {
  version: number

  totalGamesPlayed: number
  totalRoundsPlayed: number

  averageScore: number

  accuracy: {
    global: number
    byYear: Record<number, number>
    byDecade: Record<number, number>
    byCentury: Record<number, number>
    byCountry: Record<string, number>
  }

  distribution: {
    scoreBuckets: Record<string, number>
  }

  // --- Badge-derived progression (NEW) ---
  badges: {
    total: {
      gold: number
      silver: number
      bronze: number
    }

    byDimension: {
      year: {
        gold: number
        silver: number
        bronze: number
      }
      location: {
        gold: number
        silver: number
        bronze: number
      }
      combo: {
        gold: number
        silver: number
        bronze: number
      }
    }

    comboMasteryRate: number
    goldRate: number
  }
}
```

---

# 6. DEFINITIONS

## 6.1 averageScore

* Mean of all round scores across all games

---

## 6.2 accuracy.global

* Mean accuracy across all rounds

---

## 6.3 accuracy.byYear / byDecade / byCentury

* Updated at write-time only
* NEVER computed dynamically

---

## 6.4 distribution.scoreBuckets

Example:

```ts
0–20
21–40
41–60
61–80
81–100
```

---

## 6.5 badges.total

* Total number of badges earned across all rounds

---

## 6.6 badges.byDimension

* Distribution of badges per axis:

  * year
  * location
  * combo

---

## 6.7 comboMasteryRate

```ts
comboGoldCount / totalRoundsPlayed
```

---

## 6.8 goldRate

```ts
totalGoldBadges / totalBadges
```

---

# 7. INPUT (FROM CONTROL)

At Game End:

```ts
GameResultPayload = {
  rounds: [
    {
      year: number
      country: string
      score: number
      yearAccuracy: number
      locationAccuracy: number
    }
  ]
}
```

---

# 8. UPDATE LOGIC (STRICT)

## 8.1 Per Round

For EACH round:

* increment totalRoundsPlayed

Update:

* accuracy.global
* accuracy.byYear
* accuracy.byCountry
* score distribution

---

## 8.2 Badge Evaluation (DERIVED)

```ts
badges = evaluateBadges(round)
```

---

## 8.3 Badge Aggregation

For EACH badge:

```ts
stats.badges.total[tier] += 1
stats.badges.byDimension[dimension][tier] += 1
```

---

## 8.4 Combo Mastery

```ts
if combo badge exists AND tier === 'gold':
  comboGoldCount += 1
```

---

## 8.5 After All Rounds

* increment totalGamesPlayed
* update averageScore

---

## 8.6 Running Average Formula

```ts
newAvg = (oldAvg * count + newValue) / (count + 1)
```

---

## 8.7 Derived Metrics (WRITE-TIME ONLY)

```ts
decade = floor(year / 10) * 10
century = floor(year / 100) * 100
```

Update:

* accuracy.byDecade
* accuracy.byCentury

---

# 9. STATE OWNERSHIP

| Data           | Owner        |
| -------------- | ------------ |
| Stats          | Stats System |
| Update Trigger | Control      |
| Badges         | Derived only |

---

# 10. ACCESS RULES

## Allowed

* UI
* Badge System
* Analytics

---

## Forbidden

* Direct mutation outside Control
* Badge System writing stats
* UI updating stats

---

# 11. ANTI-PATTERNS (FORBIDDEN)

* ❌ Recomputing stats from history
* ❌ Persisting badges separately
* ❌ Multiple stat systems
* ❌ Session-based stat reuse
* ❌ UI caching as source of truth
* ❌ Badge counters outside Stats

---

# 12. EXTENSIBILITY RULES

New metrics MUST:

* Be added here
* Follow single-writer rule
* Be updated at Game End
* Be deterministic

---

# 13. VERSIONING

```ts
Stats.version: number
```

Required for:

* migrations
* backward compatibility

---

# 14. VALIDATION CHECKLIST

Stats System is valid ONLY IF:

* [ ] Single writer (Control only)
* [ ] Updated ONLY at Game End
* [ ] No duplication anywhere else
* [ ] Deterministic updates
* [ ] Badge System is read-only
* [ ] Fully reloadable

---

# 15. FINAL PRINCIPLE

> If a value influences progression, ranking, or rewards,
> it MUST exist in the Stats System — or it does not exist.
