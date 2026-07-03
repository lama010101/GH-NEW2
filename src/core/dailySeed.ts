// dailySeed.ts — Daily mode seed + seeded event selection (DAILY_MODE_SPEC.md §4.4).
// Single source of truth for the daily seed function and seeded event-id selection.
// Standing rule: any constant/logic referenced in 2+ files lives in exactly one
// exported location.

import { createHash } from "crypto";

/**
 * dailySeed — deterministic seed from a UTC date string.
 * §4.4: abs(int64 from first 8 bytes of sha256("YYYY-MM-DD"))
 * @param dateIso — UTC date in ISO format "YYYY-MM-DD" (no time component)
 * @returns non-negative bigint fitting in int64
 */
export function dailySeed(dateIso: string): bigint {
  const hash = createHash("sha256").update(dateIso, "utf8").digest();
  const first8 = hash.subarray(0, 8);
  const raw = first8.readBigInt64BE(0);
  // abs — two's complement: if negative, negate
  return raw < 0n ? -raw : raw;
}

/**
 * selectDailyEventIds — seeded PRNG shuffle over the full eligible pool,
 * take first 5. Deterministic: same seed + same pool → same 5 IDs in same order.
 * Uses a mulberry32 PRNG seeded from the lower 32 bits of the daily seed.
 * @param seed — bigint from dailySeed()
 * @param allEligibleIds — all eligible event IDs (status='validated', has
 *   location with lat/lng, continent in VALID_CONTINENTS, full year range)
 * @returns exactly 5 UUID strings in round order
 */
export function selectDailyEventIds(seed: bigint, allEligibleIds: string[]): string[] {
  if (allEligibleIds.length < 5) {
    throw new Error(`Daily challenge requires at least 5 eligible events, got ${allEligibleIds.length}`);
  }

  // mulberry32 PRNG — seed from lower 32 bits of the bigint seed
  const seed32 = Number(seed & 0xffffffffn);
  let state = seed32 >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Fisher-Yates shuffle (partial — only need first 5)
  const ids = [...allEligibleIds];
  for (let i = 0; i < 5; i++) {
    const j = i + Math.floor(next() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 5);
}
