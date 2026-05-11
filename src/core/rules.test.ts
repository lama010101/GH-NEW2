import { describe, expect, it } from "vitest";
import { evaluateRound } from "./rules";

// Test fixtures based on PRACTICE_EVENTS[0] (Moon Landing)
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
        0
      );
      expect(result.yearAccuracy).toBe(100);
    });

    it("returns 100% location accuracy for exact location match", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1900, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.locationAccuracy).toBe(100);
    });

    it("returns 100% combo accuracy for perfect year and location", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0
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
        0
      );
      expect(result.yearAccuracy).toBe(0);
    });

    it("returns 0% location accuracy when location is null", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: null },
        0
      );
      expect(result.locationAccuracy).toBe(0);
    });

    it("returns 0% accuracy when both inputs are null (timeout)", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: null, location: null },
        0,
        true // didTimeout
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

  describe("hint penalty capped at MAX_HINT_PENALTY (1.0)", () => {
    it("caps accuracy penalty at MAX_HINT_PENALTY", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        { accuracy: 200, xp: 500 } // Exceeds MAX_HINT_PENALTY of 100 percentage points
      );
      // Raw accuracy is 100, penalty should be capped at 100 (MAX_HINT_PENALTY * 100)
      // So roundAccuracy = 100 - 100 = 0 (but clamped to 0 via Math.max)
      expect(result.roundAccuracy).toBe(0);
    });

    it("caps XP penalty at provided value but accuracy separately", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        { accuracy: 0.5, xp: 1000 } // Large XP penalty
      );
      // Raw XP is 200 (100 + 100), minus 1000 would go negative
      expect(result.roundXp).toBe(0); // Math.max(0, raw - penalty)
    });

    it("applies partial penalty correctly when under cap", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        { accuracy: 25, xp: 50 } // 25 percentage points accuracy penalty, 50 XP penalty
      );
      // Raw accuracy is 100, penalty is 25, so 75 remains
      expect(result.roundAccuracy).toBe(75);
      // Raw XP is 200, penalty is 50, so 150 remains
      expect(result.roundXp).toBe(150);
    });
  });

  describe("accuracy/XP independence", () => {
    it("calculates accuracy and XP from independent base formulas", () => {
      const perfect = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      // Accuracy: average of year and location = (100 + 100) / 2 = 100
      expect(perfect.roundAccuracy).toBe(100);
      // XP: sum of year and location = 100 + 100 = 200
      expect(perfect.roundXp).toBe(200);
    });

    it("shows different scaling for accuracy vs XP", () => {
      const halfCorrect = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 40.7128, lng: -74.006 } }, // ~9500km from moon landing site (approx 0%)
        0
      );
      // Year accuracy is 100%
      expect(halfCorrect.yearAccuracy).toBe(100);
      // Location accuracy depends on distance
      expect(halfCorrect.locationAccuracy).toBeLessThan(100);
      expect(halfCorrect.locationAccuracy).toBe(0);

      // Accuracy is average
      const expectedAccuracy = Math.floor((halfCorrect.yearAccuracy + halfCorrect.locationAccuracy) / 2);
      expect(halfCorrect.roundAccuracy).toBe(expectedAccuracy);

      // XP is sum (different formula)
      const expectedXp = Math.round(halfCorrect.yearAccuracy + halfCorrect.locationAccuracy);
      expect(halfCorrect.roundXp).toBe(expectedXp);

      // Verify they're different values
      expect(halfCorrect.roundAccuracy).not.toBe(halfCorrect.roundXp);
    });

    it("applies penalties independently to accuracy and XP", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        { accuracy: 50, xp: 0 } // 50 percentage points accuracy penalty
      );
      // Accuracy affected: 100 - 50 = 50
      expect(result.roundAccuracy).toBe(50);
      // XP not affected by accuracy penalty
      expect(result.roundXp).toBe(200);
    });

    it("allows XP penalty without accuracy penalty", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        { accuracy: 0, xp: 100 } // Only XP penalty
      );
      // Accuracy not affected
      expect(result.roundAccuracy).toBe(100);
      // XP affected
      expect(result.roundXp).toBe(100);
    });
  });

  describe("edge case fixtures", () => {
    it("handles near miss (small year diff, small distance)", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.7, lng: 23.5 } }, // 1 year off, close location
        0
      );
      expect(result.yearAccuracy).toBe(100); // Within tolerance
      expect(result.locationAccuracy).toBeGreaterThan(95);
      expect(result.roundAccuracy).toBeGreaterThan(95);
    });

    it("handles wrong year / right location", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1869, location: { lat: 0.67408, lng: 23.47297 } }, // 100 years off, exponential decay
        0
      );
      expect(result.yearAccuracy).toBe(67); // exponential decay: ~67% at 100 years off
      expect(result.locationAccuracy).toBe(100);
      expect(result.roundAccuracy).toBe(83); // floor((67 + 100) / 2) = 83
    });

    it("handles right year / wrong location", () => {
      const antipodalPoint = { lat: -0.67408, lng: -156.52703 }; // Opposite side of Earth
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: antipodalPoint },
        0
      );
      expect(result.yearAccuracy).toBe(100);
      expect(result.locationAccuracy).toBeLessThan(50); // Far away
      expect(result.locationAccuracy).toBeGreaterThanOrEqual(0);
    });

    it("handles max year difference (200 years)", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1769, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(45); // exponential decay: ~45% at 200 years off
    });
  });
});
