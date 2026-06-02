import { describe, expect, it } from "vitest";
import { evaluateRound } from "./rules";

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
        true
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
    it("penaltyWhen reduces year accuracy only", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        30,  // penaltyWhen: tier-3 WHEN hint
        0    // penaltyWhere: none
      );
      // year: 100 - 30 = 70
      expect(result.yearAccuracy).toBe(70);
      // location: 100 - 0 = 100
      expect(result.locationAccuracy).toBe(100);
      expect(result.roundAccuracy).toBe(85);
      expect(result.roundXp).toBe(170);
    });

    it("penaltyWhere reduces location accuracy only", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,   // penaltyWhen: none
        20   // penaltyWhere: tier-2 WHERE hint
      );
      // year: 100 - 0 = 100
      expect(result.yearAccuracy).toBe(100);
      // location: 100 - 20 = 80
      expect(result.locationAccuracy).toBe(80);
      expect(result.roundAccuracy).toBe(90);
      expect(result.roundXp).toBe(180);
    });

    it("both penalties applied independently", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        10,  // penaltyWhen: tier-1 WHEN hint
        40   // penaltyWhere: tier-4 WHERE hint
      );
      expect(result.yearAccuracy).toBe(90);
      expect(result.locationAccuracy).toBe(60);
      expect(result.roundAccuracy).toBe(75);
      expect(result.roundXp).toBe(150);
    });

    it("penalty capped at 100 per axis — cannot go below 0", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        150,  // penaltyWhen: exceeds 100
        200   // penaltyWhere: exceeds 100
      );
      expect(result.yearAccuracy).toBe(0);
      expect(result.locationAccuracy).toBe(0);
      expect(result.roundAccuracy).toBe(0);
      expect(result.roundXp).toBe(0);
    });
  });

  describe("accuracy and XP relationship", () => {
    it("roundXp equals sum of axis accuracies, roundAccuracy equals average", () => {
      const perfect = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(perfect.roundAccuracy).toBe(100);
      expect(perfect.roundXp).toBe(200);
    });

    it("partial location score — XP is sum, accuracy is average", () => {
      const halfCorrect = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 40.7128, lng: -74.006 } },
        0
      );
      expect(halfCorrect.yearAccuracy).toBe(100);
      expect(halfCorrect.locationAccuracy).toBe(0);
      expect(halfCorrect.roundAccuracy).toBe(50);
      expect(halfCorrect.roundXp).toBe(100);
    });
  });

  describe("era-based year decay", () => {
    it("1 year off on recent event (1969) gives 98% not 100%", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(98);
    });

    it("100 years off on 1969 event gives ~10%", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1869, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(10);
    });

    it("200 years off on 1969 event gives ~1%", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1769, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(1);
    });
  });
});
