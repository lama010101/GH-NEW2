// EDQ-BUILD-WIKIDATA-VERIFY-1026-001-A
// Unit tests for src/core/wikidataMatch.ts — pure matcher for the Wikidata
// verification runner. No I/O; entities are hand-built Action-API shapes.

import { describe, expect, it } from "vitest";
import {
  MIN_MATCH_MARGIN,
  MIN_MATCH_SCORE,
  YEAR_TOLERANCE,
  classifyVerification,
  extractCoords,
  extractEventDates,
  isEventLike,
  normalizeTokens,
  parseWikidataTime,
  scoreCandidate,
  selectCandidate,
  type MatchCandidate,
  type Selection,
  type WdEntity,
} from "./wikidataMatch";

function claim(propValue: unknown) {
  return { mainsnak: { datavalue: { value: propValue } } };
}

function timeClaim(time: string, precision: number) {
  return claim({ time, precision });
}

function entity(claims: Record<string, unknown[]>): WdEntity {
  return { claims: claims as WdEntity["claims"] };
}

function selectionOf(kind: Selection["kind"], winnerQid: string | null): Selection {
  const winner = winnerQid
    ? { qid: winnerQid, label: "x", aliases: [], sitelinks: 10, eventLike: true, containment: 1, dice: 1 }
    : null;
  return { kind, winner, runnerUp: null, ranked: winner ? [winner] : [] };
}

describe("parseWikidataTime", () => {
  it("parses CE dates and passes precision through (9/10/11)", () => {
    expect(parseWikidataTime({ time: "+1809-00-00T00:00:00Z", precision: 9 })).toEqual({ year: 1809, precision: 9 });
    expect(parseWikidataTime({ time: "+1809-07-00T00:00:00Z", precision: 10 })).toEqual({ year: 1809, precision: 10 });
    expect(parseWikidataTime({ time: "+1809-07-05T00:00:00Z", precision: 11 })).toEqual({ year: 1809, precision: 11 });
  });

  it("passes through coarse precisions (8 decade / 7 century)", () => {
    expect(parseWikidataTime({ time: "+1810-00-00T00:00:00Z", precision: 8 })).toEqual({ year: 1810, precision: 8 });
    expect(parseWikidataTime({ time: "+1800-00-00T00:00:00Z", precision: 7 })).toEqual({ year: 1800, precision: 7 });
  });

  it("maps Wikidata -N years directly to -N = N BCE (empirical)", () => {
    // Q205887 Carrhae P585 "-0053" = 53 BC -> stored -53
    expect(parseWikidataTime({ time: "-0053-06-09T00:00:00Z", precision: 11 })).toEqual({ year: -53, precision: 11 });
    // Q179670 Gaugamela P585 "-0331" = 331 BC -> stored -331
    expect(parseWikidataTime({ time: "-0331-10-01T00:00:00Z", precision: 11 })).toEqual({ year: -331, precision: 11 });
    // Q827612 Jugurthine War P580 "-0111" / P582 "-0105"
    expect(parseWikidataTime({ time: "-0111-00-00T00:00:00Z", precision: 9 })).toEqual({ year: -111, precision: 9 });
    expect(parseWikidataTime({ time: "-0105-00-00T00:00:00Z", precision: 9 })).toEqual({ year: -105, precision: 9 });
  });

  it("rejects the ambiguous serialized year 0", () => {
    expect(parseWikidataTime({ time: "-0000-00-00T00:00:00Z", precision: 9 })).toBeNull();
    expect(parseWikidataTime({ time: "+0000-00-00T00:00:00Z", precision: 9 })).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseWikidataTime({ time: "garbage", precision: 9 })).toBeNull();
    expect(parseWikidataTime({ time: "+1809-07-05T00:00:00Z" })).toBeNull();
    expect(parseWikidataTime({ precision: 9 })).toBeNull();
    expect(parseWikidataTime(null)).toBeNull();
    expect(parseWikidataTime(undefined)).toBeNull();
  });
});

