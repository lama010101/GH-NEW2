# SCORING SPECIFICATION (SERVER AUTHORITATIVE)

## 0. SOURCE OF TRUTH

This document defines the ONLY valid scoring system.

Rules:
- Scoring is computed ONLY on the server
- Scoring must be 100% deterministic
- Scoring must be recomputable from DB data only
- Client MUST NOT compute or infer score

Violation = system invalid

---

## 1. INPUT DATA (FROM DB)

Source: `round_commits`

For each player:

- guess_lat
- guess_lng
- guess_year
- hints_used
- submitted_at

Source: event data (server-side)

- actual_lat
- actual_lng
- actual_year

---

## 2. CONSTANTS

MAX_DISTANCE_KM = 20000
MAX_YEAR_DIFF = 200

MAX_LOCATION_SCORE = 100
MAX_TIME_SCORE = 100

DISTANCE_DECAY_KM = 1500      // exp decay constant for location
YEAR_DECAY = 40               // exp decay constant for year
ERA_SCALE_FLOOR = 50          // events younger than this get no era forgiveness

---

## 3. DISTANCE CALCULATION

Distance must be computed using deterministic haversine formula.

Constraint:
- identical implementation for all executions
- no approximation differences allowed

---

## 4. LOCATION SCORE

Exponential decay (NOT linear):

locationAccuracy = floor(clamp(100 * exp(-distanceKm / DISTANCE_DECAY_KM), 0, 100))

- 0 km → 100%
- ~1500 km → ~37%
- ~20000 km (antipodal) → 0%

locationScore = locationAccuracy

---

## 5. TIME SCORE

yearDiff = abs(guess_year - actual_year)

Era scaling: older events are harder to guess the year for, so the effective
year difference is divided by eraScale (>= 1). referenceYear is frozen at
session creation (sessions.scoring_reference_year) to guarantee recomputability
from DB — never use wall-clock time.

eraScale = sqrt(max(ERA_SCALE_FLOOR, referenceYear - eventYear) / ERA_SCALE_FLOOR)

effectiveDiff = yearDiff / eraScale

yearAccuracy = floor(clamp(100 * exp(-effectiveDiff / YEAR_DECAY), 0, 100))

- exact match → 100%
- 1 year off on recent event (eraScale=1) → 97%
- 100 years off on 1969 event (eraScale≈1.06) → 9%
- 100 years off on 1500 event (eraScale≈3.24) → 46% (forgiveness for old event)

timeScore = yearAccuracy

---

## 6. HINT PENALTY (PROPORTIONAL + AGE-DISCOUNTED)

Definition:
- hints reduce score deterministically
- penalties are RATES (0-100 integer = 0%-100%), NOT flat point subtraction
- applied PROPORTIONALLY to raw accuracy (fair to both strong and weak players)
- WHEN (year) penalties are age-discounted by eraScale (older events → smaller
  effective penalty, since year-guessing is harder)
- WHERE (location) penalties are NOT age-discounted (location difficulty does
  not track event age)

Tier penalty rates (fixed per hint at content creation time):

| Tier | Rate | Typical hint type |
|---|---|---|
| 1 | 10% | Vague — era, broad continent |
| 2 | 20% | Moderate — decade, region |
| 3 | 30% | Strong — country, approximate year |
| 4 | 40% | Near-definitive — city, specific era |
| 5 | 50% | Definitive — exact location or year |

Rates are additive per axis, capped at 100.

penaltyWhenRate  = sum of tier rates for 'when' hints,  capped 100
penaltyWhereRate = sum of tier rates for 'where' hints, capped 100

---

## 7. FINAL SCORE

eraScale = sqrt(max(ERA_SCALE_FLOOR, referenceYear - eventYear) / ERA_SCALE_FLOOR)

whenRate  = clamp(penaltyWhenRate  / eraScale, 0, 100) / 100   // age-discounted
whereRate = clamp(penaltyWhereRate, 0, 100) / 100              // no age discount

yearAccuracyFinal     = floor(yearAccuracy     * (1 - whenRate))
locationAccuracyFinal = floor(locationAccuracy * (1 - whereRate))

rawScore = yearAccuracyFinal + locationAccuracyFinal   // 0 → 200

finalScore = rawScore

accuracy = round((yearAccuracyFinal + locationAccuracyFinal) / 2)

Note: proportional application guarantees a hint can never make you worse than 0
(you always keep (1 - rate) of your raw accuracy). This fixes the regressive
punishment of the old flat-subtraction model.

---

## 8. OUTPUT (WRITE TO DB)

Table: `round_results`

For each player:

- score (finalScore)
- accuracy
- location_score
- time_score
- distance_km
- year_diff
- hints_used

---

## 9. DETERMINISM GUARANTEE

Given:
- same inputs from DB (including sessions.scoring_reference_year)
- same constants

Output MUST be identical.

No randomness allowed.

The scoring reference year is frozen at session creation
(sessions.scoring_reference_year) and read from the DB at computation time.
Wall-clock time (e.g. `new Date().getFullYear()`) MUST NOT influence scoring.

---

## 10. FORBIDDEN

- Client-side scoring
- Multiple scoring formulas
- Hidden modifiers
- Time-based score variation (wall-clock dependent scoring)
- Non-deterministic math
- Hardcoded CURRENT_YEAR constants in scoring functions

---

## 11. VALIDATION RULE

If recomputing scores from DB yields different results:

→ SYSTEM FAILURE