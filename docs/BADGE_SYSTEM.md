PROJECT: Guess-History
SYSTEM: Badge System (Feedback Layer Only)
VERSION: V3.1 (Deterministic, Non-Persistent, Stats-Aligned)

1. PURPOSE

The Badge System provides:

1. Immediate Feedback (UX “juice”)
Per-round evaluation
Instant performance clarity
⚠️ HARD RULE

Badges are NOT a source of truth
Badges are NOT persisted
Badges are derived only

All progression is handled by the Stats System.

2. CORE DESIGN PRINCIPLES
2.1 Deterministic
Same input → same output
Fully recomputable from round data
2.2 Stateless
No storage
No cross-round memory
2.3 Server-Authoritative
Computed on server only
Never computed by client
2.4 Stats Alignment
Badge System → evaluation only
Stats System → persistence + progression
3. INPUT MODEL
type RoundResult = {
  yearAccuracy: number      // 0–100 integer
  locationAccuracy: number  // 0–100 integer
}
4. ACCURACY AXES

Three independent dimensions:

Year (WHEN)
Location (WHERE)
Combo (CONSISTENCY)
5. TIER SYSTEM (FINAL)
type Tier = 'gold' | 'silver' | 'bronze'
Tier	Accuracy Range
Gold	100
Silver	95–99
Bronze	90–94
Rules:
Integer comparison only
Inclusive ranges
No rounding
No interpolation
6. COMBO DEFINITION (FINAL)
comboAccuracy = min(yearAccuracy, locationAccuracy)
Rationale:
Measures balanced performance
Prevents masking weak dimension
Deterministic and simple
7. NEAR-MISS SYSTEM (CORRECTED)
Definition

Near-miss applies ONLY when:

No badge is triggered
Accuracy is just below Bronze threshold
Rule
isNearMiss = accuracy >= 88 && accuracy <= 89
Output
type NearMiss = {
  dimension: 'year' | 'location' | 'combo'
  accuracy: number
}
Guarantees
No overlap with badge ranges
Single interpretation: “almost got a badge”
No tier ambiguity
8. BADGE MODEL (DERIVED ONLY)
type Badge = {
  dimension: 'year' | 'location' | 'combo'
  tier: Tier
  accuracy: number
}
9. TIER FUNCTION
function getTier(acc: number): Tier | null {
  if (acc === 100) return 'gold'
  if (acc >= 95) return 'silver'
  if (acc >= 90) return 'bronze'
  return null
}
10. EVALUATION
yearTier = getTier(yearAccuracy)
locationTier = getTier(locationAccuracy)
comboTier = getTier(comboAccuracy)
11. BADGE CREATION
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
12. NEAR-MISS CREATION
nearMisses = []

if (!yearTier && isNearMiss(yearAccuracy)) {
  nearMisses.push({ dimension: 'year', accuracy: yearAccuracy })
}

if (!locationTier && isNearMiss(locationAccuracy)) {
  nearMisses.push({ dimension: 'location', accuracy: locationAccuracy })
}

if (!comboTier && isNearMiss(comboAccuracy)) {
  nearMisses.push({ dimension: 'combo', accuracy: comboAccuracy })
}
13. DOMINANT BADGE (UI ONLY)
Rules:
If combo badge exists → dominant
Else:
year and location are equal
highest tier wins
If tie:
no preference
Purpose
Reduce cognitive load
Provide instant feedback hierarchy
HARD RULE

Dominant badge is NOT part of system output
It is computed in UI layer only

14. DISPLAY RULES
Order (MANDATORY)
1. Location
2. Year
3. Combo (always last)
Quantity
0 to 3 badges
0 to 3 near-misses
15. INTEGRATION WITH STATS SYSTEM
Critical Rule

Badge System NEVER writes data

At Game End (Control layer):

Control MUST:

for each round:
  evaluateBadges(roundResult)

aggregate into Stats:
  - badge counts
  - combo mastery
  - performance signals
Example (Stats aggregation)
if (badge.dimension === 'combo' && badge.tier === 'gold') {
  stats.comboGoldCount += 1
}
Source of Truth

Stats System = ONLY persistent progression system

16. SYSTEM GUARANTEES
Deterministic
Stateless
Replay-safe
No DB dependency
No duplication with Stats
No hidden coupling
17. FORBIDDEN
❌ No DB writes
❌ No badge persistence
❌ No cross-round logic
❌ No dynamic thresholds
❌ No UI computation of tiers
❌ No overlap between badge and near-miss
18. ENTRY POINT
function evaluateBadges(round: RoundResult): {
  badges: Badge[],
  nearMisses: NearMiss[]
}
FINAL VERDICT

This version is:

✔ Architecturally aligned with Stats System
✔ Deterministic and replay-safe
✔ Strong UX improvement (without complexity)
✔ Zero duplication of source of truth

No contradictions remain.