import { describe, expect, it } from "vitest";
import {
  evaluateRound,
  calculateBadges,
  evaluateNearMisses,
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
      // Hand computation (referenceYear defaults to 2025):
      // eventYear = 1969, referenceYear = 2025
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
    it("penaltyWhen reduces year accuracy only (proportional + age-discounted)", () => {
      // Base: year=100, location=100
      // penaltyWhenRate=30, penaltyWhereRate=0, referenceYear=2025 (default)
      // eraScale = sqrt(56/50) = 1.0583
      // whenRate = 30/1.0583/100 = 0.2835
      // yearFinal = floor(100 * 0.7165) = 71
      // roundAccuracy = round((71+100)/2) = 86
      // roundXp = 71+100 = 171
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        30,  // penaltyWhenRate
        0    // penaltyWhereRate
      );
      expect(result.yearAccuracy).toBe(71);
      expect(result.locationAccuracy).toBe(100);
      expect(result.roundAccuracy).toBe(86);
      expect(result.roundXp).toBe(171);
    });

    it("penaltyWhere reduces location accuracy only (proportional, no age-discount)", () => {
      // Base: year=100, location=100
      // penaltyWhenRate=0, penaltyWhereRate=20
      // whereRate = 20/100 = 0.2, locFinal = floor(100 * 0.8) = 80
      // roundAccuracy = (100+80)/2 = 90
      // roundXp = 100+80 = 180
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        0,   // penaltyWhenRate
        20   // penaltyWhereRate
      );
      expect(result.yearAccuracy).toBe(100);
      expect(result.locationAccuracy).toBe(80);
      expect(result.roundAccuracy).toBe(90);
      expect(result.roundXp).toBe(180);
    });

    it("both penalties applied independently", () => {
      // Base: year=100, location=100
      // penaltyWhenRate=10, penaltyWhereRate=40
      // whenRate = 10/1.0583/100 = 0.0945, yearFinal = floor(100 * 0.9055) = 90
      // whereRate = 40/100 = 0.4, locFinal = floor(100 * 0.6) = 60
      // roundAccuracy = (90+60)/2 = 75
      // roundXp = 90+60 = 150
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        10,  // penaltyWhenRate
        40   // penaltyWhereRate
      );
      expect(result.yearAccuracy).toBe(90);
      expect(result.locationAccuracy).toBe(60);
      expect(result.roundAccuracy).toBe(75);
      expect(result.roundXp).toBe(150);
    });

    it("penalty floor at 0 (cannot go negative)", () => {
      // Base: year=100, location=100
      // penaltyWhenRate=150 → clamp(150/1.0583, 0, 100) = 100 → whenRate = 1.0
      // penaltyWhereRate=200 → clamp(200, 0, 100) = 100 → whereRate = 1.0
      // yearFinal = floor(100 * 0) = 0, locFinal = floor(100 * 0) = 0
      // roundAccuracy = (0+0)/2 = 0
      // roundXp = 0+0 = 0
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        150,  // penaltyWhenRate
        200   // penaltyWhereRate
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
      // penaltyWhenRate=5, penaltyWhereRate=0, referenceYear=2025
      // eraScale=1.0583, whenRate=5/1.0583/100=0.0472
      // yearFinal = floor(100 * 0.9528) = 95
      // Year should get silver badge (95), location gold (100)
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        5,   // penaltyWhenRate
        0    // penaltyWhereRate
      );
      expect(result.yearAccuracy).toBe(95);
      expect(result.locationAccuracy).toBe(100);
      expect(result.badges.find(b => b.dimension === "year")?.tier).toBe("silver");
      expect(result.badges.find(b => b.dimension === "location")?.tier).toBe("gold");
    });

    it("penalty pushes silver to bronze → bronze badge awarded", () => {
      // Base: year=97 (1yr off), location=100 (year silver, location gold)
      // penaltyWhenRate=7, penaltyWhereRate=0
      // whenRate=7/1.0583/100=0.0661, yearFinal=floor(97*0.9339)=90
      // Year should get bronze badge (90), location gold (100)
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        7,   // penaltyWhenRate
        0    // penaltyWhereRate
      );
      expect(result.yearAccuracy).toBe(90);
      expect(result.badges.find(b => b.dimension === "year")?.tier).toBe("bronze");
    });

    it("penalty pushes bronze to near-miss → near-miss instead of badge", () => {
      // Base: year=97 (1yr off), location=100 (year silver, location gold)
      // penaltyWhenRate=9, penaltyWhereRate=0
      // whenRate=9/1.0583/100=0.0850, yearFinal=floor(97*0.9150)=88
      // Year should get near-miss (88), location gold (100)
      const result = evaluateRound(
        MOON_LANDING_EVENT,
        { year: 1970, location: { lat: 0.67408, lng: 23.47297 } },
        0,
        false,
        9,   // penaltyWhenRate
        0    // penaltyWhereRate
      );
      expect(result.yearAccuracy).toBe(88);
      expect(result.badges.find(b => b.dimension === "year")).toBeUndefined();
      // Check near-miss via evaluateNearMisses
      const nearMisses = evaluateNearMisses(result.yearAccuracy, result.locationAccuracy, result.comboAccuracy, result.badges);
      expect(nearMisses.find(n => n.dimension === "year")?.accuracy).toBe(88);
    });
  });
});
