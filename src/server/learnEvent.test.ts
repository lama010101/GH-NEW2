// LEARN-BUILD-EVENTMODAL-API-1015-001
// Pure-function tests for learnEvent.ts ranking/exclusion helpers.
// No DB access — dbPool is a lazy proxy and is never queried here.

import { describe, expect, it } from "vitest";
import {
  computeExcludedEventIds,
  haversineKm,
  rankNearbyInPlace,
  rankNearbyInTime,
  rankRelated,
  type LearnCandidate,
} from "./learnEvent";

const cand = (
  id: string,
  year: number,
  category: string | null = "war",
  lat: number | null = null,
  lng: number | null = null
): LearnCandidate => ({ id, title: `T-${id}`, year, slug: `s-${id}`, category, lat, lng });

const NO_EXCLUDED = new Set<string>();

describe("haversineKm", () => {
  it("same point → 0", () => {
    expect(haversineKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });

  it("Paris→London ≈ 343 km", () => {
    const d = haversineKm(
      { lat: 48.8566, lng: 2.3522 },
      { lat: 51.5074, lng: -0.1278 }
    );
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });

  it("is symmetric", () => {
    const a = { lat: 35.6762, lng: 139.6503 };
    const b = { lat: -33.8688, lng: 151.2093 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
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

describe("rankRelated", () => {
  const self = { id: "self", year: 1900, category: "war" };

  it("keeps only same-category events, excludes self", () => {
    const out = rankRelated(
      [cand("a", 1901, "war"), cand("b", 1899, "art"), cand("self", 1900, "war")],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });

  it("orders by |year diff| asc then title asc", () => {
    const out = rankRelated(
      [cand("b", 1905), cand("a", 1905), cand("c", 1890), cand("d", 1901)],
      self,
      NO_EXCLUDED
    );
    // |diff|: d=1, a=b=5 (title tie-break), c=10
    expect(out.map((i) => i.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("drops excluded (unfinished same-session) ids", () => {
    const out = rankRelated(
      [cand("x", 1900), cand("y", 1901)],
      self,
      new Set(["x"])
    );
    expect(out.map((i) => i.id)).toEqual(["y"]);
  });

  it("caps at limit (4)", () => {
    const out = rankRelated(
      ["a", "b", "c", "d", "e", "f"].map((id, i) => cand(id, 1900 + i)),
      self,
      NO_EXCLUDED
    );
    expect(out).toHaveLength(4);
  });

  it("null self category → empty", () => {
    const out = rankRelated(
      [cand("a", 1900)],
      { id: "self", year: 1900, category: null },
      NO_EXCLUDED
    );
    expect(out).toEqual([]);
  });

  it("list items carry id/title/year/slug only (no km)", () => {
    const out = rankRelated([cand("a", 1901)], self, NO_EXCLUDED);
    expect(out[0]).toEqual({ id: "a", title: "T-a", year: 1901, slug: "s-a" });
  });
});

describe("rankNearbyInTime", () => {
  const self = { id: "self", year: 1950 };

  it("orders by |year diff| asc across all categories", () => {
    const out = rankNearbyInTime(
      [cand("far", 1800, "art"), cand("near", 1949, "war"), cand("mid", 1960, "sci")],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["near", "mid", "far"]);
  });

  it("excludes self and unfinished same-session events", () => {
    const out = rankNearbyInTime(
      [cand("self", 1950), cand("leak", 1951), cand("ok", 1952)],
      self,
      new Set(["leak"])
    );
    expect(out.map((i) => i.id)).toEqual(["ok"]);
  });

  it("tie-breaks equal diffs by title", () => {
    const out = rankNearbyInTime(
      [
        { ...cand("z", 1951), title: "Zulu" },
        { ...cand("a", 1951), title: "Alpha" },
      ],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["a", "z"]);
  });
});

describe("rankNearbyInPlace", () => {
  const self = { id: "self", lat: 48.8566, lng: 2.3522 }; // Paris

  it("orders by great-circle distance asc and attaches km", () => {
    const out = rankNearbyInPlace(
      [
        cand("tokyo", 0, "x", 35.6762, 139.6503),
        cand("london", 0, "x", 51.5074, -0.1278),
        cand("berlin", 0, "x", 52.52, 13.405),
      ],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["london", "berlin", "tokyo"]);
    expect(out[0].km).toBeGreaterThan(330);
    expect(out[0].km).toBeLessThan(360);
  });

  it("skips candidates with no location", () => {
    const out = rankNearbyInPlace(
      [cand("noloc", 0), cand("london", 0, "x", 51.5074, -0.1278)],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["london"]);
  });

  it("self with no location → empty array (empty-location behavior)", () => {
    const out = rankNearbyInPlace(
      [cand("london", 0, "x", 51.5074, -0.1278)],
      { id: "self", lat: null, lng: null },
      NO_EXCLUDED
    );
    expect(out).toEqual([]);
  });

  it("no located candidates → empty array", () => {
    const out = rankNearbyInPlace([cand("a", 0), cand("b", 0)], self, NO_EXCLUDED);
    expect(out).toEqual([]);
  });

  it("excludes self and unfinished same-session events", () => {
    const out = rankNearbyInPlace(
      [
        cand("self", 0, "x", 48.8566, 2.3522),
        cand("leak", 0, "x", 51.5, -0.12),
        cand("ok", 0, "x", 52.52, 13.405),
      ],
      self,
      new Set(["leak"])
    );
    expect(out.map((i) => i.id)).toEqual(["ok"]);
  });
});
