// LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011
// Unit tests for splitClueList — the comma-separated clue formatter used by
// the About-this-event modal's year/location clue sections.

import { describe, expect, it } from "vitest";
import { splitClueList } from "./learnFormat";

describe("splitClueList", () => {
  it('splits "a, b, c" into three capitalized items', () => {
    expect(splitClueList("a, b, c")).toEqual(["A", "B", "C"]);
  });

  it("trims extra spaces around items", () => {
    expect(splitClueList("  a ,  b  ,c ")).toEqual(["A", "B", "C"]);
  });

  it("drops empty items from trailing/double commas", () => {
    expect(splitClueList("a,,b,")).toEqual(["A", "B"]);
    expect(splitClueList(",a, ,b,,")).toEqual(["A", "B"]);
  });

  it("splits on the full-width comma and mixes separators", () => {
    expect(splitClueList("a，b，c")).toEqual(["A", "B", "C"]);
    expect(splitClueList("a, b，c")).toEqual(["A", "B", "C"]);
  });

  it("returns [] for null/undefined/empty/whitespace-only input", () => {
    expect(splitClueList(null)).toEqual([]);
    expect(splitClueList(undefined)).toEqual([]);
    expect(splitClueList("")).toEqual([]);
    expect(splitClueList("   ")).toEqual([]);
    expect(splitClueList(", ,，")).toEqual([]);
  });

  it("leaves an already-capitalized first letter unchanged", () => {
    expect(splitClueList("Alpha, beta")).toEqual(["Alpha", "Beta"]);
  });

  it("uppercases non-Latin first letters (é → É, β → Β)", () => {
    expect(splitClueList("élan, bête")).toEqual(["Élan", "Bête"]);
    expect(splitClueList("βήτα")).toEqual(["Βήτα"]);
  });

  it("keeps uncased/non-letter first code points unchanged (CJK, emoji)", () => {
    expect(splitClueList("中世の鎧, 刀")).toEqual(["中世の鎧", "刀"]);
    expect(splitClueList("😀face, x")).toEqual(["😀face", "X"]);
  });

  it("keeps the rest of the item verbatim (inner commas split, case preserved)", () => {
    expect(splitClueList("wooden buildings, COBBLESTONE streets")).toEqual([
      "Wooden buildings",
      "COBBLESTONE streets",
    ]);
  });
});
