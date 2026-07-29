import { describe, expect, it } from "vitest";
import { evaluateRound, applyHintPenalty } from "./rules";

const MOON_LANDING_EVENT = {
  id: "moon-landing",
  title: "Moon Landing",
  description: "Apollo 11 lands on the Moon",
  year: 1969,
  location: {
    id: "moon-landing",
    name: "Mare Tranquillitatis, Moon",
    lat: 0.67408,
    lng: 23.47297
  },
  region: "Space",
  imageUrl: null,
  thumbUrl: null,
  hints: []
};

describe("scoring calibration", () => {
  describe("perfect guess → 100% accuracy", () => {
    it("returns 100% year accuracy for exact year match", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0, lng: 0 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.yearAccuracy).toBe(100);
    });

    it("returns 100% location accuracy for exact location match", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1900, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.locationAccuracy).toBe(100);
    });

    it("returns 100% combo accuracy for perfect year and location", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.comboAccuracy).toBe(100);
      expect(result.roundAccuracy).toBe(100);
      expect(result.badges).toHaveLength(3);
      expect(result.badges.every(b => b.tier === "gold")).toBe(true);
    });
  });

  describe("no guess → 0% accuracy", () => {
    it("returns 0% year accuracy when year is null", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: null, location: { lat: 0, lng: 0 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.yearAccuracy).toBe(0);
    });

    it("returns 0% location accuracy when location is null", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: null },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.locationAccuracy).toBe(0);
    });

    it("returns 0% accuracy when both inputs are null (timeout)", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: null, location: null },
        0,
        true,
        0,
        0,
        2025
      );
      expect(result.yearAccuracy).toBe(0);
      expect(result.locationAccuracy).toBe(0);
      expect(result.comboAccuracy).toBe(0);
      expect(result.roundAccuracy).toBe(0);
      expect(result.roundXp).toBe(0);
      expect(result.didTimeout).toBe(true);
      expect(result.badges).toHaveLength(0);
    });
  });

  describe("per-axis hint penalties", () => {
    it("penaltyWhen reduces year accuracy only (proportional + age-discounted)", () => {
      // MOON_LANDING_EVENT year=1969, referenceYear=2025 (default)
      // eraScale = sqrt(max(50, 2025-1969)/50) = sqrt(56/50) = 1.0583
      // penaltyWhenRate=30 → whenRate = 30/1.0583/100 = 0.2835
      // yearFinal = floor(100 * (1 - 0.2835)) = floor(71.65) = 71
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        30,  // penaltyWhenRate: tier-3 WHEN hint (30% rate)
        0    // penaltyWhereRate: none
      , 2025);
      expect(result.yearAccuracy).toBe(71);
      expect(result.locationAccuracy).toBe(100);
      expect(result.roundAccuracy).toBe(86);
      expect(result.roundXp).toBe(171);
    });

    it("penaltyWhere reduces location accuracy only (proportional, no age-discount)", () => {
      // penaltyWhereRate=20 → whereRate = 20/100 = 0.2
      // locFinal = floor(100 * 0.8) = 80
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,   // penaltyWhenRate: none
        20   // penaltyWhereRate: tier-2 WHERE hint (20% rate)
      , 2025);
      expect(result.yearAccuracy).toBe(100);
      expect(result.locationAccuracy).toBe(80);
      expect(result.roundAccuracy).toBe(90);
      expect(result.roundXp).toBe(180);
    });

    it("both penalties applied independently", () => {
      // penaltyWhenRate=10 → whenRate = 10/1.0583/100 = 0.0945
      // yearFinal = floor(100 * 0.9055) = 90
      // penaltyWhereRate=40 → whereRate = 0.4, locFinal = floor(100 * 0.6) = 60
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        10,  // penaltyWhenRate: tier-1 WHEN hint
        40   // penaltyWhereRate: tier-4 WHERE hint
      , 2025);
      expect(result.yearAccuracy).toBe(90);
      expect(result.locationAccuracy).toBe(60);
      expect(result.roundAccuracy).toBe(75);
      expect(result.roundXp).toBe(150);
    });

    it("penalty capped at 100 per axis — cannot go below 0", () => {
      // penaltyWhenRate=150 → clamp(150/1.0583, 0, 100) = 100 → whenRate = 1.0
      // penaltyWhereRate=200 → clamp(200, 0, 100) = 100 → whereRate = 1.0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        150,  // penaltyWhenRate: exceeds 100
        200   // penaltyWhereRate: exceeds 100
      , 2025);
      expect(result.yearAccuracy).toBe(0);
      expect(result.locationAccuracy).toBe(0);
      expect(result.roundAccuracy).toBe(0);
      expect(result.roundXp).toBe(0);
    });
  });

  describe("proportional penalty fairness", () => {
    it("weak player loses proportionally equal to strong player (not regressive)", () => {
      // Both buy tier-3 WHEN hint (30% rate), referenceYear=2025 (default), event year=1969
      // eraScale = 1.0583, whenRate = 30/1.0583/100 = 0.2835
      // Strong: 1yr off, raw=97 → floor(97 * 0.7165) = 69  (lost 28.9%)
      // Weak:   20yr off, raw=62 → floor(62 * 0.7165) = 44  (lost 29.0%)
      // Both lose ~29% — proportional, not flat (old flat model: 30.9% vs 49.2%).
      const strongRaw = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0, false, 0, 0
      , 2025);
      const weakRaw = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1989, location: { lat: 0.67408, lng: 23.47297 } },
        0, false, 0, 0
      , 2025);
      const strong = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0, false, 30, 0
      , 2025);
      const weak = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1989, location: { lat: 0.67408, lng: 23.47297 } },
        0, false, 30, 0
      , 2025);
      const strongLossPct = (strongRaw.yearAccuracy - strong.yearAccuracy) / strongRaw.yearAccuracy;
      const weakLossPct = (weakRaw.yearAccuracy - weak.yearAccuracy) / weakRaw.yearAccuracy;
      // Both should lose approximately the same proportion (within 2 percentage points)
      expect(Math.abs(strongLossPct - weakLossPct)).toBeLessThan(0.02);
    });

    it("hint can never make you worse than 0", () => {
      // Raw yearAcc is low (40), tier-4 hint (40% rate) → floor(40 * 0.6) = 24, not 0
      // Even tier-5 (50% rate) → floor(40 * 0.5) = 20, still positive
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969 + 40, location: { lat: 0.67408, lng: 23.47297 } }, // 40 years off
        0, false, 50, 0  // tier-5 WHEN hint
      , 2025);
      expect(result.yearAccuracy).toBeGreaterThan(0);
    });
  });

  describe("age-discounted WHEN penalty", () => {
    it("same tier-5 WHEN hint costs less on old event than recent event", () => {
      // Recent event (year 2020, refYear 2025): eraScale = sqrt(max(50,5)/50) = 1.0
      //   whenRate = 50/1.0/100 = 0.5 → yearFinal = floor(100 * 0.5) = 50
      // Old event (year 1500, refYear 2025): eraScale = sqrt(max(50,525)/50) = 3.2403
      //   whenRate = 50/3.2403/100 = 0.1543 → yearFinal = floor(100 * 0.8457) = 84
      const recentEvent = { ...MOON_LANDING_EVENT, year: 2020 };
      const oldEvent = { ...MOON_LANDING_EVENT, year: 1500 };

      const recent = evaluateRound(
        recentEvent,
        { year: 2020, location: { lat: 0.67408, lng: 23.47297 } },
        0, false, 50, 0
      , 2025);
      const old = evaluateRound(
        oldEvent,
        { year: 1500, location: { lat: 0.67408, lng: 23.47297 } },
        0, false, 50, 0
      , 2025);
      // Old event retains more accuracy after same penalty (age-discount proven)
      expect(old.yearAccuracy).toBeGreaterThan(recent.yearAccuracy);
      expect(recent.yearAccuracy).toBe(50);
      expect(old.yearAccuracy).toBe(84);
    });
  });

  describe("accuracy and XP relationship", () => {
    it("roundXp equals sum of axis accuracies, roundAccuracy equals average", () => {
      const perfect = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(perfect.roundAccuracy).toBe(100);
      expect(perfect.roundXp).toBe(200);
    });

    it("partial location score — XP is sum, accuracy is average", () => {
      const halfCorrect = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 40.7128, lng: -74.006 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(halfCorrect.yearAccuracy).toBe(100);
      expect(halfCorrect.locationAccuracy).toBe(0);
      expect(halfCorrect.roundAccuracy).toBe(50);
      expect(halfCorrect.roundXp).toBe(100);
    });
  });

  describe("era-based year decay", () => {
    it("1 year off on recent event (1969) gives 97% not 100%", () => {
      // eraScale = sqrt(56/50) = 1.0583, effDiff = 1/1.0583 = 0.9449
      // yearAcc = floor(100 * exp(-0.9449/40)) = floor(97.66) = 97
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.yearAccuracy).toBe(97);
    });

    it("100 years off on 1969 event gives ~9%", () => {
      // effDiff = 100/1.0583 = 94.49
      // yearAcc = floor(100 * exp(-94.49/40)) = floor(9.42) = 9
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1869, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.yearAccuracy).toBe(9);
    });

    it("200 years off on 1969 event gives 0%", () => {
      // effDiff = 200/1.0583 = 188.98
      // yearAcc = floor(100 * exp(-188.98/40)) = floor(0.89) = 0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1769, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,
        0,
        2025
      );
      expect(result.yearAccuracy).toBe(0);
    });
  });
});

