// LEARN-BUILD-EVENTMODAL-API-1015-001 / LEARN-FIX-HINTMETA-NONEARBY-1015-003 /
// LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011
// Pure-function tests for learnEvent.ts ranking/exclusion/metadata helpers.
// No DB access — dbPool is a lazy proxy and is never queried here.

import { describe, expect, it } from "vitest";
import { learnModeForSession } from "@/core/learnTypes";
import {
  computeExcludedEventIds,
  haversineKm,
  rankByLocation,
  rankTimeline,
  sanitizeHintMetadata,
  type LearnCandidate,
  type LearnSelf,
} from "./learnEvent";

const cand = (
  id: string,
  year: number,
  lat: number | null = null,
  lng: number | null = null
): LearnCandidate => ({
  id,
  title: `T-${id}`,
  year,
  location: `L-${id}`,
  lat,
  lng,
});

const selfAt = (year: number, lat: number | null = 0, lng: number | null = 0): LearnSelf => ({
  id: "self",
  title: "T-self",
  year,
  location: "L-self",
  lat,
  lng,
});

const NO_EXCLUDED = new Set<string>();

describe("learnModeForSession", () => {
  it("maps every SessionMode value", () => {
    expect(learnModeForSession("sync")).toBe("compete");
    expect(learnModeForSession("async")).toBe("compete");
    expect(learnModeForSession("daily")).toBe("daily");
    expect(learnModeForSession("practice")).toBe("practice");
  });

  it("returns null for unknown/empty values", () => {
    expect(learnModeForSession("compete")).toBeNull();
    expect(learnModeForSession("journey")).toBeNull();
    expect(learnModeForSession("")).toBeNull();
    expect(learnModeForSession(null)).toBeNull();
    expect(learnModeForSession(undefined)).toBeNull();
  });
});

describe("sanitizeHintMetadata", () => {
  it("keeps a finite km number", () => {
    expect(sanitizeHintMetadata({ km: 12.5 })).toEqual({ km: 12.5 });
  });

  it("keeps a valid years number", () => {
    expect(sanitizeHintMetadata({ years: 12 })).toEqual({ years: 12 });
  });

  it("keeps a numeric-string years value", () => {
    expect(sanitizeHintMetadata({ years: "8" })).toEqual({ years: "8" });
  });

  it("keeps km and years together", () => {
    expect(sanitizeHintMetadata({ km: 3, years: 7 })).toEqual({ km: 3, years: 7 });
  });

  it("drops NaN and Infinity km", () => {
    expect(sanitizeHintMetadata({ km: NaN })).toBeUndefined();
    expect(sanitizeHintMetadata({ km: Infinity })).toBeUndefined();
    expect(sanitizeHintMetadata({ km: -Infinity })).toBeUndefined();
  });

  it("drops negative km and negative years (number and string)", () => {
    expect(sanitizeHintMetadata({ km: -1 })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: -5 })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: "-5" })).toBeUndefined();
  });

  it("drops non-numeric years strings", () => {
    expect(sanitizeHintMetadata({ years: "abc" })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: "" })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: "12bc" })).toBeUndefined();
  });

  it("drops non-number km (numeric string is not accepted for km)", () => {
    expect(sanitizeHintMetadata({ km: "12" })).toBeUndefined();
    expect(sanitizeHintMetadata({ km: null })).toBeUndefined();
  });

  it("drops years objects/arrays/booleans", () => {
    expect(sanitizeHintMetadata({ years: { n: 5 } })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: [5] })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: true })).toBeUndefined();
  });

  it("drops unknown extra keys", () => {
    expect(
      sanitizeHintMetadata({ km: 4, secret: "x", image: "u", foo: 1 })
    ).toEqual({ km: 4 });
  });

  it("returns undefined when nothing valid remains", () => {
    expect(sanitizeHintMetadata({ foo: "bar" })).toBeUndefined();
  });

  it("non-object inputs → undefined", () => {
    expect(sanitizeHintMetadata(null)).toBeUndefined();
    expect(sanitizeHintMetadata(undefined)).toBeUndefined();
    expect(sanitizeHintMetadata("str")).toBeUndefined();
    expect(sanitizeHintMetadata(5)).toBeUndefined();
    expect(sanitizeHintMetadata([{ km: 1 }])).toBeUndefined();
  });
});

