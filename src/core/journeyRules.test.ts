import { describe, expect, it } from "vitest";
import {
  journeyMaxEventAgeYears,
  journeyMinEventYear,
  journeyRoundTimerSec,
  journeyStageEraKey,
  journeyStageIconFile,
  journeyYearLabel,
} from "./journeyRules";

describe("journeyRoundTimerSec", () => {
  it("stage 1 = 300s (ramp start)", () => {
    expect(journeyRoundTimerSec(1)).toBe(300);
  });
  it("stage 25 ≈ mid-ramp (300 - 270*24/49 ≈ 168)", () => {
    expect(journeyRoundTimerSec(25)).toBe(Math.round(300 - (270 * 24) / 49));
  });
  it("stage 49 ≈ 30s boundary (300 - 270*48/49 ≈ 35.5 → 36)", () => {
    expect(journeyRoundTimerSec(49)).toBe(Math.round(300 - (270 * 48) / 49));
  });
  it("stage 50 = 30s (ramp floor reached)", () => {
    expect(journeyRoundTimerSec(50)).toBe(30);
  });
  it("stages 51 and 100 stay flat at 30s", () => {
    expect(journeyRoundTimerSec(51)).toBe(30);
    expect(journeyRoundTimerSec(100)).toBe(30);
  });
});

describe("journeyMaxEventAgeYears", () => {
  it("stage 1 → 40 years, stage 100 → 4000 years", () => {
    expect(journeyMaxEventAgeYears(1)).toBe(40);
    expect(journeyMaxEventAgeYears(100)).toBe(4000);
  });
});

describe("journeyMinEventYear", () => {
  it("stage 1 @2026 → 1986; stage 100 @2026 → -1974", () => {
    expect(journeyMinEventYear(1, 2026)).toBe(1986);
    expect(journeyMinEventYear(100, 2026)).toBe(-1974);
  });
  it("boundary is inclusive: event_year = minYear is eligible", () => {
    const minYear = journeyMinEventYear(1, 2026);
    expect(2026 - minYear).toBe(40); // event_year >= minYear ⇒ diff <= 40
  });
});

describe("journeyStageIconFile", () => {
  it("stages 1 and 5 → rank-01 (tier boundary at 5)", () => {
    expect(journeyStageIconFile(1)).toBe("/icons/ranks/rank-01.png");
    expect(journeyStageIconFile(5)).toBe("/icons/ranks/rank-01.png");
  });
  it("stage 6 → rank-02; stage 100 → rank-20", () => {
    expect(journeyStageIconFile(6)).toBe("/icons/ranks/rank-02.png");
    expect(journeyStageIconFile(100)).toBe("/icons/ranks/rank-20.png");
  });
});

describe("journeyYearLabel (mirrors YearPicker yearLabel semantics)", () => {
  it("positive years render bare", () => {
    expect(journeyYearLabel(1986, "BC")).toBe("1986");
  });
  it("non-positive years render |y| BC (0 → 1 BC)", () => {
    expect(journeyYearLabel(-1974, "BC")).toBe("1974 BC");
    expect(journeyYearLabel(0, "BC")).toBe("1 BC");
  });
});

describe("journeyStageEraKey", () => {
  it("stage 1 @2026 → contemporary (minYear 1986 >= 1945)", () => {
    expect(journeyStageEraKey(1, 2026)).toBe("era_contemporary");
  });
  it("stage 13 @2026 → earlymodern (minYear 1506 < 1789)", () => {
    expect(journeyStageEraKey(13, 2026)).toBe("era_earlymodern");
  });
  it("stage 50 @2026 → ancient (minYear 26 < 476)", () => {
    expect(journeyStageEraKey(50, 2026)).toBe("era_ancient");
  });
});
