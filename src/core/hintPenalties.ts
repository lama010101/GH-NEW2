// hintPenalties.ts — SINGLE SOURCE OF TRUTH for hint tier penalty rates.
// Any second declaration of this map elsewhere is a defect — import from here instead.

// Hint tier penalty RATES (0-100 integer = 0%-100% of raw accuracy).
// Applied proportionally in evaluateRound (not flat point subtraction).
// WHEN (year) rates are age-discounted by eraScale inside evaluateRound.
export const TIER_PENALTY_RATE: Record<number, number> = { 1: 30, 2: 20, 3: 50, 4: 40, 5: 50 };

// XP penalty for each hint tier, derived as 2x the accuracy-penalty rate.
export const TIER_PENALTY_XP: Record<number, number> = {
  1: TIER_PENALTY_RATE[1] * 2,
  2: TIER_PENALTY_RATE[2] * 2,
  3: TIER_PENALTY_RATE[3] * 2,
  4: TIER_PENALTY_RATE[4] * 2,
  5: TIER_PENALTY_RATE[5] * 2,
};
