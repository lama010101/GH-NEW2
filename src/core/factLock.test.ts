// EDQ-BUILD-WDHARVEST-1122-801
// Unit tests for src/core/factLock.ts — pure G1-G5 fact-lock gates. No I/O;
// entities/extracts/geocode results are hand-built fixtures.

import { describe, expect, it } from "vitest";
import {
  MIN_LANG_AGREEMENT,
  certifyFacts,
  containsYear,
  eraForYear,
  yearNeedles,
  type FactLockInput,
} from "./factLock";
import type { WdEntity } from "./wikidataMatch";

// ── Fixture builders ─────────────────────────────────────────────────────────

function claim(value: unknown, rank = "normal") {
  return { rank, mainsnak: { datavalue: { value } } };
}
function itemClaim(qid: string, rank = "normal") {
  return claim({ id: qid, "entity-type": "item" }, rank);
}
function strClaim(s: string, rank = "normal") {
  return claim(s, rank);
}
function timeClaim(time: string, precision: number, rank = "normal") {
  return claim({ time, precision }, rank);
}
function coordClaim(lat: number, lon: number) {
  return claim({
    latitude: lat,
    longitude: lon,
    globe: "http://www.wikidata.org/entity/Q2",
  });
}
function entity(
  claims: Record<string, unknown[]>,
  sitelinks?: Record<string, unknown>
): WdEntity {
  return { claims: claims as WdEntity["claims"], sitelinks };
}

/** `count` TOTAL sitelink keys; enwiki occupies one slot iff withEn. */
function sitelinks(count: number, withEn = true): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fakes = withEn ? count - 1 : count;
  for (let i = 0; i < fakes; i++) out[`site${i}wiki`] = { title: `T${i}` };
  if (withEn) out.enwiki = { title: "Main article" };
  return out;
}

const EVENT_Q = "Q178561"; // battle — verified event class
const FICT_Q = "Q15632617"; // fictional human
const COUNTRY_Q = "Q145"; // United Kingdom -> P297 GB
const CLASSES = new Set([EVENT_Q]);
const FICT = new Set([FICT_Q]);

function baseEntity(
  overrides: { claims?: Record<string, unknown[]>; sitelinks?: Record<string, unknown> } = {}
): WdEntity {
  return entity(
    {
      P31: [itemClaim(EVENT_Q)],
      P585: [timeClaim("+1066-10-14T00:00:00Z", 11)],
      P625: [coordClaim(50.95, 1.26)], // Hastings, England
      P17: [itemClaim(COUNTRY_Q)],
      ...(overrides.claims ?? {}),
    },
    overrides.sitelinks ?? sitelinks(45)
  );
}

function baseRelated(): Record<string, WdEntity> {
  return { [COUNTRY_Q]: entity({ P297: [strClaim("GB")] }) };
}

function extractsFor(yearStr: string): Record<string, string> {
  return {
    en: `The battle was fought in ${yearStr} and changed history.`,
    de: `Die Schlacht fand im Jahr ${yearStr} statt.`,
    fr: `La bataille a eu lieu en ${yearStr}.`,
  };
}