describe("applyHintPenalty", () => {
  it("no penalty returns raw inputs and derived aggregates", () => {
    expect(applyHintPenalty(100, 100, 1969, 2025, 0, 0)).toEqual({
      yearAccuracy: 100,
      locationAccuracy: 100,
      comboAccuracy: 100,
      roundAccuracy: 100,
      roundXp: 200,
    });
    expect(applyHintPenalty(50, 50, 1969, 2025, 0, 0)).toEqual({
      yearAccuracy: 50,
      locationAccuracy: 50,
      comboAccuracy: 50,
      roundAccuracy: 50,
      roundXp: 100,
    });
  });

  it("era scale reduces effective when penalty for older events", () => {
    const old = applyHintPenalty(100, 100, 500, 2025, 50, 0);
    const recent = applyHintPenalty(100, 100, 2020, 2025, 50, 0);
    expect(old.yearAccuracy).toBeGreaterThan(recent.yearAccuracy);
    expect(recent.yearAccuracy).toBe(50);
    expect(old.locationAccuracy).toBe(100);
    expect(recent.locationAccuracy).toBe(100);
  });

  it("clamps penalty rates to full axis loss", () => {
    const result = applyHintPenalty(100, 100, 2020, 2025, 200, 200);
    expect(result.yearAccuracy).toBe(0);
    expect(result.locationAccuracy).toBe(0);
    expect(result.comboAccuracy).toBe(0);
    expect(result.roundAccuracy).toBe(0);
    expect(result.roundXp).toBe(0);
  });

  it("matches evaluateRound for a sample case", () => {
    const guess = { year: 1969, location: { lat: 0.67408, lng: 23.47297 } };
    const raw = evaluateRound(MOON_LANDING_EVENT, guess, 0, false, 0, 0, 2025);
    const preview = applyHintPenalty(raw.yearAccuracy, raw.locationAccuracy, MOON_LANDING_EVENT.year, 2025, 30, 20);
    const actual = evaluateRound(MOON_LANDING_EVENT, guess, 0, false, 30, 20, 2025);
    expect(actual.yearAccuracy).toBe(preview.yearAccuracy);
    expect(actual.locationAccuracy).toBe(preview.locationAccuracy);
    expect(actual.comboAccuracy).toBe(preview.comboAccuracy);
    expect(actual.roundAccuracy).toBe(preview.roundAccuracy);
    expect(actual.roundXp).toBe(preview.roundXp);
  });
});