describe("extractEventDates", () => {
  it("P585 point in time bounds both ends", () => {
    const e = entity({ P585: [timeClaim("+1809-07-05T00:00:00Z", 11)] });
    expect(extractEventDates(e)).toEqual({ yearStart: 1809, yearEnd: 1809, precision: 11, props: ["P585"] });
  });

  it("P580/P582 form a range; earliest start + latest end across multiples", () => {
    const e = entity({
      P580: [timeClaim("-0111-00-00T00:00:00Z", 9), timeClaim("-0110-00-00T00:00:00Z", 9)],
      P582: [timeClaim("-0105-00-00T00:00:00Z", 9), timeClaim("-0106-00-00T00:00:00Z", 9)],
    });
    expect(extractEventDates(e)).toEqual({ yearStart: -111, yearEnd: -105, precision: 9, props: ["P580", "P582"] });
  });

  it("P571 inception bounds the start; end falls back to start", () => {
    const e = entity({ P571: [timeClaim("+1885-00-00T00:00:00Z", 9)] });
    expect(extractEventDates(e)).toEqual({ yearStart: 1885, yearEnd: 1885, precision: 9, props: ["P571"] });
  });

  it("P582-only collapses to a single-year range", () => {
    const e = entity({ P582: [timeClaim("+1815-00-00T00:00:00Z", 9)] });
    expect(extractEventDates(e)).toEqual({ yearStart: 1815, yearEnd: 1815, precision: 9, props: ["P582"] });
  });

  it("precision is the coarsest among consumed claims", () => {
    const e = entity({
      P580: [timeClaim("+1800-00-00T00:00:00Z", 7)],
      P582: [timeClaim("+1899-00-00T00:00:00Z", 9)],
    });
    expect(extractEventDates(e)?.precision).toBe(7);
  });

  it("returns null with no parseable event-date claims", () => {
    expect(extractEventDates(entity({}))).toBeNull();
    expect(extractEventDates(entity({ P585: [claim("not-a-time")] }))).toBeNull();
    expect(extractEventDates(entity({ P577: [timeClaim("+1809-00-00T00:00:00Z", 9)] }))).toBeNull();
  });
});

describe("extractCoords", () => {
  const P625 = (lat: number, lon: number) => claim({ latitude: lat, longitude: lon });
  const P276 = (id: string) => claim({ "entity-type": "item", "numeric-id": 1, id });

  it("reads P625 directly from the entity", () => {
    const e = entity({ P625: [P625(48.2, 16.37)] });
    expect(extractCoords(e, {})).toEqual({ lat: 48.2, lon: 16.37, source: "P625" });
  });

  it("falls back to P625 of the P276 location entity (one hop)", () => {
    const e = entity({ P276: [P276("Q102679")] });
    const p276 = { Q102679: entity({ P625: [P625(48.08, 16.31)] }) };
    expect(extractCoords(e, p276)).toEqual({ lat: 48.08, lon: 16.31, source: "P276" });
  });

  it("prefers direct P625 over P276 hop", () => {
    const e = entity({ P625: [P625(48.2, 16.37)], P276: [P276("Q102679")] });
    const p276 = { Q102679: entity({ P625: [P625(48.08, 16.31)] }) };
    expect(extractCoords(e, p276)?.source).toBe("P625");
  });

  it("returns null when the P276 entity is absent or has no P625", () => {
    const e = entity({ P276: [P276("Q102679")] });
    expect(extractCoords(e, {})).toBeNull();
    expect(extractCoords(e, { Q102679: entity({}) })).toBeNull();
    expect(extractCoords(entity({}), {})).toBeNull();
  });
});