function baseInput(overrides: Partial<FactLockInput> = {}): FactLockInput {
  return {
    entity: baseEntity(),
    related: baseRelated(),
    eventClasses: CLASSES,
    fictionalClasses: FICT,
    extracts: extractsFor("1066"),
    reverseGeocode: { countryCode: "gb" },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("factLock helpers", () => {
  it("eraForYear maps all 7 buckets", () => {
    expect(eraForYear(-1)).toBe("BCE");
    expect(eraForYear(0)).toBe("0-999");
    expect(eraForYear(999)).toBe("0-999");
    expect(eraForYear(1000)).toBe("1000-1499");
    expect(eraForYear(1499)).toBe("1000-1499");
    expect(eraForYear(1500)).toBe("1500-1799");
    expect(eraForYear(1799)).toBe("1500-1799");
    expect(eraForYear(1800)).toBe("1800-1899");
    expect(eraForYear(1899)).toBe("1800-1899");
    expect(eraForYear(1900)).toBe("1900-1949");
    expect(eraForYear(1949)).toBe("1900-1949");
    expect(eraForYear(1950)).toBe("1950+");
  });

  it("containsYear is digit-bounded and supports BCE forms", () => {
    expect(containsYear("fought in 1066 near Hastings", 1066)).toBe(true);
    expect(containsYear("the year 11066 was different", 1066)).toBe(false);
    expect(containsYear("the year 10660 was different", 1066)).toBe(false);
    expect(containsYear("fought in 53 BC", -53)).toBe(true);
    expect(containsYear("fought in 153 BC", -53)).toBe(false);
    expect(yearNeedles(-53)).toContain("53 BC");
  });

  it("containsYear normalizes NBSP/narrow/thin spaces before BCE/CE matching", () => {
    expect(containsYear("fought on 2 August 216\u00A0BC near Cannae", -216)).toBe(true);
    expect(containsYear("fought on 2 August 216\u202FBC near Cannae", -216)).toBe(true);
    expect(containsYear("fought on 2 August 216\u2009BC near Cannae", -216)).toBe(true);
    expect(containsYear("fought in 1216 BC", -216)).toBe(false);
    expect(containsYear("the year 1347 was eventful", 1347)).toBe(true);
    expect(containsYear("the year 1347\u00A0AD was eventful", 1347)).toBe(true);
    expect(containsYear("the year 13470 was different", 1347)).toBe(false);
  });
});

describe("certifyFacts G1-G5", () => {
  it("clean pass: all gates ok, year/coords/coord_source resolved", () => {
    const r = certifyFacts(baseInput());
    expect(r.pass).toBe(true);
    expect(r.gates.G1.ok).toBe(true);
    expect(r.gates.G2.ok).toBe(true);
    expect(r.gates.G3.ok).toBe(true);
    expect(r.gates.G4.ok).toBe(true);
    expect(r.gates.G5.ok).toBe(true);
    expect(r.year).toBe(1066);
    expect(r.coords).toEqual({ lat: 50.95, lon: 1.26 });
    expect(r.coord_source).toBe("P625");
    expect(r.era).toBe("1000-1499");
    expect(r.langsAgreed).toEqual(["en", "de", "fr"]);
  });

  it("year tampered +1 in extracts -> G3 fail", () => {
    const r = certifyFacts(
      baseInput({ extracts: extractsFor("1067") })
    );
    expect(r.gates.G3.ok).toBe(false);
    expect(r.gates.G3.reason).toBe("en_extract_lacks_year");
    expect(r.pass).toBe(false);
  });

  it("coordinate in wrong country -> G5 fail", () => {
    const r = certifyFacts(
      baseInput({ reverseGeocode: { countryCode: "fr" } })
    );
    expect(r.gates.G5.ok).toBe(false);
    expect(r.gates.G5.reason).toContain("country_mismatch");
    expect(r.pass).toBe(false);
  });

  it("fictional P31 class -> G1 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: { P31: [itemClaim(EVENT_Q), itemClaim(FICT_Q)] },
        }),
      })
    );
    expect(r.gates.G1.ok).toBe(false);
    expect(r.gates.G1.reason).toContain("fictional_class");
    expect(r.pass).toBe(false);
  });

  it("P31 outside allowed set -> G1 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({ claims: { P31: [itemClaim("Q5")] } }),
      })
    );
    expect(r.gates.G1.ok).toBe(false);
    expect(r.gates.G1.reason).toContain("p31_not_in_allowed_set");
  });

  it("BCE year passes with 'N BC' extracts and relaxed sitelinks", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P585: [timeClaim("-0100-00-00T00:00:00Z", 9)],
          },
          sitelinks: sitelinks(25), // relaxed floor for BCE
        }),
        extracts: {
          en: "The revolt began in 100 BC.",
          de: "Der Aufstand begann im Jahr 100 v. Chr. — mention 100 BC.",
          fr: "Le soulèvement commence en 100 av. J.-C. — 100 BC.",
        },
      })
    );
    expect(r.year).toBe(-100);
    expect(r.era).toBe("BCE");
    expect(r.pass).toBe(true);
    expect(r.gates.G1.ok).toBe(true);
  });

  it("date span > 1 year (P580+P582) -> G2 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P585: [],
            P580: [timeClaim("+1939-09-01T00:00:00Z", 11)],
            P582: [timeClaim("+1945-09-02T00:00:00Z", 11)],
          },
        }),
        extracts: extractsFor("1939"),
      })
    );
    expect(r.gates.G2.ok).toBe(false);
    expect(r.gates.G2.reason).toContain("date_span");
    expect(r.pass).toBe(false);
  });

  it("date span exactly 1 year -> G2 ok", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P585: [],
            P580: [timeClaim("+1900-01-01T00:00:00Z", 11)],
            P582: [timeClaim("+1901-01-01T00:00:00Z", 11)],
          },
        }),
        extracts: extractsFor("1900"),
      })
    );
    expect(r.gates.G2.ok).toBe(true);
    expect(r.span_years).toBe(1);
  });

  it("precision = decade (8) -> G2 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: { P585: [timeClaim("+1060-00-00T00:00:00Z", 8)] },
        }),
        extracts: extractsFor("1060"),
      })
    );
    expect(r.gates.G2.ok).toBe(false);
    expect(r.gates.G2.reason).toContain("precision_8");
  });

  it("sitelinks 39 in strict era -> G1 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: { P585: [timeClaim("+1850-00-00T00:00:00Z", 9)] },
          sitelinks: sitelinks(39),
        }),
        extracts: extractsFor("1850"),
      })
    );
    expect(r.gates.G1.ok).toBe(false);
    expect(r.gates.G1.reason).toContain("sitelinks_39_below_40");
  });

  it("sitelinks 40 in strict era -> G1 ok", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: { P585: [timeClaim("+1850-00-00T00:00:00Z", 9)] },
          sitelinks: sitelinks(40),
        }),
        extracts: extractsFor("1850"),
      })
    );
    expect(r.gates.G1.ok).toBe(true);
  });

  it("sitelinks 25 in strict era (1500-1799) -> G1 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: { P585: [timeClaim("+1600-00-00T00:00:00Z", 9)] },
          sitelinks: sitelinks(25),
        }),
        extracts: extractsFor("1600"),
      })
    );
    expect(r.gates.G1.ok).toBe(false);
    expect(r.gates.G1.reason).toContain("below_40");
  });

  it("no enwiki sitelink -> G1 fail", () => {
    const r = certifyFacts(
      baseInput({ entity: baseEntity({ sitelinks: sitelinks(45, false) }) })
    );
    expect(r.gates.G1.ok).toBe(false);
    expect(r.gates.G1.reason).toBe("no_en_sitelink");
  });

  it("P276 fallback supplies coords and P276 country ISO", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P625: [],
            P276: [itemClaim("Q999")],
          },
        }),
        related: {
          ...baseRelated(),
          Q999: entity({
            P625: [coordClaim(48.85, 2.35)],
            P17: [itemClaim("Q142")],
          }),
          Q142: entity({ P297: [strClaim("FR")] }),
        },
        reverseGeocode: { countryCode: "fr" },
      })
    );
    expect(r.gates.G4.ok).toBe(true);
    expect(r.coord_source).toBe("P276");
    expect(r.gates.G5.ok).toBe(true);
    expect(r.pass).toBe(true);
  });

  it("deprecated-rank date claim -> G2 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P585: [timeClaim("+1066-10-14T00:00:00Z", 11, "deprecated")],
          },
        }),
      })
    );
    expect(r.gates.G2.ok).toBe(false);
    expect(r.gates.G2.reason).toContain("usable_p585_p580_claims_0");
  });

  it("empty en extract -> G3 fail", () => {
    const r = certifyFacts(
      baseInput({
        extracts: { en: "", de: "... 1066 ...", fr: "... 1066 ..." },
      })
    );
    expect(r.gates.G3.ok).toBe(false);
    expect(r.gates.G3.reason).toBe("missing_en_extract");
  });

  it("only 1 support-language agreement -> G3 fail", () => {
    const r = certifyFacts(
      baseInput({
        extracts: {
          en: "The battle was fought in 1066.",
          de: "Die Schlacht fand 1066 statt.",
          fr: "La bataille en 1500.",
          es: "La batalla en 1600.",
        },
      })
    );
    expect(r.gates.G3.ok).toBe(false);
    expect(r.gates.G3.reason).toBe(
      `support_lang_agreement_1_below_${MIN_LANG_AGREEMENT}`
    );
  });

  it("two conflicting date claims -> G2 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P585: [timeClaim("+1066-10-14T00:00:00Z", 11)],
            P580: [timeClaim("+1066-10-15T00:00:00Z", 11)],
          },
        }),
      })
    );
    expect(r.gates.G2.ok).toBe(false);
    expect(r.gates.G2.reason).toContain("claims_2_ne_1");
  });

  it("reverse geocode unavailable -> G5 fail", () => {
    const r = certifyFacts(baseInput({ reverseGeocode: null }));
    expect(r.gates.G5.ok).toBe(false);
    expect(r.gates.G5.reason).toBe("reverse_geocode_unavailable");
  });

  it("historical (defunct) country falls back to modern place country", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P585: [timeClaim("+1917-11-07T00:00:00Z", 11)],
            P625: [coordClaim(55.75, 37.61)], // Moscow
            P17: [itemClaim("Q15180")], // Soviet Union (defunct)
            P131: [itemClaim("Q99998")], // admin entity inside Russia
          },
        }),
        related: {
          Q15180: entity({
            P576: [timeClaim("+1991-12-26T00:00:00Z", 11)],
            P297: [strClaim("SU")],
          }),
          Q99998: entity({ P17: [itemClaim("Q159")] }),
          Q159: entity({ P297: [strClaim("RU")] }),
        },
        extracts: extractsFor("1917"),
        reverseGeocode: { countryCode: "ru" },
      })
    );
    expect(r.gates.G5.ok).toBe(true);
    expect(r.pass).toBe(true);
  });

  it("defunct country with no matching modern place -> G5 fail", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: {
            P585: [timeClaim("+1917-11-07T00:00:00Z", 11)],
            P625: [coordClaim(55.75, 37.61)],
            P17: [itemClaim("Q15180")],
          },
        }),
        related: {
          Q15180: entity({
            P576: [timeClaim("+1991-12-26T00:00:00Z", 11)],
            P297: [strClaim("SU")],
          }),
        },
        extracts: extractsFor("1917"),
        reverseGeocode: { countryCode: "ru" },
      })
    );
    expect(r.gates.G5.ok).toBe(false);
    expect(r.gates.G5.reason).toContain("place_country_mismatch");
  });
});