describe("computeExcludedEventIds", () => {
  it("returns ids whose round index is not completed", () => {
    const ids = ["e0", "e1", "e2", "e3"];
    const excluded = computeExcludedEventIds(ids, new Set([0, 2]));
    expect([...excluded].sort()).toEqual(["e1", "e3"]);
  });

  it("empty when every round is completed", () => {
    const excluded = computeExcludedEventIds(["e0", "e1"], new Set([0, 1]));
    expect(excluded.size).toBe(0);
  });

  it("empty session draw → empty set", () => {
    expect(computeExcludedEventIds([], new Set()).size).toBe(0);
  });
});

describe("rankTimeline", () => {
  const self = selfAt(1900);

  it("places current between 2 newer and 2 older, newest first", () => {
    const out = rankTimeline(
      [
        cand("a", 1850),
        cand("b", 1890),
        cand("c", 1910),
        cand("d", 1950),
        cand("e", 1700),
        cand("f", 2000),
      ],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["d", "c", "self", "b", "a"]);
    expect(out.filter((i) => i.isCurrent).map((i) => i.id)).toEqual(["self"]);
  });

  it("returns fewer items when one side is short", () => {
    const out = rankTimeline([cand("a", 1890)], self, NO_EXCLUDED);
    expect(out.map((i) => i.id)).toEqual(["self", "a"]);
  });

  it("only the current event when there are no candidates", () => {
    expect(rankTimeline([], self, NO_EXCLUDED).map((i) => i.id)).toEqual(["self"]);
  });

  it("drops excluded ids and the self duplicate, dedupes repeated ids", () => {
    const out = rankTimeline(
      [cand("x", 1901), cand("y", 1902), cand("y", 1902), cand("self", 1900)],
      self,
      new Set(["x"])
    );
    expect(out.map((i) => i.id)).toEqual(["y", "self"]);
  });

  it("same-year events count as older and tie-break by title", () => {
    const out = rankTimeline(
      [cand("b", 1900), cand("a", 1900), cand("c", 1900)],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["self", "a", "b"]);
  });

  it("items carry id/title/year/location/isCurrent only", () => {
    const out = rankTimeline([cand("a", 1890)], self, NO_EXCLUDED);
    expect(out[1]).toEqual({
      id: "a",
      title: "T-a",
      year: 1890,
      location: "L-a",
      isCurrent: false,
    });
  });
});

describe("haversineKm", () => {
  it("is 0 for identical points and ~111km per degree of latitude", () => {
    expect(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe("rankByLocation", () => {
  const self = selfAt(1900, 0, 0);

  it("returns current + 4 closest, current first, nearest first", () => {
    const out = rankByLocation(
      [
        cand("far", 1800, 40, 40),
        cand("n1", 1800, 1, 0),
        cand("n3", 1800, 3, 0),
        cand("n2", 1800, 2, 0),
        cand("n4", 1800, 4, 0),
        cand("n5", 1800, 5, 0),
      ],
      self,
      NO_EXCLUDED
    );
    expect(out.map((p) => p.id)).toEqual(["self", "n1", "n2", "n3", "n4"]);
    expect(out[0]).toMatchObject({ isCurrent: true, km: 0, lat: 0, lng: 0 });
    expect(out[1].isCurrent).toBe(false);
    expect(out[1].km).toBe(111);
  });

  it("skips candidates without coordinates and excluded ids", () => {
    const out = rankByLocation(
      [cand("nocoord", 1800), cand("x", 1800, 1, 0), cand("y", 1800, 2, 0)],
      self,
      new Set(["x"])
    );
    expect(out.map((p) => p.id)).toEqual(["self", "y"]);
  });

  it("empty when the current event has no coordinates", () => {
    const out = rankByLocation(
      [cand("a", 1800, 1, 1)],
      selfAt(1900, null, null),
      NO_EXCLUDED
    );
    expect(out).toEqual([]);
  });

  it("current event alone when nothing else has coordinates", () => {
    const out = rankByLocation([cand("a", 1800)], self, NO_EXCLUDED);
    expect(out.map((p) => p.id)).toEqual(["self"]);
  });
});
