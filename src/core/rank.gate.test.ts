import { describe, expect, it } from "vitest";
import {
  RANK_ACCURACY_FLOORS,
  RANK_GATE_COUNTED_MODES,
  RANK_GATE_MIN_ROUNDS,
  RANK_GATE_WINDOW_ROUNDS,
  RANKS,
  evaluatePromotion,
  rankForXp,
  resolveRank,
} from "./rank";

// RANK-BUILD-ACCGATE-1103-003: pure gate matrix for evaluatePromotion +
// resolveRank. Floors: t1-2 = 0 (XP only), t3 = 25, t4 = 28, t5 = 31.

describe("rank gate constants", () => {
  it("window/min/modes match the locked design", () => {
    expect(RANK_GATE_WINDOW_ROUNDS).toBe(200);
    expect(RANK_GATE_MIN_ROUNDS).toBe(50);
    expect([...RANK_GATE_COUNTED_MODES]).toEqual(["sync", "async", "daily", "compete"]);
  });

  it("accuracy floors are monotonic non-decreasing across tiers 1..10", () => {
    const floors = RANKS.map((r) => RANK_ACCURACY_FLOORS[r.tier]);
    expect(floors).toEqual([0, 0, 25, 28, 31, 34, 37, 40, 43, 45]);
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]).toBeGreaterThanOrEqual(floors[i - 1]);
    }
  });
});

describe("evaluatePromotion", () => {
  it("tiers 1→2 need no accuracy or sample (floor 0)", () => {
    expect(evaluatePromotion(1_500, 1, null, 0)).toBe(2);
  });

  it("boundary XP: exactly at the tier-3 threshold promotes when gate is met", () => {
    expect(evaluatePromotion(5_000, 2, 25, 50)).toBe(3);
    expect(evaluatePromotion(4_999, 2, 100, 200)).toBe(2);
  });

  it("accuracy just below the floor blocks; at the floor promotes", () => {
    expect(evaluatePromotion(5_000, 2, 24.9, 50)).toBe(2);
    expect(evaluatePromotion(5_000, 2, 25, 50)).toBe(3);
  });

  it("sample of 49 counted rounds blocks; 50 promotes", () => {
    expect(evaluatePromotion(5_000, 2, 60, 49)).toBe(2);
    expect(evaluatePromotion(5_000, 2, 60, 50)).toBe(3);
  });

  it("stops after one tier when XP spans two thresholds but accuracy only meets the first floor", () => {
    // XP 21_000 passes t3 (5_000) and t4 (20_000); acc 26 >= 25 but < 28.
    expect(evaluatePromotion(21_000, 2, 26, 200)).toBe(3);
  });

  it("promotes sequentially through multiple tiers when every gate is met", () => {
    expect(evaluatePromotion(21_000, 1, 30, 200)).toBe(4);
  });

  it("never demotes: stored tier above what current data supports stays", () => {
    expect(evaluatePromotion(0, 8, null, 0)).toBe(8);
    expect(evaluatePromotion(100, 8, 0, 0)).toBe(8);
  });

  it("NULL accuracy blocks floors > 0 but not floor-0 tiers", () => {
    expect(evaluatePromotion(5_000, 2, null, 200)).toBe(2);
    expect(evaluatePromotion(5_000, 1, null, 0)).toBe(2); // t2 floor 0, t3 needs acc
  });

  it("caps at tier 10", () => {
    expect(evaluatePromotion(9_999_999, 9, 100, 200)).toBe(10);
    expect(evaluatePromotion(9_999_999, 10, 100, 200)).toBe(10);
  });

  it("clamps a stored tier outside 1..10", () => {
    expect(evaluatePromotion(0, 0, null, 0)).toBe(1);
    expect(evaluatePromotion(0, 11, null, 0)).toBe(10);
  });
});

describe("resolveRank", () => {
  it("anchors RankInfo at the gated tier, not the XP-derived tier", () => {
    // XP 6_000 would be t3 via rankForXp, but acc 20 < 25 holds t2.
    const r = resolveRank(6_000, { maxRankTier: 2, rollingAccPct: 20, roundsSampled: 100 });
    expect(rankForXp(6_000).tier).toBe(3);
    expect(r.tier).toBe(2);
    expect(r.titleKey).toBe("rank_2");
    expect(r.gate?.nextTier).toBe(3);
    expect(r.gate?.xpMet).toBe(true);
    expect(r.gate?.accuracyFloor).toBe(25);
    expect(r.gate?.rollingAccPct).toBe(20);
    expect(r.gate?.accuracyMet).toBe(false);
    expect(r.gate?.roundsSampled).toBe(100);
    expect(r.gate?.minRounds).toBe(50);
    expect(r.gate?.sampleMet).toBe(true);
  });

  it("reports the sample shortfall when accuracy is met but rounds are not", () => {
    const r = resolveRank(6_000, { maxRankTier: 2, rollingAccPct: 40, roundsSampled: 30 });
    expect(r.tier).toBe(2);
    expect(r.gate?.accuracyMet).toBe(true);
    expect(r.gate?.sampleMet).toBe(false);
    expect(r.gate?.roundsSampled).toBe(30);
  });

  it("gate is null at max tier", () => {
    const r = resolveRank(3_000_000, { maxRankTier: 10, rollingAccPct: 90, roundsSampled: 200 });
    expect(r.tier).toBe(10);
    expect(r.isMaxRank).toBe(true);
    expect(r.gate).toBeNull();
  });

  it("never demotes: stored tier above what data supports stays, gate reflects the next tier", () => {
    const r = resolveRank(0, { maxRankTier: 8, rollingAccPct: null, roundsSampled: 0 });
    expect(r.tier).toBe(8);
    expect(r.gate?.nextTier).toBe(9);
    expect(r.gate?.xpMet).toBe(false);
  });

  it("promoted tier reports the next gate (floor-0 next tier needs no sample)", () => {
    const r = resolveRank(1_500, { maxRankTier: 1, rollingAccPct: null, roundsSampled: 0 });
    expect(r.tier).toBe(2);
    expect(r.gate?.nextTier).toBe(3);
    expect(r.gate?.xpMet).toBe(false); // 1_500 < 5_000
    expect(r.gate?.accuracyFloor).toBe(25);
  });
});
