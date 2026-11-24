// EDQ-BUILD-REVIEWQUEUE-1124-872
// Unit tests for src/core/eventReliability.ts — every rule branch.

import { describe, expect, it } from "vitest";
import {
  FACT_CHECK_VERDICTS,
  RELIABILITY_PLAY_MIN,
  computeReliability,
  type ReliabilityInput,
} from "./eventReliability";

const WRONG = ["FALSE", "WRONG_YEAR", "WRONG_PLACE", "MISNAMED", "NOT_REAL"] as const;
const SOFT = ["GENERIC", "UNVERIFIABLE", "AMBIGUOUS"] as const;

function input(over: Partial<ReliabilityInput> = {}): ReliabilityInput {
  return {
    verdict: "TRUE",
    title_ok: true,
    year_ok: true,
    place_ok: true,
    n_sources: 2,
    independentDomains: 2,
    ...over,
  };
}

describe("computeReliability wrong verdicts", () => {
  it("every wrong verdict with >=2 sources scores 0, no recheck", () => {
    for (const v of WRONG) {
      const r = computeReliability(input({ verdict: v, n_sources: 2, independentDomains: 2 }));
      expect(r.verdict).toBe(v);
      expect(r.reliability).toBe(0);
      expect(r.needs_recheck).toBe(false);
    }
  });

  it("every wrong verdict with <2 sources scores 20 + needs_recheck", () => {
    for (const v of WRONG) {
      for (const n of [0, 1]) {
        const r = computeReliability(input({ verdict: v, n_sources: n, independentDomains: n }));
        expect(r.reliability).toBe(20);
        expect(r.needs_recheck).toBe(true);
      }
    }
  });

  it("single-source wrong verdict is capped under 40", () => {
    const r = computeReliability(input({ verdict: "FALSE", n_sources: 1, independentDomains: 1 }));
    expect(r.reliability).toBeLessThan(40);
    expect(r.reliability).toBe(20);
  });
});

describe("computeReliability soft verdicts", () => {
  it("GENERIC/UNVERIFIABLE/AMBIGUOUS score <= 50", () => {
    for (const v of SOFT) {
      for (const n of [0, 1, 3]) {
        const r = computeReliability(input({ verdict: v, n_sources: n, independentDomains: n }));
        expect(r.verdict).toBe(v);
        expect(r.reliability).toBeLessThanOrEqual(50);
        expect(r.reliability).toBe(50);
        expect(r.needs_recheck).toBe(false);
      }
    }
  });
});

describe("computeReliability TRUE tiers", () => {
  it("TRUE with n_sources < 2 scores 70 (< play min)", () => {
    for (const n of [0, 1]) {
      const r = computeReliability(input({ n_sources: n, independentDomains: n }));
      expect(r.verdict).toBe("TRUE");
      expect(r.reliability).toBe(70);
      expect(r.reliability).toBeLessThan(RELIABILITY_PLAY_MIN);
      expect(r.needs_recheck).toBe(false);
    }
  });

  it("TRUE with fewer than 2 independent domains scores 70", () => {
    const r = computeReliability(input({ n_sources: 4, independentDomains: 1 }));
    expect(r.reliability).toBe(70);
  });

  it("TRUE with >=2 sources and >=2 domains but <3/3 scores 95", () => {
    expect(computeReliability(input({ n_sources: 2, independentDomains: 2 })).reliability).toBe(95);
    expect(computeReliability(input({ n_sources: 3, independentDomains: 2 })).reliability).toBe(95);
    expect(computeReliability(input({ n_sources: 5, independentDomains: 2 })).reliability).toBe(95);
  });

  it("TRUE with >=3 sources and >=3 domains scores 100", () => {
    expect(computeReliability(input({ n_sources: 3, independentDomains: 3 })).reliability).toBe(100);
    expect(computeReliability(input({ n_sources: 5, independentDomains: 4 })).reliability).toBe(100);
  });
});

describe("computeReliability TRUE downgrade", () => {
  it("TRUE with title_ok=false is refused -> MISNAMED scored as wrong", () => {
    const r = computeReliability(input({ title_ok: false, n_sources: 4, independentDomains: 4 }));
    expect(r.verdict).toBe("MISNAMED");
    expect(r.reliability).toBe(0);
  });

  it("TRUE with year_ok=false is refused -> WRONG_YEAR", () => {
    const r = computeReliability(input({ year_ok: false, n_sources: 4, independentDomains: 4 }));
    expect(r.verdict).toBe("WRONG_YEAR");
    expect(r.reliability).toBe(0);
  });

  it("TRUE with place_ok=false is refused -> WRONG_PLACE", () => {
    const r = computeReliability(input({ place_ok: false, n_sources: 4, independentDomains: 4 }));
    expect(r.verdict).toBe("WRONG_PLACE");
    expect(r.reliability).toBe(0);
  });

  it("TRUE with null flags is refused (only === true counts)", () => {
    const r = computeReliability(input({ place_ok: null }));
    expect(r.verdict).toBe("WRONG_PLACE");
    expect(r.reliability).toBe(0);
  });

  it("multiple failed flags downgrade by title/year/place precedence", () => {
    const r = computeReliability(input({ title_ok: false, year_ok: false, place_ok: false }));
    expect(r.verdict).toBe("MISNAMED");
    const r2 = computeReliability(input({ title_ok: true, year_ok: false, place_ok: false }));
    expect(r2.verdict).toBe("WRONG_YEAR");
  });

  it("downgraded TRUE with <2 sources scores 20 + needs_recheck", () => {
    const r = computeReliability(input({ place_ok: false, n_sources: 1, independentDomains: 1 }));
    expect(r.verdict).toBe("WRONG_PLACE");
    expect(r.reliability).toBe(20);
    expect(r.needs_recheck).toBe(true);
  });
});

describe("computeReliability spec proofs", () => {
  it("a TRUE with one source scores < 95", () => {
    const r = computeReliability(input({ n_sources: 1, independentDomains: 1 }));
    expect(r.reliability).toBeLessThan(RELIABILITY_PLAY_MIN);
    expect(r.reliability).toBe(70);
  });

  it("a TRUE with place_ok=false is refused (cannot stay TRUE)", () => {
    const r = computeReliability(input({ place_ok: false }));
    expect(r.verdict).not.toBe("TRUE");
    expect(r.verdict).toBe("WRONG_PLACE");
  });

  it("no asterisked/qualified TRUE verdict exists in the domain", () => {
    expect(FACT_CHECK_VERDICTS).not.toContain("TRUE*");
    expect(FACT_CHECK_VERDICTS).toHaveLength(9);
  });
});
