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

---

## 3. DISTANCE CALCULATION

Distance must be computed using deterministic haversine formula.

Constraint:
- identical implementation for all executions
- no approximation differences allowed

---

## 4. LOCATION SCORE

locationAccuracy = max(
  0,
  100 - (distanceKm / MAX_DISTANCE_KM) * 100
)

locationScore = round(locationAccuracy)

---

## 5. TIME SCORE

yearDiff = abs(guess_year - actual_year)

yearAccuracy = max(
  0,
  100 - (yearDiff / MAX_YEAR_DIFF) * 100
)

timeScore = round(yearAccuracy)

---

## 6. HINT PENALTY

Definition:
- hints reduce score deterministically

Rule:
- penalty must be derived ONLY from hints_used

Example (baseline, can be tuned):

penaltyPerHint = 5

penalty = hints_used * penaltyPerHint

---

## 7. FINAL SCORE

rawScore = locationScore + timeScore   // 0 → 200

finalScore = max(0, rawScore - penalty)

accuracy = round((rawScore / 200) * 100)

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
- same inputs from DB
- same constants

Output MUST be identical.

No randomness allowed.

---

## 10. FORBIDDEN

- Client-side scoring
- Multiple scoring formulas
- Hidden modifiers
- Time-based score variation
- Non-deterministic math

---

## 11. VALIDATION RULE

If recomputing scores from DB yields different results:

→ SYSTEM FAILURE