describe("scoreCandidate", () => {
  const narrative = "Viennese Civilians Witness the Aftermath of the Battle of Wagram";

  it("containment saturates for a short label inside a narrative title", () => {
    const s = scoreCandidate({ label: "Battle of Wagram", aliases: [] }, narrative);
    expect(s.containment).toBe(1);
    expect(s.dice).toBeCloseTo((2 * 2) / (2 + 6), 6);
  });

  it("scores 0 for a sub-2-meaningful-token label that is not an exact match", () => {
    const s = scoreCandidate({ label: "Wagram", aliases: [] }, narrative);
    expect(s.containment).toBe(0);
    expect(s.dice).toBeCloseTo((2 * 1) / (1 + 6), 6);
  });

  it("allows an exact normalized single-token match", () => {
    const s = scoreCandidate({ label: "Wagram", aliases: [] }, "Wagram");
    expect(s.containment).toBe(1);
    expect(s.dice).toBe(1);
  });

  it("takes the best score across label and aliases", () => {
    const s = scoreCandidate(
      { label: "Vienna 1809 (painting)", aliases: ["Battle of Wagram"] },
      narrative
    );
    expect(s.containment).toBe(1);
  });

  it("is case/punctuation-insensitive and drops stopwords", () => {
    const s = scoreCandidate({ label: "battle-of-wagram!", aliases: [] }, "The Battle of Wagram");
    expect(s.containment).toBe(1);
  });

  // RECALL-1027-001: query variants — better containment across titles wins.
  it("takes the better containment across title variants (q1 + q2)", () => {
    const label = { label: "Battle of Kosovo", aliases: [] };
    // q1-style narrative title alone: {battle,kosovo}∩{kingdom,falls,...}=0.
    expect(scoreCandidate(label, "Kingdom Falls to the Invading Ottoman Army").containment).toBe(0);
    // [q1, q2] array: q2 "Battle of Kosovo" matches fully -> 1.0.
    const s = scoreCandidate(label, [
      "Kingdom Falls to the Invading Ottoman Army",
      "Battle of Kosovo",
    ]);
    expect(s.containment).toBe(1);
    expect(s.dice).toBe(1);
  });
});

describe("selectCandidate", () => {
  const cand = (qid: string, label: string, sitelinks: number, eventLike = true): MatchCandidate =>
    ({ qid, label, aliases: [], sitelinks, eventLike });

  it("picks the highest-containment event-like candidate", () => {
    const sel = selectCandidate(
      // Q1 "Wagram clash": inter={wagram} 1/min(2,2)=0.5; Q2 = 1.0
      [cand("Q1", "Wagram clash", 5), cand("Q2", "Battle of Wagram", 40)],
      "Battle of Wagram"
    );
    expect(sel.kind).toBe("winner");
    expect(sel.winner?.qid).toBe("Q2");
  });

  it("ignores non-event-like candidates entirely", () => {
    const sel = selectCandidate(
      [cand("Q1", "Battle of Wagram", 500, false), cand("Q2", "Battle of Wagram Anniversary", 3)],
      "Battle of Wagram"
    );
    expect(sel.kind).toBe("winner");
    expect(sel.winner?.qid).toBe("Q2");
  });

  it("is ambiguous when the margin over the runner-up is too thin", () => {
    const sel = selectCandidate(
      [cand("Q1", "Battle of Wagram", 5), cand("Q2", "Battle of Wagram", 40)],
      "Battle of Wagram"
    );
    // Both score 1.0 -> margin 0 < MIN_MATCH_MARGIN
    expect(MIN_MATCH_MARGIN).toBeGreaterThan(0);
    expect(sel.kind).toBe("ambiguous");
  });

  it("is no_match when everything scores below MIN_MATCH_SCORE", () => {
    const sel = selectCandidate(
      [cand("Q1", "Something Entirely Different", 5)],
      "Battle of Wagram"
    );
    expect(MIN_MATCH_SCORE).toBeGreaterThan(0);
    expect(sel.kind).toBe("no_match");
  });

  it("is no_match when no candidate is event-like", () => {
    const sel = selectCandidate(
      [cand("Q1", "Battle of Wagram", 500, false)],
      "Battle of Wagram"
    );
    expect(sel.kind).toBe("no_match");
  });

  it("breaks score ties by sitelink count", () => {
    const sel = selectCandidate(
      [cand("Q1", "Battle of Wagram", 5), cand("Q2", "Battle of Wagram", 400)],
      "Battle of Wagram"
    );
    expect(sel.ranked[0].qid).toBe("Q2");
    expect(sel.ranked[1].qid).toBe("Q1");
  });

  // CORRECTION 1 cases (CTO ruling 1026-001-A)
  it("a single-meaningful-token label does not win", () => {
    const sel = selectCandidate(
      [cand("Q1", "Wagram", 500), cand("Q2", "Battle of Wagram", 3)],
      "Viennese Civilians Witness the Aftermath of the Battle of Wagram"
    );
    expect(sel.winner?.qid).toBe("Q2");
  });

  it("an exact single-token title match does win", () => {
    const sel = selectCandidate([cand("Q1", "Wagram", 5)], "Wagram");
    expect(sel.kind).toBe("winner");
    expect(sel.winner?.qid).toBe("Q1");
  });

  it("selection-integrity: stored year/coords cannot influence the winner", () => {
    // The runner-up is crafted to be the "year-closer" candidate (Q2's label is
    // a weak match but hypothetically its dates would coincide with the stored
    // year). selectCandidate has no year/coords parameters at all — the winner
    // is purely the label/event-like/sitelink ranking.
    const sel = selectCandidate(
      [cand("Q1", "Battle of Wagram", 5), cand("Q2", "Random 1809 Entity", 3)],
      "Battle of Wagram"
    );
    expect(sel.kind).toBe("winner");
    expect(sel.winner?.qid).toBe("Q1");
    const again = selectCandidate(
      [cand("Q1", "Battle of Wagram", 5), cand("Q2", "Random 1809 Entity", 3)],
      "Battle of Wagram"
    );
    expect(again.winner?.qid).toBe("Q1");
  });

  // RECALL-1027-001: query-variant titles and diagnostic-field isolation.
  it("scores candidates against all query variants and keeps the best", () => {
    const sel = selectCandidate(
      [cand("Q1", "Battle of Kosovo", 5)],
      ["Kingdom Falls to the Invading Ottoman Army", "Battle of Kosovo"]
    );
    expect(sel.kind).toBe("winner");
    expect(sel.winner?.containment).toBe(1);
  });

  it("selection output is identical whether yearConsistentWithStored is computed or not", () => {
    const titles = ["Kingdom Falls to the Invading Ottoman Army", "Battle of Kosovo"];
    const candidates = [cand("Q1", "Battle of Kosovo", 5), cand("Q2", "Kosovo Battlefield", 3)];
    const plain = selectCandidate(candidates, titles);
    const annotated: Array<MatchCandidate & { yearConsistentWithStored?: boolean }> =
      candidates.map((c) => ({ ...c, yearConsistentWithStored: c.qid === "Q2" }));
    const withDiag = selectCandidate(annotated, titles);
    // Decision-relevant output is identical; the diagnostic field is carried
    // through the candidate spread but never read by selection logic.
    const project = (s: Selection) => ({
      kind: s.kind,
      winner: s.winner?.qid,
      runnerUp: s.runnerUp?.qid,
      ranked: s.ranked.map((c) => [c.qid, c.containment, c.sitelinks]),
    });
    expect(project(withDiag)).toEqual(project(plain));
    expect(plain.winner?.qid).toBe("Q1");
  });
});

