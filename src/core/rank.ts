// Rank system — rank is derived from player_global_stats.total_xp (flag off)
// or stored as a high-water mark in player_global_stats.max_rank_tier
// (flag on: NEXT_PUBLIC_RANK_ACCURACY_GATE).
// Single source of truth for thresholds and gate constants.
// See migrations/028_create_player_global_stats.sql and
// supabase/migrations/20261103100000_pgs_max_rank_tier.sql.

export interface RankTier {
  tier: number;        // 1..10
  titleKey: string;    // i18n key under `rank` namespace, e.g. "rank_1"
  threshold: number;   // XP required to REACH this tier (tier 1 = 0)
  iconName: RankIconName;
}

export type RankIconName =
  | 'footprint'
  | 'compass'
  | 'trail'
  | 'map'
  | 'telescope'
  | 'astrolabe'
  | 'scroll'
  | 'tome'
  | 'owl'
  | 'crown';

// Ordered ascending by threshold. tier 1 is the starting rank (0 XP).
export const RANKS: readonly RankTier[] = [
  { tier: 1,  titleKey: 'rank_1',  threshold: 0,       iconName: 'footprint' },
  { tier: 2,  titleKey: 'rank_2',  threshold: 1_000,   iconName: 'compass' },
  { tier: 3,  titleKey: 'rank_3',  threshold: 5_000,   iconName: 'trail' },
  { tier: 4,  titleKey: 'rank_4',  threshold: 20_000,  iconName: 'map' },
  { tier: 5,  titleKey: 'rank_5',  threshold: 50_000,  iconName: 'telescope' },
  { tier: 6,  titleKey: 'rank_6',  threshold: 125_000, iconName: 'astrolabe' },
  { tier: 7,  titleKey: 'rank_7',  threshold: 300_000, iconName: 'scroll' },
  { tier: 8,  titleKey: 'rank_8',  threshold: 600_000, iconName: 'tome' },
  { tier: 9,  titleKey: 'rank_9',  threshold: 1_200_000, iconName: 'owl' },
  { tier: 10, titleKey: 'rank_10', threshold: 2_500_000, iconName: 'crown' },
] as const;

export interface RankInfo {
  tier: number;
  titleKey: string;
  iconName: RankIconName;
  threshold: number;        // XP at which current tier was reached
  nextThreshold: number | null;  // null when at max tier
  nextTitleKey: string | null;   // i18n key for next tier title (null at max)
  progressPct: number;      // 0..100 progress between current and next tier
  xpIntoTier: number;       // XP earned since reaching current tier
  xpToNext: number | null;  // XP remaining to next tier (null at max)
  isMaxRank: boolean;
}

// Shared RankInfo builder for the tier at RANKS[currentIdx] under `xp`
// (already floored/clamped). Single implementation for rankForXp + resolveRank.
function rankInfoAt(currentIdx: number, xp: number): RankInfo {
  const current = RANKS[currentIdx];
  const next = currentIdx < RANKS.length - 1 ? RANKS[currentIdx + 1] : null;
  const isMaxRank = next === null;

  const xpIntoTier = xp - current.threshold;
  const xpToNext = next ? next.threshold - xp : null;
  const span = next ? next.threshold - current.threshold : 0;
  const progressPct = next
    ? Math.min(100, Math.max(0, Math.round((xpIntoTier / span) * 100)))
    : 100;

  return {
    tier: current.tier,
    titleKey: current.titleKey,
    iconName: current.iconName,
    threshold: current.threshold,
    nextThreshold: next ? next.threshold : null,
    nextTitleKey: next ? next.titleKey : null,
    progressPct,
    xpIntoTier,
    xpToNext,
    isMaxRank,
  };
}

// Pure: derive rank from total XP. No state, no fetches, no side effects.
// totalXp < 0 is clamped to 0. totalXp above max tier returns isMaxRank.
export function rankForXp(totalXp: number): RankInfo {
  const xp = Math.max(0, Math.floor(totalXp));

  // Find highest tier whose threshold <= xp.
  let currentIdx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].threshold) currentIdx = i;
    else break;
  }

  return rankInfoAt(currentIdx, xp);
}

