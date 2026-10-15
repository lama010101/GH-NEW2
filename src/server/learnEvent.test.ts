// LEARN-BUILD-EVENTMODAL-API-1015-001 / LEARN-FIX-HINTMETA-NONEARBY-1015-003
// Pure-function tests for learnEvent.ts ranking/exclusion/metadata helpers.
// No DB access — dbPool is a lazy proxy and is never queried here.

import { describe, expect, it } from "vitest";
import { learnModeForSession } from "@/core/learnTypes";
import {
  computeExcludedEventIds,
  rankRelated,
  sanitizeHintMetadata,
  type LearnCandidate,
} from "./learnEvent";

const cand = (
  id: string,
  year: number,
  category: string | null = "war"
): LearnCandidate => ({ id, title: `T-${id}`, year, slug: `s-${id}`, category });

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

  it("list items carry id/title/year/slug only (no hints, no description)", () => {
    const out = rankRelated([cand("a", 1901)], self, NO_EXCLUDED);
    expect(out[0]).toEqual({ id: "a", title: "T-a", year: 1901, slug: "s-a" });
  });
});
