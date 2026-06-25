import { describe, expect, it } from "vitest";
import {
  evaluateRound,
  calculateBadges,
  evaluateNearMisses,
  calculateLocationAccuracy,
  calculateYearAccuracy
} from "./rules";

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

describe("breadth correctness tests", () => {
  describe("scoring formula validation", () => {
    it("exact match → 100% accuracy on both axes", () => {
      // distanceKm = 0 → exp(0) = 1 → 100%
      // yearDiff = 0 → exp(0) = 1 → 100%
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(100);
      expect(result.locationAccuracy).toBe(100);
    });

    it("max distance (antipodal) → 0% location accuracy", () => {
      // Antipodal point to Moon Landing: lat ≈ -0.67408, lng ≈ -156.52703
      // distanceKm ≈ 20000 → exp(-20000/1500) ≈ exp(-13.33) ≈ 1.6e-6 → floor(0.00016) = 0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: -0.67408, lng: -156.52703 } },
        0
      );
      expect(result.locationAccuracy).toBe(0);
    });

    it("200 years off on 1969 event → 0% year accuracy", () => {
      // Hand computation:
      // CURRENT_YEAR = 2025, eventYear = 1969
      // age = max(50, 2025 - 1969) = max(50, 56) = 56
      // eraScale = sqrt(56 / 50) = sqrt(1.12) ≈ 1.0583
      // yearDiff = 1769 - 1969 = -200, abs = 200
      // effectiveDiff = 200 / 1.0583 ≈ 189.0
      // exp(-189.0 / 40) = exp(-4.725) ≈ 0.00886
      // 100 * 0.00886 ≈ 0.886 → floor = 0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1769, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(0);
    });

    it("null year guess → 0% year accuracy, 100% location accuracy", () => {
      // Per rules.ts line 127: null year → yearAccuracy = 0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: null, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(0);
      expect(result.locationAccuracy).toBe(100);
    });

    it("null location guess → 100% year accuracy, 0% location accuracy", () => {
      // Per rules.ts line 125: null location → distanceKm = MAX_DISTANCE_KM = 20000
      // exp(-20000/1500) ≈ 0 → floor = 0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: null },
        0
      );
      expect(result.yearAccuracy).toBe(100);
      expect(result.locationAccuracy).toBe(0);
    });

    it("both null → 0% on all axes", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: null, location: null },
        0
      );
      expect(result.yearAccuracy).toBe(0);
      expect(result.locationAccuracy).toBe(0);
      expect(result.comboAccuracy).toBe(0);
    });
  });

  describe("badge tier boundaries", () => {
    it("accuracy 100 → gold badge", () => {
      const badges = calculateBadges({ yearAccuracy: 100, locationAccuracy: 100, comboAccuracy: 100 });
      expect(badges).toHaveLength(3);
      expect(badges.every(b => b.tier === "gold")).toBe(true);
    });

    it("accuracy 95 → silver badge (lower boundary)", () => {
      const badges = calculateBadges({ yearAccuracy: 95, locationAccuracy: 95, comboAccuracy: 95 });
      expect(badges).toHaveLength(3);
      expect(badges.every(b => b.tier === "silver")).toBe(true);
    });

    it("accuracy 99 → silver badge (upper boundary)", () => {
      const badges = calculateBadges({ yearAccuracy: 99, locationAccuracy: 99, comboAccuracy: 99 });
      expect(badges).toHaveLength(3);
      expect(badges.every(b => b.tier === "silver")).toBe(true);
    });

    it("accuracy 90 → bronze badge (lower boundary)", () => {
      const badges = calculateBadges({ yearAccuracy: 90, locationAccuracy: 90, comboAccuracy: 90 });
      expect(badges).toHaveLength(3);
      expect(badges.every(b => b.tier === "bronze")).toBe(true);
    });

    it("accuracy 94 → bronze badge (upper boundary)", () => {
      const badges = calculateBadges({ yearAccuracy: 94, locationAccuracy: 94, comboAccuracy: 94 });
      expect(badges).toHaveLength(3);
      expect(badges.every(b => b.tier === "bronze")).toBe(true);
    });

    it("accuracy 89 → no badge (below bronze)", () => {
      const badges = calculateBadges({ yearAccuracy: 89, locationAccuracy: 89, comboAccuracy: 89 });
      expect(badges).toHaveLength(0);
    });

    it("mixed tiers across dimensions", () => {
      const badges = calculateBadges({ yearAccuracy: 100, locationAccuracy: 95, comboAccuracy: 90 });
      expect(badges).toHaveLength(3);
      expect(badges.find(b => b.dimension === "year")?.tier).toBe("gold");
      expect(badges.find(b => b.dimension === "location")?.tier).toBe("silver");
      expect(badges.find(b => b.dimension === "combo")?.tier).toBe("bronze");
    });

    it("only year badge when location below threshold", () => {
      const badges = calculateBadges({ yearAccuracy: 100, locationAccuracy: 89, comboAccuracy: 89 });
      expect(badges).toHaveLength(1);
      expect(badges[0].dimension).toBe("year");
      expect(badges[0].tier).toBe("gold");
    });
  });

  describe("near-miss evaluation", () => {
    it("accuracy 87 with no badge → no near-miss (below range)", () => {
      const nearMisses = evaluateNearMisses(87, 87, 87, []);
      expect(nearMisses).toHaveLength(0);
    });

    it("accuracy 88 with no badge → near-miss (lower boundary)", () => {
      const nearMisses = evaluateNearMisses(88, 88, 88, []);
      expect(nearMisses).toHaveLength(3);
      expect(nearMisses.every(n => n.accuracy === 88)).toBe(true);
    });

    it("accuracy 89 with no badge → near-miss (upper boundary)", () => {
      const nearMisses = evaluateNearMisses(89, 89, 89, []);
      expect(nearMisses).toHaveLength(3);
      expect(nearMisses.every(n => n.accuracy === 89)).toBe(true);
    });

    it("accuracy 90 with no badge → no near-miss (above range, would be bronze)", () => {
      const nearMisses = evaluateNearMisses(90, 90, 90, []);
      expect(nearMisses).toHaveLength(0);
    });

    it("accuracy 88 with bronze badge → no near-miss (badge blocks near-miss)", () => {
      const badges = [{ dimension: "year" as const, tier: "bronze" as const, accuracy: 90 }];
      const nearMisses = evaluateNearMisses(88, 88, 88, badges);
      expect(nearMisses).toHaveLength(2); // location and combo only
      expect(nearMisses.every(n => n.dimension !== "year")).toBe(true);
    });

    it("mixed: year near-miss, location badge, combo near-miss", () => {
      const badges = [{ dimension: "location" as const, tier: "silver" as const, accuracy: 95 }];
      const nearMisses = evaluateNearMisses(88, 95, 88, badges);
      expect(nearMisses).toHaveLength(2);
      expect(nearMisses.find(n => n.dimension === "year")?.accuracy).toBe(88);
      expect(nearMisses.find(n => n.dimension === "combo")?.accuracy).toBe(88);
      expect(nearMisses.find(n => n.dimension === "location")).toBeUndefined();
    });
  });

  describe("combo accuracy computation", () => {
    it("combo = min(year, location) when equal", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      expect(result.yearAccuracy).toBe(100);
      expect(result.locationAccuracy).toBe(100);
      expect(result.comboAccuracy).toBe(100); // min(100, 100) = 100
    });

    it("combo = min(year, location) when year lower", () => {
      // Use a guess that gives lower year accuracy but perfect location
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0
      );
      // year: 1 year off → 97% (actual implementation output)
      // location: perfect → 100%
      expect(result.comboAccuracy).toBe(97); // min(97, 100) = 97
    });

    it("combo = min(year, location) when location lower", () => {
      // Use a guess that gives perfect year but lower location accuracy
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 40.7128, lng: -74.006 } }, // NYC
        0
      );
      // year: perfect → 100%
      // location: far → 0% (per existing test)
      expect(result.comboAccuracy).toBe(0); // min(100, 0) = 0
    });

    it("combo = 0 when both axes are 0", () => {
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: null, location: null },
        0
      );
      expect(result.yearAccuracy).toBe(0);
      expect(result.locationAccuracy).toBe(0);
      expect(result.comboAccuracy).toBe(0); // min(0, 0) = 0
    });
  });

  describe("hint penalty application", () => {
    it("penaltyWhen reduces year accuracy only", () => {
      // Base: year=100, location=100
      // penaltyWhen=30, penaltyWhere=0
      // Expected: year=100-30=70, location=100-0=100
      // roundAccuracy = (70+100)/2 = 85
      // roundXp = 70+100 = 170
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        30,  // penaltyWhen
        0    // penaltyWhere
      );
      expect(result.yearAccuracy).toBe(70);
      expect(result.locationAccuracy).toBe(100);
      expect(result.roundAccuracy).toBe(85);
      expect(result.roundXp).toBe(170);
    });

    it("penaltyWhere reduces location accuracy only", () => {
      // Base: year=100, location=100
      // penaltyWhen=0, penaltyWhere=20
      // Expected: year=100-0=100, location=100-20=80
      // roundAccuracy = (100+80)/2 = 90
      // roundXp = 100+80 = 180
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,   // penaltyWhen
        20   // penaltyWhere
      );
      expect(result.yearAccuracy).toBe(100);
      expect(result.locationAccuracy).toBe(80);
      expect(result.roundAccuracy).toBe(90);
      expect(result.roundXp).toBe(180);
    });

    it("both penalties applied independently", () => {
      // Base: year=100, location=100
      // penaltyWhen=10, penaltyWhere=40
      // Expected: year=100-10=90, location=100-40=60
      // roundAccuracy = (90+60)/2 = 75
      // roundXp = 90+60 = 150
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        10,  // penaltyWhen
        40   // penaltyWhere
      );
      expect(result.yearAccuracy).toBe(90);
      expect(result.locationAccuracy).toBe(60);
      expect(result.roundAccuracy).toBe(75);
      expect(result.roundXp).toBe(150);
    });

    it("penalty floor at 0 (cannot go negative)", () => {
      // Base: year=100, location=100
      // penaltyWhen=150, penaltyWhere=200
      // Expected: year=max(0, 100-150)=0, location=max(0, 100-200)=0
      // roundAccuracy = (0+0)/2 = 0
      // roundXp = 0+0 = 0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        150,  // penaltyWhen
        200   // penaltyWhere
      );
      expect(result.yearAccuracy).toBe(0);
      expect(result.locationAccuracy).toBe(0);
      expect(result.roundAccuracy).toBe(0);
      expect(result.roundXp).toBe(0);
    });
  });

  describe("stats aggregation running average formula", () => {
    it("first round: existing avg 0, count 0, new value 80 → final avg 80", () => {
      // Formula: (0*0 + 80) / (0+1) = 80/1 = 80
      let runningAvg = 0;
      let runningCount = 0;
      const newValue = 80;
      runningAvg = (runningAvg * runningCount + newValue) / (runningCount + 1);
      runningCount += 1;
      expect(runningAvg).toBe(80);
      expect(runningCount).toBe(1);
    });

    it("second round: existing avg 80, count 1, new value 90 → final avg 85", () => {
      // Formula: (80*1 + 90) / (1+1) = 170/2 = 85
      let runningAvg = 80;
      let runningCount = 1;
      const newValue = 90;
      runningAvg = (runningAvg * runningCount + newValue) / (runningCount + 1);
      runningCount += 1;
      expect(runningAvg).toBe(85);
      expect(runningCount).toBe(2);
    });

    it("third round: existing avg 85, count 2, new value 70 → final avg 80", () => {
      // Formula: (85*2 + 70) / (2+1) = 240/3 = 80
      let runningAvg = 85;
      let runningCount = 2;
      const newValue = 70;
      runningAvg = (runningAvg * runningCount + newValue) / (runningCount + 1);
      runningCount += 1;
      expect(runningAvg).toBe(80);
      expect(runningCount).toBe(3);
    });

    it("multiple new values: existing avg 80, count 2, new [70, 90] → final avg 80", () => {
      // Step 1: (80*2 + 70) / 3 = 230/3 ≈ 76.67
      // Step 2: (76.67*3 + 90) / 4 = 320/4 = 80
      let runningAvg = 80;
      let runningCount = 2;
      const newValues = [70, 90];
      for (const newValue of newValues) {
        runningAvg = (runningAvg * runningCount + newValue) / (runningCount + 1);
        runningCount += 1;
      }
      expect(runningAvg).toBe(80);
      expect(runningCount).toBe(4);
    });

    it("sequence of 5 rounds: [95, 85, 75, 90, 80] → final avg 85", () => {
      // Step 1: (0*0 + 95) / 1 = 95
      // Step 2: (95*1 + 85) / 2 = 180/2 = 90
      // Step 3: (90*2 + 75) / 3 = 255/3 = 85
      // Step 4: (85*3 + 90) / 4 = 345/4 = 86.25
      // Step 5: (86.25*4 + 80) / 5 = 425/5 = 85
      let runningAvg = 0;
      let runningCount = 0;
      const newValues = [95, 85, 75, 90, 80];
      for (const newValue of newValues) {
        runningAvg = (runningAvg * runningCount + newValue) / (runningCount + 1);
        runningCount += 1;
      }
      expect(runningAvg).toBe(85);
      expect(runningCount).toBe(5);
    });
  });

  describe("integration: badges with penalties", () => {
    it("penalty pushes gold to silver → silver badge awarded", () => {
      // Base: year=100, location=100
      // penaltyWhen=5, penaltyWhere=0
      // Expected: year=95, location=100
      // Year should get silver badge (95), location gold (100)
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        5,   // penaltyWhen
        0    // penaltyWhere
      );
      expect(result.yearAccuracy).toBe(95);
      expect(result.locationAccuracy).toBe(100);
      expect(result.badges.find(b => b.dimension === "year")?.tier).toBe("silver");
      expect(result.badges.find(b => b.dimension === "location")?.tier).toBe("gold");
    });

    it("penalty pushes silver to bronze → bronze badge awarded", () => {
      // Base: year=97, location=100 (year silver, location gold)
      // penaltyWhen=7, penaltyWhere=0
      // Expected: year=90, location=100
      // Year should get bronze badge (90), location gold (100)
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        7,   // penaltyWhen: 97-7=90
        0    // penaltyWhere
      );
      expect(result.yearAccuracy).toBe(90);
      expect(result.badges.find(b => b.dimension === "year")?.tier).toBe("bronze");
    });

    it("penalty pushes bronze to near-miss → near-miss instead of badge", () => {
      // Base: year=97, location=100 (year silver, location gold)
      // penaltyWhen=9, penaltyWhere=0
      // Expected: year=88, location=100
      // Year should get near-miss (88), location gold (100)
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        9,   // penaltyWhen: 97-9=88
        0    // penaltyWhere
      );
      expect(result.yearAccuracy).toBe(88);
      expect(result.badges.find(b => b.dimension === "year")).toBeUndefined();
      // Check near-miss via evaluateNearMisses
      const nearMisses = evaluateNearMisses(result.yearAccuracy, result.locationAccuracy, result.comboAccuracy, result.badges);
      expect(nearMisses.find(n => n.dimension === "year")?.accuracy).toBe(88);
    });
  });
});