// ── Accuracy gate (RANK-BUILD-ACCGATE-1103-003) ─────────────────────────────
// Flag-gated high-water-mark rank. When NEXT_PUBLIC_RANK_ACCURACY_GATE is on,
// promotion to a tier additionally requires rolling accuracy (AVG of
// (location_score + time_score)/2 over the last RANK_GATE_WINDOW_ROUNDS counted
// rounds — sessions.mode in RANK_GATE_COUNTED_MODES only, practice/journey
// excluded) to meet that tier's floor, and at least RANK_GATE_MIN_ROUNDS
// counted rounds sampled. Rank never demotes: the server stores the best tier
// reached in player_global_stats.max_rank_tier.

// Accuracy floor per tier (percent). 0 = XP-only promotion (tiers 1–2).
export const RANK_ACCURACY_FLOORS: Readonly<Record<number, number>> = {
  1: 0,
  2: 0,
  3: 25,
  4: 28,
  5: 31,
  6: 34,
  7: 37,
  8: 40,
  9: 43,
  10: 45,
} as const;

export const RANK_GATE_WINDOW_ROUNDS = 200;
export const RANK_GATE_MIN_ROUNDS = 50;
export const RANK_GATE_COUNTED_MODES = ['sync', 'async', 'daily', 'compete'] as const;

// Single flag read — identical on client (NEXT_PUBLIC_* inlined at build) and
// server. Default OFF.
export function rankAccuracyGateEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RANK_ACCURACY_GATE === 'true';
}

// Gate evaluation for the tier above `tier` (null when already at max).
export interface RankGateInfo {
  nextTier: number;
  xpMet: boolean;
  accuracyFloor: number;
  rollingAccPct: number | null;
  accuracyMet: boolean;
  roundsSampled: number;
  minRounds: number;
  sampleMet: boolean;
}

// Pure: highest tier reachable from the stored high-water mark given the gate.
// Promotes one tier at a time, stopping at the first unmet condition. Result
// is never below maxRankTier (clamped to 1..10).
export function evaluatePromotion(
  totalXp: number,
  maxRankTier: number,
  rollingAccPct: number | null,
  roundsSampled: number
): number {
  const xp = Math.max(0, Math.floor(totalXp));
  let tier = Math.min(RANKS.length, Math.max(1, Math.floor(maxRankTier)));

  while (tier < RANKS.length) {
    const next = RANKS[tier]; // candidate tier = tier + 1
    if (xp < next.threshold) break;
    const floor = RANK_ACCURACY_FLOORS[next.tier] ?? 0;
    if (floor > 0) {
      if (rollingAccPct === null || rollingAccPct < floor) break;
      if (roundsSampled < RANK_GATE_MIN_ROUNDS) break;
    }
    tier = next.tier;
  }
  return tier;
}

export interface ResolvedRank extends RankInfo {
  gate: RankGateInfo | null;
}

// Pure: full RankInfo anchored at the gated high-water-mark tier, plus the
// gate evaluation for the next tier (null at max rank).
export function resolveRank(
  totalXp: number,
  input: { maxRankTier: number; rollingAccPct: number | null; roundsSampled: number }
): ResolvedRank {
  const xp = Math.max(0, Math.floor(totalXp));
  const tier = evaluatePromotion(xp, input.maxRankTier, input.rollingAccPct, input.roundsSampled);
  const info = rankInfoAt(tier - 1, xp);

  let gate: RankGateInfo | null = null;
  const next = info.tier < RANKS.length ? RANKS[info.tier] : null;
  if (next) {
    const accuracyFloor = RANK_ACCURACY_FLOORS[next.tier] ?? 0;
    gate = {
      nextTier: next.tier,
      xpMet: xp >= next.threshold,
      accuracyFloor,
      rollingAccPct: input.rollingAccPct,
      accuracyMet:
        accuracyFloor === 0 ||
        (input.rollingAccPct !== null && input.rollingAccPct >= accuracyFloor),
      roundsSampled: input.roundsSampled,
      minRounds: RANK_GATE_MIN_ROUNDS,
      sampleMet:
        accuracyFloor === 0 || input.roundsSampled >= RANK_GATE_MIN_ROUNDS,
    };
  }

  return { ...info, gate };
}