describe("classifyVerification", () => {
  const dates = (s: number, e: number, p = 9) => ({ yearStart: s, yearEnd: e, precision: p, props: ["P585"] });
  const at = (lat: number, lon: number): { lat: number; lon: number; source: "P625" } => ({ lat, lon, source: "P625" });

  it("verified: year inside range and distance <= KM_VERIFIED", () => {
    const v = classifyVerification({
      storedYear: 1809, storedLat: 48.2, storedLon: 16.37,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1809, 1809, 11), coords: at(48.2, 16.37),
    });
    expect(v).toMatchObject({ status: "verified", yearDelta: 0 });
  });

  // RECALL-1027-001: 'verified' requires distance evidence — no WD coords can
  // never produce 'verified' even on an exact year + label hit.
  it("review: no WD coords means never verified — coords_unverifiable", () => {
    const v = classifyVerification({
      storedYear: 1809, storedLat: 48.2, storedLon: 16.37,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1809, 1809), coords: null,
    });
    expect(v).toMatchObject({
      status: "review",
      reason: "coords_unverifiable",
      yearDelta: 0,
      distanceKm: null,
      coordsUnverifiable: true,
    });
  });

  it("review: Expo-style false positive — exact label and year, zero distance evidence", () => {
    // "Expo 2024 in Rome" matched the Chengdu 2024 horticultural expo via an
    // exact alias after " in Rome" was cleaned away. Distance evidence is
    // required for 'verified'.
    const v = classifyVerification({
      storedYear: 2024, storedLat: 41.9, storedLon: 12.5,
      selection: selectionOf("winner", "Q138822940"),
      dates: dates(2024, 2024), coords: null,
    });
    expect(v.status).toBe("review");
    expect(v.reason).toBe("coords_unverifiable");
    expect(v.coordsUnverifiable).toBe(true);
  });

  it("review: missing stored coords is also unverifiable even when WD coords exist", () => {
    const v = classifyVerification({
      storedYear: 1809, storedLat: null, storedLon: null,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1809, 1809), coords: at(48.2, 16.37),
    });
    expect(v).toMatchObject({
      status: "review",
      reason: "coords_unverifiable",
      coordsUnverifiable: true,
    });
  });

  it("review: coarse precision skips the year comparison entirely", () => {
    const v = classifyVerification({
      storedYear: 1750, storedLat: 48.2, storedLon: 16.37,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1800, 1800, 7), coords: at(48.2, 16.37),
    });
    expect(v).toMatchObject({ status: "review", reason: "coarse_precision" });
  });

  it("review: stored year exactly at the tolerance boundary", () => {
    expect(YEAR_TOLERANCE).toBe(1);
    const v = classifyVerification({
      storedYear: 1808, storedLat: 48.2, storedLon: 16.37,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1809, 1809), coords: at(48.2, 16.37),
    });
    expect(v).toMatchObject({ status: "review", reason: "year_at_tolerance_boundary", yearDelta: -1 });
  });

  it("review: distance inside (KM_VERIFIED, KM_REVIEW]", () => {
    const v = classifyVerification({
      storedYear: 1809, storedLat: 0, storedLon: 0,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1809, 1809), coords: at(0, 0.8), // ~89 km
    });
    expect(v.status).toBe("review");
    expect(v.reason).toBe("distance_in_review_band");
    expect(v.distanceKm).toBeGreaterThan(50);
    expect(v.distanceKm).toBeLessThanOrEqual(200);
  });

  it("mismatch: year outside the tolerated range", () => {
    const v = classifyVerification({
      storedYear: 1800, storedLat: 48.2, storedLon: 16.37,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1809, 1809), coords: at(48.2, 16.37),
    });
    expect(v).toMatchObject({ status: "mismatch", reason: "year_out_of_range", yearDelta: -9 });
  });

  it("mismatch: distance beyond KM_REVIEW even with year ok", () => {
    const v = classifyVerification({
      storedYear: 1809, storedLat: 0, storedLon: 0,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1809, 1809), coords: at(0, 10), // ~1112 km
    });
    expect(v.status).toBe("mismatch");
    expect(v.reason).toBe("distance_beyond_review");
  });

  it("no_match, ambiguous and no_wd_date pass through", () => {
    expect(
      classifyVerification({ storedYear: 1809, storedLat: null, storedLon: null, selection: selectionOf("no_match", null), dates: null, coords: null }).status
    ).toBe("no_match");
    expect(
      classifyVerification({ storedYear: 1809, storedLat: null, storedLon: null, selection: selectionOf("ambiguous", "Q9"), dates: dates(1809, 1809), coords: null }).status
    ).toBe("ambiguous");
    expect(
      classifyVerification({ storedYear: 1809, storedLat: null, storedLon: null, selection: selectionOf("winner", "Q9"), dates: null, coords: null }).status
    ).toBe("no_wd_date");
  });

  it("yearDelta is the signed distance outside [wd_start, wd_end]", () => {
    const v = classifyVerification({
      storedYear: 1820, storedLat: 0, storedLon: 0,
      selection: selectionOf("winner", "Q1"),
      dates: dates(1800, 1810), coords: at(0, 0),
    });
    expect(v.yearDelta).toBe(10);
  });
});

describe("isEventLike / normalizeTokens", () => {
  it("event-like iff any of P585/P580/P582/P571 is present", () => {
    expect(isEventLike(entity({ P585: [timeClaim("+1809-00-00T00:00:00Z", 9)] }))).toBe(true);
    expect(isEventLike(entity({ P571: [timeClaim("+1809-00-00T00:00:00Z", 9)] }))).toBe(true);
    expect(isEventLike(entity({ P31: [claim({ id: "Q16532" })] }))).toBe(false);
    expect(isEventLike(entity({}))).toBe(false);
  });

  it("normalizeTokens drops stopwords and punctuation", () => {
    expect(normalizeTokens("The Battle of Wagram")).toEqual(["battle", "wagram"]);
    expect(normalizeTokens("Launch of Radio Primera Red in Buenos Aires")).toEqual([
      "launch", "radio", "primera", "red", "buenos", "aires",
    ]);
  });
});
