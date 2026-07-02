// Rank system — pure derivation from player_global_stats.total_xp.
// Single source of truth: total_xp (DB column). Rank is NEVER stored.
// See migrations/028_create_player_global_stats.sql for the source column.

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
