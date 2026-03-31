You’re right—the previous model was incorrect. It mixed semantic categories with evaluation logic and forced a single outcome. That contradicts your design.

Below is the corrected **production-grade spec** aligned with your rules.

---

# BADGE_SYSTEM.md

## PROJECT: Guess-History

## SYSTEM: Practice (Solo) Rebuilt

## VERSION: V2 (Corrected — Multi-Badge, Accuracy-Based)

---

# 1. PURPOSE

The Badge System provides **immediate, per-round feedback** based strictly on player accuracy.

It is:

* **Purely round-based**
* **Stateless**
* **Deterministic**
* **Independent from Achievements, Stats, DB**

It produces **0 to 3 badges per round**.

---

# 2. CORE DESIGN PRINCIPLES

### 2.1 No Categories

There are **NO conceptual categories** like:

* perfect
* combo
* time
* location

These were incorrect abstractions.

The system is based only on:

> **Accuracy dimensions + Tier thresholds**

---

### 2.2 Three Independent Axes

Badges are evaluated independently on:

1. **Year Accuracy (WHEN)**
2. **Location Accuracy (WHERE)**
3. **Combo Accuracy (AVERAGE)**

---

### 2.3 Tier System (STRICT)

| Tier   | Label   | Accuracy |
| ------ | ------- | -------- |
| Gold   | Perfect | 100      |
| Silver | Amazing | 99       |
| Bronze | Great   | 98       |

No other tiers exist.
No interpolation.
No rounding up.

---

# 3. INPUT MODEL

```ts
type RoundResult = {
  yearAccuracy: number;       // 0–100 integer
  locationAccuracy: number;   // 0–100 integer
}
```

---

# 4. COMBO DEFINITION

```ts
comboAccuracy = floor((yearAccuracy + locationAccuracy) / 2)
```

### Rules:

* Always **floor**, never round
* Ensures strict threshold behavior

---

# 5. BADGE TYPES

There are exactly **3 possible badge dimensions**:

| Dimension | Meaning                |
| --------- | ---------------------- |
| year      | Accuracy of year guess |
| location  | Accuracy of map guess  |
| combo     | Average performance    |

Each dimension can produce **at most 1 badge**.

---

# 6. BADGE OUTPUT MODEL

```ts
type Badge = {
  dimension: 'year' | 'location' | 'combo';
  tier: 'gold' | 'silver' | 'bronze';
  accuracy: number; // 98, 99, or 100
}
```

---

# 7. EVALUATION RULES

### 7.1 Threshold Function

```ts
function getTier(acc: number): 'gold' | 'silver' | 'bronze' | null {
  if (acc === 100) return 'gold';
  if (acc === 99) return 'silver';
  if (acc === 98) return 'bronze';
  return null;
}
```

---

### 7.2 Independent Evaluation

```ts
yearTier = getTier(yearAccuracy)
locationTier = getTier(locationAccuracy)
comboTier = getTier(comboAccuracy)
```

---

### 7.3 Badge Creation

```ts
badges = []

if (locationTier) {
  badges.push({ dimension: 'location', tier: locationTier, accuracy: locationAccuracy })
}

if (yearTier) {
  badges.push({ dimension: 'year', tier: yearTier, accuracy: yearAccuracy })
}

if (comboTier) {
  badges.push({ dimension: 'combo', tier: comboTier, accuracy: comboAccuracy })
}
```

---

# 8. DISPLAY RULES (CRITICAL)

### 8.1 Maximum Badges

* **0 to 3 badges**
* One per dimension (never duplicates)

---

### 8.2 Ordering (MANDATORY)

Badges must be displayed in this strict order:

```
1. Location (WHERE)
2. Year (WHEN)
3. Combo (AVERAGE) ← ALWAYS LAST
```

### Rationale:

* Combo is a **summary metric**
* Must visually conclude the sequence

---

### 8.3 No Precedence System

There is:

* ❌ No priority
* ❌ No filtering
* ❌ No “best badge”

All qualifying badges are shown.

---

# 9. EXAMPLES (NON-NEGOTIABLE)

---

## Case A

```ts
year = 98
location = 100
```

```
combo = floor((98 + 100)/2) = 99
```

### Output:

1. Location → Gold (100)
2. Year → Bronze (98)
3. Combo → Silver (99)

---

## Case B

```ts
year = 99
location = 99
```

```
combo = 99
```

### Output:

1. Location → Silver
2. Year → Silver
3. Combo → Silver

---

## Case C

```ts
year = 100
location = 97
```

```
combo = 98
```

### Output:

1. Location → ❌ (no badge)
2. Year → Gold
3. Combo → Bronze

---

## Case D

```ts
year = 97
location = 97
```

```
combo = 97
```

### Output:

→ No badges

---

# 10. UI CONTRACT

### 10.1 Responsibilities

UI must:

* Render badges in correct order
* Use correct assets per:

  * dimension
  * tier
* Play:

  * animation
  * sound
  * haptics

---

### 10.2 UI MUST NOT

* Compute accuracy
* Compute combo
* Decide tiers
* Filter badges

---

# 11. ASSET MAPPING (ABSTRACT)

Each badge maps to:

```ts
assetKey = `${dimension}_${tier}`
```

Examples:

* location_gold
* year_bronze
* combo_silver

---

# 12. SYSTEM GUARANTEES

* Deterministic output
* No async
* No state
* No DB dependency
* No cross-round logic
* No achievements coupling

---

# 13. FORBIDDEN (HARD RULES)

* ❌ No precedence system
* ❌ No single-badge enforcement
* ❌ No category abstraction
* ❌ No hidden logic in UI
* ❌ No rounding combo upward
* ❌ No dynamic thresholds

---

# 14. IMPLEMENTATION ENTRY POINT

```ts
function evaluateBadges(round: RoundResult): Badge[]
```

Returns ordered array:

```
[location?, year?, combo?]
```