describe("containsYear language-aware era markers (EDQ-FIX-FACTLOCK-1123-830)", () => {
  it("BCE -216 matches each language's native marker form", () => {
    expect(containsYear("fought in 216 BC", -216, "en")).toBe(true);
    expect(containsYear("fought in 216\u00A0BC", -216, "en")).toBe(true);
    expect(containsYear("fought in 216 B.C.", -216, "en")).toBe(true);
    expect(containsYear("die Schlacht fand 216 v. Chr. statt", -216, "de")).toBe(true);
    expect(containsYear("la bataille a eu lieu en 216 av. J.-C.", -216, "fr")).toBe(true);
    expect(containsYear("la batalla ocurrió en 216 a. C.", -216, "es")).toBe(true);
    expect(containsYear("a batalha ocorreu em 216 a.C.", -216, "pt")).toBe(true);
    expect(containsYear("la battaglia avvenne nel 216 a.C.", -216, "it")).toBe(true);
    expect(containsYear("битва произошла в 216 года до н. э.", -216, "ru")).toBe(true);
    expect(containsYear("坎尼战役发生于前216年", -216, "zh")).toBe(true);
    expect(containsYear("カンナエの戦いは紀元前216年にあった", -216, "ja")).toBe(true);
  });

  it("BCE -216 rejects wrong digits, CE markers and missing markers", () => {
    expect(containsYear("fought in 1216 BC", -216, "en")).toBe(false);
    expect(containsYear("fought in 216 AD", -216, "en")).toBe(false);
    expect(containsYear("die Schlacht fand 216 n. Chr. statt", -216, "de")).toBe(false);
    expect(containsYear("カンナエの戦いは紀元後216年にあった", -216, "ja")).toBe(false);
    expect(containsYear("坎尼战役发生于公元216年", -216, "zh")).toBe(false);
    expect(containsYear("カンナエの戦いは216年にあった", -216, "ja")).toBe(false);
    expect(containsYear("坎尼战役发生于216年", -216, "zh")).toBe(false);
  });

  it("CE year 216 rejects digits carrying a BCE marker", () => {
    expect(containsYear("in 216 BC", 216, "en")).toBe(false);
    expect(containsYear("216 v. Chr.", 216, "de")).toBe(false);
    expect(containsYear("in 216 AD", 216, "en")).toBe(true);
    expect(containsYear("the year 216", 216, "en")).toBe(true);
    expect(containsYear("216", 216, "en")).toBe(true);
    expect(containsYear("公元前216年", 216, "zh")).toBe(false);
    expect(containsYear("紀元前216年", 216, "ja")).toBe(false);
    expect(containsYear("公元216年", 216, "zh")).toBe(true);
  });

  it("certifyFacts: BCE event passes G3 with en + 2 native support extracts", () => {
    const r = certifyFacts(
      baseInput({
        entity: baseEntity({
          claims: { P585: [timeClaim("-0216-00-00T00:00:00Z", 9)] },
          sitelinks: sitelinks(25),
        }),
        extracts: {
          en: "The Battle of Cannae was fought in 216 BC.",
          de: "Die Schlacht von Cannae fand 216 v. Chr. statt.",
          fr: "La bataille de Cannes a eu lieu en 216 av. J.-C.",
        },
      })
    );
    expect(r.year).toBe(-216);
    expect(r.gates.G3.ok).toBe(true);
    expect(r.langsAgreed).toEqual(["en", "de", "fr"]);
    expect(r.pass).toBe(true);
  });
});
