// GEN-BUILD-DISCOVER-1028-001
// Unit tests for src/core/candidateFingerprint.ts — the only fingerprint
// implementation — plus the wikidataDiscovery query-builder/mapper
// assertions (kept here so no extra test file is added).

import { describe, expect, it } from "vitest";
import { buildDedupeFingerprint, normalizeTitle } from "./candidateFingerprint";
import {
  buildDiscoveryQuery,
  eraLabelForYear,
  eraWindows,
  mapBindingToCandidate,
  quotaBucket,
  regionLabel,
  type DiscoveryBinding,
} from "./wikidataDiscovery";

function lit(v: string) {
  return { type: "literal", value: v };
}

function binding(over: Partial<Record<keyof DiscoveryBinding, string>>): DiscoveryBinding {
  const row: DiscoveryBinding = {
    item: { type: "uri", value: "http://www.wikidata.org/entity/Q7162" },
    itemLabel: lit("Battle of Waterloo"),
    date: lit("+1815-06-18T00:00:00Z"),
    precision: lit("11"),
    lat: lit("50.680"),
    lon: lit("4.412"),
    coordSource: lit("P625"),
    sitelinks: lit("95"),
    p31s: lit("Q178561,Q192909"),
  };
  for (const [k, v] of Object.entries(over)) {
    const key = k as keyof DiscoveryBinding;
    row[key] = key === "item" ? { type: "uri", value: v } : lit(v);
  }
  return row;
}

describe("normalizeTitle", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeTitle("  Battle   of  Waterloo ")).toBe("battle of waterloo");
  });
  it("strips diacritics", () => {
    expect(normalizeTitle("São Paulo Cōrte")).toBe("sao paulo corte");
    expect(normalizeTitle("München Ñandú")).toBe("munchen nandu");
    // Letters without an NFD decomposition (e.g. ł) drop as non-alphanumerics.
    expect(normalizeTitle("Łódź")).toBe("odz");
  });
  it("removes non-alphanumeric characters as separators", () => {
    expect(normalizeTitle("Rosa-Luxemburg-Platz (Berlin)")).toBe("rosa luxemburg platz berlin");
  });
  it("same event different casing/diacritics normalize equal", () => {
    expect(normalizeTitle("BATTLE OF CROISY-FERREY")).toBe(normalizeTitle("battle of croisy ferrey"));
    expect(normalizeTitle("Bāṭle")).toBe(normalizeTitle("batle"));
  });
});

describe("buildDedupeFingerprint", () => {
  it("builds title|year|lat|lon with 0.1-degree rounding", () => {
    expect(
      buildDedupeFingerprint({ title: "Battle of Waterloo", year: 1815, lat: 50.6799, lon: 4.4123 })
    ).toBe("battle of waterloo|1815|50.7|4.4");
  });
  it("missing coords degrade to na", () => {
    expect(
      buildDedupeFingerprint({ title: "Treaty of X", year: 1919, lat: null, lon: null })
    ).toBe("treaty of x|1919|na|na");
    expect(
      buildDedupeFingerprint({ title: "Solo", year: 2000, lat: 48.85, lon: null })
    ).toBe("solo|2000|48.9|na");
  });
  it("missing year degrades to na", () => {
    expect(
      buildDedupeFingerprint({ title: "Undated", year: null, lat: 1.04, lon: 2.06 })
    ).toBe("undated|na|1.0|2.1");
  });
  it("BCE year is kept signed (1-based convention)", () => {
    expect(
      buildDedupeFingerprint({ title: "Assassination of Caesar", year: -44, lat: 41.89, lon: 12.47 })
    ).toBe("assassination of caesar|-44|41.9|12.5");
  });
  it("different events in the same year do NOT collide", () => {
    const a = buildDedupeFingerprint({ title: "Battle of Hastings", year: 1066, lat: 50.91, lon: 0.49 });
    const b = buildDedupeFingerprint({ title: "Coronation of William", year: 1066, lat: 51.50, lon: -0.12 });
    expect(a).not.toBe(b);
  });
  it("same event with different casing collides", () => {
    expect(
      buildDedupeFingerprint({ title: "BATTLE OF HASTINGS", year: 1066, lat: 50.91, lon: 0.49 })
    ).toBe(
      buildDedupeFingerprint({ title: "Battle of Hastings", year: 1066, lat: 50.91, lon: 0.49 })
    );
  });
});

describe("buildDiscoveryQuery", () => {
  it("embeds class QIDs as VALUES and required filters", () => {
    const q = buildDiscoveryQuery({
      classQids: ["Q178561", "Q188055"],
      yearMin: -400,
      yearMax: 2025,
      minSitelinks: 15,
      limit: 200,
      offset: 400,
    });
    expect(q).toContain("VALUES ?classQid { wd:Q178561 wd:Q188055 }");
    expect(q).toContain("wdt:P31/wdt:P279* ?classQid");
    expect(q).toContain("psv:P585");
    expect(q).toContain("psv:P580");
    expect(q).toContain("FILTER(?precision >= 9)");
    expect(q).toContain("FILTER(YEAR(?date) >= -400 && YEAR(?date) <= 2025)");
    expect(q).toContain("FILTER(?sitelinks >= 15)");
    expect(q).toContain("SERVICE wikibase:label");
    expect(q).toContain('bd:serviceParam wikibase:language "en"');
    expect(q).toContain("wikibase:geoLatitude");
    expect(q).toContain('BIND("P625" AS ?coordSource)');
    expect(q).toContain('BIND("P276" AS ?coordSource)');
    expect(q).toContain("wdt:P276");
    expect(q).toContain("GROUP_CONCAT(DISTINCT ?p31");
    expect(q).toContain("LIMIT 200");
    expect(q).toContain("OFFSET 400");
  });
});

describe("mapBindingToCandidate", () => {
  const ctx = { classGroup: "battle", yearMin: -400, yearMax: 2025 };

  it("maps a valid row to the generation_candidates shape", () => {
    const r = mapBindingToCandidate(binding({}), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.candidate;
    expect(c.status).toBe("new");
    expect(c.wikidata_qid).toBe("Q7162");
    expect(c.wd_label).toBe("Battle of Waterloo");
    expect(c.title).toBe("Battle of Waterloo");
    expect(c.event_year).toBe(1815);
    expect(c.event_date).toBe("1815-06-18");
    expect(c.date_precision).toBe(11);
    expect(c.latitude).toBeCloseTo(50.68);
    expect(c.longitude).toBeCloseTo(4.412);
    expect(c.coord_source).toBe("P625");
    expect(c.p31).toEqual(["Q178561", "Q192909"]);
    expect(c.sitelinks).toBe(95);
    expect(c.real_event).toBe(true);
    expect(c.dedupe_fingerprint).toBe("battle of waterloo|1815|50.7|4.4");
    expect(c.source_citations).toEqual([
      { type: "wikidata", qid: "Q7162", url: "https://www.wikidata.org/wiki/Q7162" },
    ]);
    expect(c.quota_bucket).toEqual({ era: "c19", class: "battle", region: "N50_E0" });
  });

  it("maps BCE years with the reused parser (-N = N BCE)", () => {
    const r = mapBindingToCandidate(
      binding({
        itemLabel: "Assassination of Julius Caesar",
        date: "-0044-03-15T00:00:00Z",
        lat: "41.895",
        lon: "12.483",
        sitelinks: "80",
      }),
      ctx
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidate.event_year).toBe(-44);
    expect(r.candidate.event_date).toBe("-0044-03-15");
    expect(r.candidate.dedupe_fingerprint).toBe(
      "assassination of julius caesar|-44|41.9|12.5"
    );
    expect(r.candidate.quota_bucket.era).toBe("bce1c");
  });

  it("rejects unparseable date as null_year", () => {
    const r = mapBindingToCandidate(binding({ date: "not-a-date" }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("null_year");
  });

  it("rejects precision < 9 (below year)", () => {
    const r = mapBindingToCandidate(binding({ precision: "7" }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("precision_below_year");
  });

  it("rejects missing coordinates as no_coords", () => {
    const row = binding({});
    delete row.lat;
    delete row.lon;
    delete row.coordSource;
    const r = mapBindingToCandidate(row, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_coords");
  });

  it("rejects year outside the requested range", () => {
    const r = mapBindingToCandidate(binding({}), { ...ctx, yearMin: 1900 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("year_out_of_range");
  });

  it("rejects year 0 as null_year (ambiguous under BCE convention)", () => {
    const r = mapBindingToCandidate(binding({ date: "0000-01-01T00:00:00Z" }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("null_year");
  });
});

describe("era/region/quotaBucket", () => {
  it("eraLabelForYear partitions CE centuries", () => {
    expect(eraLabelForYear(1)).toBe("c1");
    expect(eraLabelForYear(100)).toBe("c1");
    expect(eraLabelForYear(101)).toBe("c2");
    expect(eraLabelForYear(1815)).toBe("c19");
    expect(eraLabelForYear(2025)).toBe("c21");
  });
  it("eraLabelForYear partitions BCE centuries and millenniums", () => {
    expect(eraLabelForYear(-1)).toBe("bce1c");
    expect(eraLabelForYear(-100)).toBe("bce1c");
    expect(eraLabelForYear(-101)).toBe("bce2c");
    expect(eraLabelForYear(-999)).toBe("bce10c");
    expect(eraLabelForYear(-1000)).toBe("bce1m");
    expect(eraLabelForYear(-1001)).toBe("bce2m");
    expect(eraLabelForYear(-3000)).toBe("bce3m");
  });
  it("eraLabelForYear rejects null and year 0", () => {
    expect(eraLabelForYear(0)).toBe("unknown");
    expect(eraLabelForYear(null)).toBe("unknown");
  });
  it("eraWindows partitions a CE range without overlap", () => {
    const w = eraWindows(1065, 1067);
    expect(w).toEqual([{ era: "c11", yearMin: 1065, yearMax: 1067 }]);
    const w2 = eraWindows(95, 105);
    expect(w2).toEqual([
      { era: "c1", yearMin: 95, yearMax: 100 },
      { era: "c2", yearMin: 101, yearMax: 105 },
    ]);
  });
  it("eraWindows never overlaps and never emits unknown", () => {
    const w = eraWindows(-5, 10);
    const eras = w.map((x) => x.era);
    expect(eras).not.toContain("unknown");
    // coverage check: windows tile [-5,10] minus year 0
    expect(w[0]).toEqual({ era: "bce1c", yearMin: -5, yearMax: -1 });
    expect(w[1]).toEqual({ era: "c1", yearMin: 1, yearMax: 10 });
  });
  it("regionLabel produces 10-degree cells", () => {
    expect(regionLabel(41.9, 12.5)).toBe("N40_E10");
    // floor semantics: -33.9 falls in the band [-40,-30) labeled "S40".
    expect(regionLabel(-33.9, 151.2)).toBe("S40_E150");
    expect(regionLabel(null, 5)).toBe("unknown");
  });
  it("quotaBucket composes era/class/region", () => {
    expect(quotaBucket({ year: 1815, classGroup: "battle", lat: 50.68, lon: 4.41 })).toEqual({
      era: "c19",
      class: "battle",
      region: "N50_E0",
    });
  });
});
