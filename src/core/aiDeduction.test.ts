import { describe, it, expect } from "vitest";
import {
  DEDUCTION_REFERENCE_YEAR,
  scrubDescription,
  renderHint,
  buildT1Stimulus,
  buildT2Prompt,
  buildT3Item,
  buildT4Item,
  parseDeductionAnswer,
  scoreAnswer,
  brier,
  aggregateDeductionScores,
  summarizeLadder,
  type DeductionEventCore,
  type DeductionPoolEvent,
  type DeductionScrubContext,
} from "./aiDeduction";
import { evaluateRound } from "./rules";
import type { EventRecord } from "./types";

// AIP-BUILD-DEDUCTCORE-1108-013 — pure deduction benchmark core proof.

describe("scrubDescription", () => {
  it("scrubs the Fire of London leak case (year + place names)", () => {
    const r = scrubDescription(
      "A fire broke out in 1748 and spread through London, destroying warehouses across the United Kingdom.",
      {
        eventYear: 1748,
        title: "The Fire of London (1748)",
        displayName: "London, United Kingdom",
        country: "United Kingdom",
        continent: "Europe",
      }
    );
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.text).not.toMatch(/1748/);
    expect(r.text).not.toMatch(/London/i);
    expect(r.text).not.toMatch(/United Kingdom/i);
  });

  it("scrubs the 1923 Constitution case including the embedded title", () => {
    const r = scrubDescription(
      "The 1923 Constitution of Romania adoption was signed in Chisinau in 1923, reshaping the region.",
      {
        eventYear: 1923,
        title: "The 1923 Constitution of Romania adoption",
        displayName: "Chisinau, Romania",
        country: "Romania",
        continent: "Europe",
      }
    );
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/1923/);
    expect(r.text).not.toMatch(/Romania/i);
    expect(r.text).not.toMatch(/Chisinau/i);
    expect(r.text).not.toMatch(/Constitution/i);
  });

  it("scrubs the 1980s/1988 West Berlin leak case", () => {
    const r = scrubDescription(
      "Crowds in West Berlin wear 1980s fashion; analog cameras capture 1988 event signage.",
      {
        eventYear: 1988,
        title: "People wearing 1980s fashion, analog cameras, presence of 1988 event signage",
        displayName: "West Berlin, West Germany",
        country: "West Germany",
        continent: "Europe",
      }
    );
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/1980s/);
    expect(r.text).not.toMatch(/1988/);
    expect(r.text).not.toMatch(/West Berlin/i);
    expect(r.text).not.toMatch(/West Germany/i);
  });

  it("scrubs the 1950s/1958 Stockholm leak case", () => {
    const r = scrubDescription(
      "Clothing styles reflective of the 1950s, signage reflecting 1958 aesthetics, photographed in Stockholm.",
      {
        eventYear: 1958,
        title: "Clothing styles reflective of the 1950s, signage reflecting 1958 aesthetics",
        displayName: "Stockholm, Sweden",
        country: "Sweden",
        continent: "Europe",
      }
    );
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/1950s/);
    expect(r.text).not.toMatch(/1958/);
    expect(r.text).not.toMatch(/Stockholm/i);
    expect(r.text).not.toMatch(/Sweden/i);
  });

  it("keeps legitimate non-temporal text intact", () => {
    const desc = "Guests stroll through the gardens, sharing bread and wine beneath the trees.";
    const r = scrubDescription(desc, {
      eventYear: 1900,
      title: "Garden Party",
      displayName: "Paris, France",
      country: "France",
      continent: "Europe",
    });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(desc);
  });

  it("fails closed when a leak survives scrubbing (ok=false)", () => {
    // AIP-BUILD-DEDUCTFIX-1109-023: "the 40s" is now covered by the widened
    // R2 decade rule, so the surviving leak uses a bare "40s" (no the/early/
    // mid/late prefix, no era suffix) which R5 still catches.
    const r = scrubDescription("In 44 BCE, 40s crowds gathered in Rome.", {
      eventYear: -44,
      title: "Assassination of Caesar",
      displayName: "Rome, Italy",
      country: "Italy",
      continent: "Europe",
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("40s"))).toBe(true);
  });

  it("handles BCE years and BC/BCE suffix variants", () => {
    const r = scrubDescription(
      "In 44 BCE and again in 44 BC, Caesar was assassinated near Rome.",
      {
        eventYear: -44,
        title: "Assassination of Caesar",
        displayName: "Rome, Italy",
        country: "Italy",
        continent: "Europe",
      }
    );
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/44/);
    expect(r.text).not.toMatch(/BCE|\bBC\b/i);
    expect(r.text).not.toMatch(/Rome/i);
  });

  it("removes AD/CE suffix variants of the event year", () => {
    const r = scrubDescription(
      "In 1066 AD the conquest began; chronicles also say 1066 CE.",
      {
        eventYear: 1066,
        title: "The Conquest",
        displayName: "Hastings, England",
        country: "England",
        continent: "Europe",
      }
    );
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/1066/);
    expect(r.text).not.toMatch(/\bAD\b|\bCE\b/i);
  });

  it("removes place forms longest-first", () => {
    const r = scrubDescription("West Germany reports calm weather across the region.", {
      eventYear: 1900,
      title: "Weather Report",
      displayName: "Dusseldorf, West Germany",
      country: "Germany",
      continent: "Europe",
    });
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/Germany/i);
    // 'West' surviving would prove 'Germany' was removed before 'West Germany'.
    expect(r.text).not.toMatch(/\bWest\b/i);
  });

  it("is idempotent — scrubbing twice equals scrubbing once", () => {
    const ctx: DeductionScrubContext = {
      eventYear: 1923,
      title: "The 1923 Constitution of Romania adoption",
      displayName: "Chisinau, Romania",
      country: "Romania",
      continent: "Europe",
    };
    const desc = "The 1923 Constitution of Romania adoption was signed in Chisinau in 1923.";
    const once = scrubDescription(desc, ctx);
    const twice = scrubDescription(once.text, ctx);
    expect(twice.text).toBe(once.text);
    expect(twice.ok).toBe(once.ok);
  });
});

// ---------------------------------------------------------------------------
// AIP-BUILD-DEDUCTFIX-1109-023 — widened scrub coverage + placeholders.
// "clean" = ok=true with no residual reasons (fail-closed would also satisfy
// the spec's fallback definition, but every fixture below scrubs cleanly).
// ---------------------------------------------------------------------------

describe("scrubDescription widened coverage + placeholders", () => {
  const C = (
    eventYear: number,
    extra: Partial<DeductionScrubContext> = {}
  ): DeductionScrubContext => ({
    eventYear,
    title: "Fixture Title",
    displayName: null,
    country: null,
    continent: null,
    ...extra,
  });

  const clean: [string, string, DeductionScrubContext][] = [
    ["A1", "In AD 79 the town was buried.", C(79)],
    ["A2", "in 79 CE and later", C(79)],
    ["A4-BCE", "in 426 BCE", C(-426)],
    ["A4-B.C.", "in 426 B.C.", C(-426)],
    ["A4-420sBCE", "in the 420s BCE", C(-426)],
    ["A4-mid420s", "in the mid-420s BC", C(-426)],
    ["A5-spelledYear", "in nineteen sixty-nine", C(1969)],
    ["A5-19thC", "in the nineteenth century", C(1969)],
    ["A5-20thC", "in the twentieth century", C(1969)],
    ["A6-apos69", "in '69", C(1969)],
    ["A6-apos60s", "the '60s", C(1969)],
    ["A6-sixties", "the sixties", C(1969)],
    ["A6-late1960s", "late 1960s", C(1969)],
    ["A6-rangeSlash", "in 1969/70", C(1969)],
    ["A6-rangeDash", "in 1969-70", C(1969)],
    ["A6-commaYear", "in 1,969", C(1969)],
  ];
  for (const [name, text, c] of clean) {
    it(`${name}: ${JSON.stringify(text)}`, () => {
      const r = scrubDescription(text, c);
      expect(r.ok).toBe(true);
      expect(r.reasons).toEqual([]);
    });
  }

  it("A1 leaves no bare AD residue", () => {
    const r = scrubDescription("In AD 79 the town was buried.", C(79));
    expect(r.ok).toBe(true);
    expect(r.text).toBe("In [year] the town was buried.");
    expect(r.text).not.toMatch(/\bAD\b/);
  });

  it("A7 produces the exact placeholder text", () => {
    const r = scrubDescription("On 14 July 1789 the prison fell", C(1789));
    expect(r.ok).toBe(true);
    expect(r.text).toBe("On 14 July [year] the prison fell");
  });

  it("A5 MCMLXIX is unchanged (Roman numerals are documented INFO)", () => {
    const r = scrubDescription("MCMLXIX", C(1969));
    expect(r.ok).toBe(true);
    expect(r.text).toBe("MCMLXIX");
  });

  it("A8 accent-folded place matching; demonyms/alt names unchanged (INFO)", () => {
    const krakow = C(1241, {
      displayName: "Kraków, Lesser Poland, Poland",
      country: "Poland",
      continent: "Europe",
    });
    for (const t of ["The army reached Krakow in force.", "The army reached Kraków in force."]) {
      const r = scrubDescription(t, krakow);
      expect(r.ok).toBe(true);
      expect(r.text).toContain("[place]");
      expect(r.text).not.toMatch(/Krakow|Kraków/i);
    }
    for (const t of ["Polish forces advanced.", "Poles cheered.", "Cracow fell."]) {
      const r = scrubDescription(t, krakow);
      expect(r.ok).toBe(true);
      expect(r.text).toBe(t);
    }
  });

  it("A9 US/UK aliases apply; demonym unchanged (INFO)", () => {
    const us = C(1776, { country: "United States", continent: "North America" });
    expect(scrubDescription("the U.S. army", us).text).toBe("the [place] army");
    expect(scrubDescription("USA troops", us).text).toBe("[place] troops");
    expect(scrubDescription("United States forces", us).text).toBe("[place] forces");
    expect(scrubDescription("American troops", us).text).toBe("American troops");
  });

  it("A10 short place forms are case-sensitive: pronoun 'us' survives", () => {
    const us = C(1776, { country: "US", continent: "North America" });
    expect(scrubDescription("give us time", us).text).toBe("give us time");
    expect(scrubDescription("US forces", us).text).toBe("[place] forces");
  });

  it("A11 title-word overlap is BY DESIGN — description unchanged", () => {
    // "Hastings" is not a place form of this context, and R4 only removes the
    // full title string, so single-word overlap with the title is preserved.
    const r = scrubDescription("The battle near Hastings was decisive.", C(1066, {
      title: "Battle of Hastings",
      displayName: "Normandy, France",
      country: "France",
      continent: "Europe",
    }));
    expect(r.ok).toBe(true);
    expect(r.text).toBe("The battle near Hastings was decisive.");
  });

  it("A12 anniversary phrases unchanged (INFO)", () => {
    for (const t of ["the 10th anniversary", "25th anniversary of the event"]) {
      const r = scrubDescription(t, C(1950));
      expect(r.ok).toBe(true);
      expect(r.text).toBe(t);
    }
  });

  it("A13 eventYear 0/1 over-scrubs ordinary counts (documented behaviour)", () => {
    // The literal eventYear is treated as a year token even when it is 0 or 1.
    expect(scrubDescription("0 casualties reported", C(0)).text).toBe(
      "[year] casualties reported"
    );
    expect(scrubDescription("1 fleet sighted", C(1)).text).toBe("[year] fleet sighted");
  });

  it("punctuation: no ',,' or ',.' artifacts survive", () => {
    const r = scrubDescription("On March 29, 1458, Matthias was crowned.", C(1458));
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/,,|,\./);
    expect(r.text).toContain("[year]");

    const r2 = scrubDescription("Expo '74 was held in Spokane, Washington.", C(1974, {
      displayName: "Spokane, Washington, United States",
      country: "United States",
      continent: "North America",
    }));
    expect(r2.ok).toBe(true);
    expect(r2.text).not.toMatch(/74|Spokane/);
    expect(r2.text).toContain("[place]");
  });
});

describe("renderHint", () => {
  it("renders a JSON array string as bullets", () => {
    expect(renderHint('["alpha","beta"]')).toBe("- alpha\n- beta");
  });

  it("returns plain text unchanged", () => {
    expect(renderHint("just some text")).toBe("just some text");
  });

  it("returns malformed or non-string-array JSON unchanged", () => {
    expect(renderHint("{not json")).toBe("{not json");
    expect(renderHint('["a", 1]')).toBe('["a", 1]');
    expect(renderHint('{"x":1}')).toBe('{"x":1}');
    expect(renderHint('["a","b"] trailing')).toBe('["a","b"] trailing');
  });
});

describe("buildT1Stimulus", () => {
  const HINTS = [
    { tier: 5, type: "what", content: "reveals the event itself" },
    { tier: 1, type: "where", content: "In the north" },
    { tier: 1, type: "when", content: "Early in the century" },
    { tier: 2, type: "when", content: "Around the midpoint" },
    { tier: 3, type: "where", content: "Along the coast" },
    { tier: 5, type: "when", content: '["first","second"]' },
  ];

  it("step k contains exactly the when/where hints with tier <= k, in (tier,type) order", () => {
    expect(buildT1Stimulus(HINTS, 2)).toBe(
      "Tier 1 when: Early in the century\n" +
        "Tier 1 where: In the north\n" +
        "Tier 2 when: Around the midpoint"
    );
  });

  it("is cumulative across steps and renders tier-5 JSON arrays as bullets", () => {
    const step3 = buildT1Stimulus(HINTS, 3);
    expect(step3).toBe(
      "Tier 1 when: Early in the century\n" +
        "Tier 1 where: In the north\n" +
        "Tier 2 when: Around the midpoint\n" +
        "Tier 3 where: Along the coast"
    );
    expect(buildT1Stimulus(HINTS, 5)).toBe(
      step3 + "\nTier 5 when: - first\n- second"
    );
    // 'what' hints are never part of the deduction stimulus.
    expect(buildT1Stimulus(HINTS, 5)).not.toContain("reveals the event itself");
  });

  it("throws on step outside 1..5", () => {
    for (const bad of [0, 6, -1, 2.5, Number.NaN]) {
      expect(() => buildT1Stimulus(HINTS, bad)).toThrow();
    }
  });
});

describe("buildT2Prompt", () => {
  it("returns a user message containing the scrubbed description and answer keys", () => {
    const p = buildT2Prompt("A fire swept the city.");
    expect(p).toContain("A fire swept the city.");
    expect(p).toContain("Description:");
    for (const k of ["year", "lat", "lng", "confidence", "abstain", "reasoning"]) {
      expect(p).toContain(k);
    }
    expect(p).not.toContain("The Fire of London");
  });
});

// ---------------------------------------------------------------------------
// T3 fixtures — the true title must itself be leak-free.
// ---------------------------------------------------------------------------

const T3_TRUE: DeductionPoolEvent = {
  id: "e-1969",
  title: "Summer Games Opening",
  year: 1969,
  continent: "Europe",
  displayName: "London, United Kingdom",
  country: "United Kingdom",
};

// AIP-BUILD-DEDUCTFIX-1109-023: decoys need displayName or country to be
// eligible (they are scrubbed symmetrically); displayName/country words are
// kept disjoint from the titles so titles scrub to themselves.
const T3_POOL: DeductionEventCore[] = [
  { id: "d1", title: "Berlin Wall Construction", year: 1961, continent: "Europe", displayName: "Paris, France", country: "France" },
  { id: "d2", title: "Treaty of Rome Signing", year: 1957, continent: "Europe", displayName: "Lyon, France", country: "France" },
  { id: "d3", title: "Alpine Tunnel Completion", year: 1970, continent: "Europe", displayName: "Zurich, Switzerland", country: "Switzerland" },
  { id: "d4", title: "Baltic Fleet Review", year: 1965, continent: "Europe", displayName: "Stockholm, Sweden", country: "Sweden" },
  { id: "d5", title: "Pyrenees Railway Opening", year: 1964, continent: "Europe", displayName: "Madrid, Spain", country: "Spain" },
  { id: "x-cont", title: "Desert Caravan Arrival", year: 1969, continent: "Africa", displayName: "Cairo, Egypt", country: "Egypt" },
  { id: "x-year", title: "Ancient Script Discovery", year: 1800, continent: "Europe", displayName: "Athens, Greece", country: "Greece" },
  { id: "x-dup", title: "Summer Games Opening", year: 1968, continent: "Europe", displayName: "Paris, France", country: "France" },
];

describe("buildT3Item", () => {
  it("builds 5 options: true title + 4 decoys, true position hash-derived", () => {
    const r = buildT3Item(T3_TRUE, T3_POOL, "salt-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options).toHaveLength(5);
    expect(r.options.map((o) => o.id)).toEqual(["a", "b", "c", "d", "e"]);
    const titles = r.options.map((o) => o.title);
    expect(new Set(titles).size).toBe(5);
    expect(titles.filter((t) => t === T3_TRUE.title)).toHaveLength(1);
    const answer = r.options.find((o) => o.id === r.answerId);
    expect(answer?.title).toBe(T3_TRUE.title);
    // decoys come from the eligible pool only
    for (const t of titles) {
      if (t !== T3_TRUE.title) {
        expect(T3_POOL.some((p) => p.title === t)).toBe(true);
      }
    }
  });

  it("is deterministic for the same salt and reorders for different salts", () => {
    const a = buildT3Item(T3_TRUE, T3_POOL, "salt-1");
    const b = buildT3Item(T3_TRUE, T3_POOL, "salt-1");
    expect(a).toEqual(b);
    const orders = new Set(
      ["s0", "s1", "s2", "s3", "s4", "s5"].map((salt) => {
        const r = buildT3Item(T3_TRUE, T3_POOL, salt);
        if (!r.ok) throw new Error("unexpected failure");
        return r.options.map((o) => `${o.id}:${o.title}`).join("|");
      })
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("returns insufficient_decoys when fewer than 4 eligible decoys exist", () => {
    const few = T3_POOL.filter((p) => ["d1", "d2", "d3"].includes(p.id));
    const r = buildT3Item(T3_TRUE, few, "salt-1");
    expect(r).toEqual({ ok: false, reason: "insufficient_decoys" });
    expect(buildT3Item(T3_TRUE, [], "salt-1")).toEqual({
      ok: false,
      reason: "insufficient_decoys",
    });
  });

  it("counts duplicate decoy titles once toward the 4 needed", () => {
    const dupPool: DeductionEventCore[] = [
      { id: "d1", title: "Alpha Event", year: 1960, continent: "Europe", displayName: "Paris, France", country: "France" },
      { id: "d2", title: "Beta Event", year: 1965, continent: "Europe", displayName: "Lyon, France", country: "France" },
      { id: "d3", title: "Gamma Event", year: 1970, continent: "Europe", displayName: "Nice, France", country: "France" },
      { id: "d4", title: "Beta Event", year: 1971, continent: "Europe", displayName: "Paris, France", country: "France" },
    ];
    const r = buildT3Item(T3_TRUE, dupPool, "salt-1");
    expect(r).toEqual({ ok: false, reason: "insufficient_decoys" });
  });

  // AIP-BUILD-DEDUCTFIX-1109-023: leaking titles are now scrubbed with each
  // option event's OWN context; option_title_leak only fires when the residual
  // check still fails after that scrub.
  const T3_LEAKY_BASE: DeductionEventCore[] = [
    { id: "d1", title: "Alpha Event", year: 1960, continent: "Europe", displayName: "Paris, France", country: "France" },
    { id: "d2", title: "Beta Event", year: 1965, continent: "Europe", displayName: "Lyon, France", country: "France" },
    { id: "d3", title: "Gamma Event", year: 1970, continent: "Europe", displayName: "Nice, France", country: "France" },
  ];

  it("scrubs a 4-digit year in a decoy title to [year] instead of rejecting", () => {
    const leaky: DeductionEventCore[] = [
      ...T3_LEAKY_BASE,
      { id: "dl", title: "The 1957 Treaty Details", year: 1960, continent: "Europe", displayName: "Paris, France", country: "France" },
    ];
    const r = buildT3Item(T3_TRUE, leaky, "salt-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.map((o) => o.title)).toContain("The [year] Treaty Details");
  });

  it("scrubs a place token in a decoy title to [place] instead of rejecting", () => {
    const leaky: DeductionEventCore[] = [
      ...T3_LEAKY_BASE,
      { id: "dl", title: "London Eye Construction", year: 1960, continent: "Europe", displayName: "London, United Kingdom", country: "United Kingdom" },
    ];
    const r = buildT3Item(T3_TRUE, leaky, "salt-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.map((o) => o.title)).toContain("[place] Eye Construction");
  });

  it("scrubs a year-like token in a decoy title instead of rejecting", () => {
    const leaky: DeductionEventCore[] = [
      ...T3_LEAKY_BASE,
      { id: "dl", title: "Events of the 1960s", year: 1960, continent: "Europe", displayName: "Paris, France", country: "France" },
    ];
    const r = buildT3Item(T3_TRUE, leaky, "salt-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.map((o) => o.title)).toContain("Events of the [year]");
  });

  it("scrubs the TRUE title itself instead of rejecting", () => {
    const trueLeak: DeductionPoolEvent = { ...T3_TRUE, title: "The 1923 Games" };
    const r = buildT3Item(trueLeak, T3_POOL, "salt-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const answer = r.options.find((o) => o.id === r.answerId);
    expect(answer?.title).toBe("The [year] Games");
  });

  it("fails closed on option_title_leak when a scrubbed title still leaks", () => {
    // "40s Files" keeps a bare "40s" (no the/early/mid/late prefix, no era
    // suffix) which survives R2 and trips the R5 decade residual for year 44.
    const trueEv: DeductionPoolEvent = {
      id: "e-45",
      title: "Ancient Uprising",
      year: 45,
      continent: "Europe",
      displayName: "Rome, Italy",
      country: "Italy",
    };
    const pool: DeductionEventCore[] = [
      { id: "d1", title: "Alpha Event", year: 40, continent: "Europe", displayName: "Paris, France", country: "France" },
      { id: "d2", title: "Beta Event", year: 50, continent: "Europe", displayName: "Lyon, France", country: "France" },
      { id: "d3", title: "Gamma Event", year: 47, continent: "Europe", displayName: "Nice, France", country: "France" },
      { id: "dl", title: "40s Files", year: 44, continent: "Europe", displayName: "Paris, France", country: "France" },
    ];
    expect(buildT3Item(trueEv, pool, "salt-1")).toEqual({
      ok: false,
      reason: "option_title_leak",
    });
  });

  it("skips decoy candidates that carry neither displayName nor country", () => {
    const noCtx: DeductionEventCore[] = [
      { id: "n1", title: "No Context One", year: 1960, continent: "Europe" },
      { id: "n2", title: "No Context Two", year: 1965, continent: "Europe" },
      { id: "n3", title: "No Context Three", year: 1970, continent: "Europe" },
      { id: "n4", title: "No Context Four", year: 1962, continent: "Europe" },
      { id: "n5", title: "No Context Five", year: 1968, continent: "Europe" },
    ];
    // Only 3 context-carrying decoys exist -> insufficient_decoys despite 8 raw candidates.
    const threeCtx: DeductionEventCore[] = [...T3_LEAKY_BASE, ...noCtx];
    expect(buildT3Item(T3_TRUE, threeCtx, "salt-1")).toEqual({
      ok: false,
      reason: "insufficient_decoys",
    });
    // A 4th context-carrying decoy makes the item build; context-less titles never appear.
    const fourCtx: DeductionEventCore[] = [
      ...threeCtx,
      { id: "d4", title: "Delta Event", year: 1963, continent: "Europe", displayName: "Paris, France", country: "France" },
    ];
    const r = buildT3Item(T3_TRUE, fourCtx, "salt-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const titles = r.options.map((o) => o.title);
    for (const n of noCtx) expect(titles).not.toContain(n.title);
  });
});

// ---------------------------------------------------------------------------
// T4 fixtures — variant A (pick-real).
// ---------------------------------------------------------------------------

const T4_EVENT: DeductionPoolEvent = {
  id: "e-t4",
  title: "Summer Games Opening",
  year: 1969,
  continent: "Europe",
  displayName: "London, United Kingdom",
  country: "United Kingdom",
  hints: [
    { tier: 1, type: "when", content: "Held in a summer month" },
    { tier: 1, type: "where", content: "Northern European capital" },
    { tier: 2, type: "when", content: "Late in the decade" },
    { tier: 2, type: "where", content: "Along a major river" },
    { tier: 3, type: "what", content: "Global broadcast" },
  ],
};

const T4_SLOT = { tier: 1, type: "when" };

const T4_POOL: DeductionPoolEvent[] = [
  {
    id: "p1",
    title: "Event One",
    year: 1955,
    continent: "Europe",
    hints: [
      { tier: 1, type: "when", content: "Winter scheduling" },
      { tier: 1, type: "where", content: "Mountain venue" },
      { tier: 2, type: "when", content: "Autumn slot" },
    ],
  },
  {
    id: "p2",
    title: "Event Two",
    year: 1972,
    continent: "Europe",
    hints: [{ tier: 1, type: "when", content: "Autumn dates" }],
  },
  {
    id: "p3",
    title: "Event Three",
    year: 1960,
    continent: "Europe",
    hints: [
      { tier: 1, type: "when", content: "Spring calendar" },
      { tier: 1, type: "when", content: "Winter scheduling" },
    ],
  },
  {
    id: "p4",
    title: "Event Four",
    year: 1990,
    continent: "Europe",
    hints: [{ tier: 1, type: "when", content: "Winter scheduling" }],
  },
  {
    id: "px1",
    title: "Event Five",
    year: 1969,
    continent: "Asia",
    hints: [{ tier: 1, type: "when", content: "Monsoon timing" }],
  },
  {
    id: "px2",
    title: "Event Six",
    year: 1800,
    continent: "Europe",
    hints: [{ tier: 1, type: "when", content: "Ancient rites" }],
  },
];

describe("buildT4Item", () => {
  it("builds title + 4 hint options for the same (tier,type) slot", () => {
    const r = buildT4Item(T4_EVENT, T4_POOL, T4_SLOT, "salt-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.title).toBe("Summer Games Opening");
    expect(r.options).toHaveLength(4);
    expect(r.options.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
    const real = T4_EVENT.hints![0].content;
    const contents = r.options.map((o) => o.content);
    expect(new Set(contents).size).toBe(4);
    expect(contents.filter((c) => c === real)).toHaveLength(1);
    const answer = r.options.find((o) => o.id === r.answerId);
    expect(answer?.content).toBe(real);
    // decoys are the distinct same-slot contents from eligible pool events
    for (const c of contents) {
      if (c !== real) {
        expect(["Winter scheduling", "Autumn dates", "Spring calendar"]).toContain(c);
      }
    }
  });

  it("is deterministic for the same salt and reorders for different salts", () => {
    const a = buildT4Item(T4_EVENT, T4_POOL, T4_SLOT, "salt-1");
    const b = buildT4Item(T4_EVENT, T4_POOL, T4_SLOT, "salt-1");
    expect(a).toEqual(b);
    const orders = new Set(
      ["s0", "s1", "s2", "s3", "s4", "s5"].map((salt) => {
        const r = buildT4Item(T4_EVENT, T4_POOL, T4_SLOT, salt);
        if (!r.ok) throw new Error("unexpected failure");
        return r.options.map((o) => `${o.id}:${o.content}`).join("|");
      })
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("never lets a decoy equal the real content", () => {
    const r = buildT4Item(T4_EVENT, T4_POOL, T4_SLOT, "salt-9");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const real = T4_EVENT.hints![0].content;
    for (const o of r.options) {
      if (o.id !== r.answerId) expect(o.content).not.toBe(real);
    }
  });

  it("returns insufficient_decoys when fewer than 3 distinct decoys exist", () => {
    const small = T4_POOL.filter((p) => ["p1", "p2"].includes(p.id));
    expect(buildT4Item(T4_EVENT, small, T4_SLOT, "salt-1")).toEqual({
      ok: false,
      reason: "insufficient_decoys",
    });
    expect(buildT4Item(T4_EVENT, [], T4_SLOT, "salt-1")).toEqual({
      ok: false,
      reason: "insufficient_decoys",
    });
  });

  it("returns missing_real_hint when the event has no hint at the slot", () => {
    expect(buildT4Item(T4_EVENT, T4_POOL, { tier: 4, type: "when" }, "salt-1")).toEqual({
      ok: false,
      reason: "missing_real_hint",
    });
  });
});

// ---------------------------------------------------------------------------
// parseDeductionAnswer
// ---------------------------------------------------------------------------

const GOOD_ANSWER = JSON.stringify({
  year: 1969,
  lat: 51.5,
  lng: -0.12,
  choice: "b",
  confidence: 0.8,
  abstain: false,
  reasoning: "first Moon landing",
});

describe("parseDeductionAnswer", () => {
  it("parses fenced JSON", () => {
    const r = parseDeductionAnswer(`\`\`\`json\n${GOOD_ANSWER}\n\`\`\``, {
      options: ["a", "b", "c"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answer).toEqual({
      year: 1969,
      lat: 51.5,
      lng: -0.12,
      choice: "b",
      confidence: 0.8,
      abstain: false,
      reasoning: "first Moon landing",
    });
    expect(r.flags).toEqual([]);
  });

  it("parses prose-wrapped JSON", () => {
    const r = parseDeductionAnswer(`Here is my answer:\n${GOOD_ANSWER}\nHope this helps!`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answer.year).toBe(1969);
    expect(r.answer.confidence).toBe(0.8);
  });

  it("prefers the balanced object that carries answer keys", () => {
    const r = parseDeductionAnswer(
      'noise {"note":{"deep":1}} tail {"year":1900,"lat":10,"lng":20} end'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answer.year).toBe(1900);
    expect(r.answer.lat).toBe(10);
  });

  it("returns bad_output for truncated or unparseable JSON", () => {
    for (const bad of [
      '{"year": 1969, "lat":',
      "not json at all",
      "",
      "   ",
      "[1,2,3]",
      "42",
      null,
      undefined,
    ]) {
      const r = parseDeductionAnswer(bad);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.errorClass).toBe("bad_output");
      expect(r.error.startsWith("Failed to parse AI deduction response:")).toBe(true);
    }
  });

  it("validates fields: integer year, ranged lat/lng, clamped confidence", () => {
    const r = parseDeductionAnswer(
      '{"year":"1969","lat":91,"lng":-181,"confidence":1.7,"reasoning":"ok"}'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answer.year).toBe(1969);
    expect(r.answer.lat).toBeNull();
    expect(r.answer.lng).toBeNull();
    expect(r.answer.confidence).toBe(1);
    expect(r.answer.reasoning).toBe("ok");

    const r2 = parseDeductionAnswer('{"year":1969.5,"lat":-90,"lng":180,"confidence":"high"}');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.answer.year).toBeNull();
    expect(r2.answer.lat).toBe(-90);
    expect(r2.answer.lng).toBe(180);
    expect(r2.answer.confidence).toBeNull();
  });

  it("flags an unknown choice and nulls it", () => {
    const bad = parseDeductionAnswer('{"choice":"z"}', { options: ["a", "b"] });
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    expect(bad.answer.choice).toBeNull();
    expect(bad.flags).toContain("invalid_choice");

    const good = parseDeductionAnswer('{"choice":"a"}', { options: ["a", "b"] });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.answer.choice).toBe("a");
    expect(good.flags).toEqual([]);

    const noOptions = parseDeductionAnswer('{"choice":"a"}');
    expect(noOptions.ok).toBe(true);
    if (!noOptions.ok) return;
    expect(noOptions.answer.choice).toBeNull();
    expect(noOptions.flags).toContain("invalid_choice");
  });

  it("defaults abstain to false and only accepts a real boolean true", () => {
    const empty = parseDeductionAnswer("{}");
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.answer).toEqual({
      year: null,
      lat: null,
      lng: null,
      choice: null,
      confidence: null,
      abstain: false,
      reasoning: null,
    });

    const str = parseDeductionAnswer('{"abstain":"yes"}');
    expect(str.ok).toBe(true);
    if (!str.ok) return;
    expect(str.answer.abstain).toBe(false);

    const yes = parseDeductionAnswer('{"abstain":true}');
    expect(yes.ok).toBe(true);
    if (!yes.ok) return;
    expect(yes.answer.abstain).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scoreAnswer / brier / aggregates / summarizeLadder
// ---------------------------------------------------------------------------

const TRUTH = { year: 1969, lat: 0.67408, lng: 23.47297, choice: "c" };

const parsed = (obj: unknown, options?: string[]) =>
  parseDeductionAnswer(JSON.stringify(obj), options === undefined ? {} : { options });

const TRUTH_EVENT: EventRecord = {
  id: "ev-1969",
  title: "Moon Landing",
  description: "Apollo 11 lands on the Moon",
  year: 1969,
  location: { id: "loc", name: "Mare Tranquillitatis", lat: 0.67408, lng: 23.47297 },
  region: "Space",
  imageUrl: null,
  thumbUrl: null,
  hints: [],
};

describe("scoreAnswer", () => {
  it("scores t1/t2 through evaluateRound with DEDUCTION_REFERENCE_YEAR", () => {
    const p = parsed({ year: 1969, lat: 0.67408, lng: 23.47297, confidence: 0.9 });
    const s = scoreAnswer("t1", p, TRUTH);
    expect(s.error).toBeNull();
    expect(s.accuracy).toBe(100);
    expect(s.correct).toBe(true);
    expect(s.abstained).toBe(false);
    expect(s.brier).toBeCloseTo(0.01, 9);

    const expected = evaluateRound(
      TRUTH_EVENT,
      { year: 1969, location: { lat: 0.67408, lng: 23.47297 } },
      0,
      false,
      0,
      0,
      DEDUCTION_REFERENCE_YEAR
    );
    expect(s.accuracy).toBe(expected.roundAccuracy);

    const s2 = scoreAnswer("t2", p, TRUTH);
    expect(s2.accuracy).toBe(100);
  });

  it("honours the injected reference year", () => {
    const p = parsed({ year: 1900 });
    const atRef = scoreAnswer("t1", p, TRUTH);
    const atOther = scoreAnswer("t1", p, TRUTH, 2000);
    expect(atRef.accuracy).not.toBe(atOther.accuracy);
    const expected = evaluateRound(
      TRUTH_EVENT,
      { year: 1900, location: null },
      0,
      false,
      0,
      0,
      DEDUCTION_REFERENCE_YEAR
    );
    expect(atRef.accuracy).toBe(expected.roundAccuracy);
  });

  it("scores t3/t4 as exact match on the option id", () => {
    const T3_OPTIONS = ["a", "b", "c", "d", "e"];
    const right = scoreAnswer("t3", parsed({ choice: "c", confidence: 0.7 }, T3_OPTIONS), TRUTH);
    expect(right.accuracy).toBe(100);
    expect(right.correct).toBe(true);
    expect(right.brier).toBeCloseTo(0.09, 9);

    const wrong = scoreAnswer("t3", parsed({ choice: "a", confidence: 0.7 }, T3_OPTIONS), TRUTH);
    expect(wrong.accuracy).toBe(0);
    expect(wrong.correct).toBe(false);
    expect(wrong.brier).toBeCloseTo(0.49, 9);

    const t4 = scoreAnswer("t4", parsed({ choice: "c" }, ["a", "b", "c", "d"]), TRUTH);
    expect(t4.accuracy).toBe(100);
    expect(t4.correct).toBe(true);
  });

  it("scores abstain as 0 accuracy, flagged separately", () => {
    const s = scoreAnswer("t1", parsed({ abstain: true, confidence: 0.9, year: 1969 }), TRUTH);
    expect(s.accuracy).toBe(0);
    expect(s.abstained).toBe(true);
    expect(s.correct).toBe(false);
    expect(s.brier).toBeCloseTo(0.81, 9);
  });

  it("passes parse failures through as 0 accuracy with the error", () => {
    const bad = parseDeductionAnswer('{"year":');
    const s = scoreAnswer("t1", bad, TRUTH);
    expect(s.accuracy).toBe(0);
    expect(s.error).toContain("Failed to parse AI deduction response:");
  });
});

describe("brier", () => {
  it("computes (confidence - outcome)^2 on known pairs", () => {
    expect(brier(0.8, 1)).toBeCloseTo(0.04, 9);
    expect(brier(0.2, 1)).toBeCloseTo(0.64, 9);
    expect(brier(1, 0)).toBe(1);
    expect(brier(0, 0)).toBe(0);
    expect(brier(0.5, 1)).toBeCloseTo(0.25, 9);
  });
});

describe("aggregateDeductionScores", () => {
  it("aggregates count, abstentions, mean accuracy/brier and correct rate", () => {
    const scores = [
      scoreAnswer("t1", parsed({ year: 1969, lat: 0.67408, lng: 23.47297, confidence: 0.9 }), TRUTH),
      scoreAnswer("t1", parsed({ abstain: true, confidence: 0.5 }), TRUTH),
      scoreAnswer("t3", parsed({ choice: "a", confidence: 0.4 }, ["a", "b", "c", "d", "e"]), TRUTH),
    ];
    const agg = aggregateDeductionScores(scores);
    expect(agg.count).toBe(3);
    expect(agg.abstained).toBe(1);
    expect(agg.meanAccuracy).toBeCloseTo((100 + 0 + 0) / 3, 9);
    expect(agg.meanBrier).toBeCloseTo((0.01 + 0.25 + 0.16) / 3, 9);
    expect(agg.correctRate).toBeCloseTo(1 / 3, 9);
    expect(aggregateDeductionScores([])).toEqual({
      count: 0,
      abstained: 0,
      meanAccuracy: null,
      meanBrier: null,
      correctRate: null,
    });
  });
});

describe("summarizeLadder", () => {
  it("splits steps 1-2 (deduction) from 3-5 (extraction) and finds first >=90", () => {
    const s = summarizeLadder([
      { step: 1, roundAccuracy: 80, brier: 0.2 },
      { step: 2, roundAccuracy: 90, brier: 0.1 },
      { step: 3, roundAccuracy: 95, brier: 0.05 },
      { step: 4, roundAccuracy: 95, brier: 0.05 },
      { step: 5, roundAccuracy: 96, brier: 0.04 },
    ]);
    expect(s.deduction).toBeCloseTo(85, 9);
    expect(s.extraction).toBeCloseTo(286 / 3, 9);
    expect(s.firstStepAt90).toBe(2);
    expect(s.brier).toBeCloseTo(0.088, 9);
  });

  it("averages per-step means before banding and tolerates empty input", () => {
    const s = summarizeLadder([
      { step: 1, roundAccuracy: 80 },
      { step: 1, roundAccuracy: 100 },
      { step: 3, roundAccuracy: 50 },
    ]);
    expect(s.deduction).toBeCloseTo(90, 9);
    expect(s.extraction).toBe(50);
    expect(s.firstStepAt90).toBe(1);
    expect(s.brier).toBeNull();
    expect(summarizeLadder([])).toEqual({
      deduction: null,
      extraction: null,
      firstStepAt90: null,
      brier: null,
    });
  });
});

// ---------------------------------------------------------------------------
// AIP-BUILD-DEDUCTFIX-1109-023 — answer-position distribution proofs.
// ---------------------------------------------------------------------------

/** Deterministic synthetic pool: 48 same-continent events, unique titles, full scrub context + hints. */
function synthPool(): DeductionPoolEvent[] {
  return Array.from({ length: 48 }, (_, i) => ({
    id: `syn-${i}`,
    title: `Synthetic Event ${i}`,
    year: 1900 + ((i * 37) % 110),
    continent: "Europe",
    displayName: `City${i}, Country${i}`,
    country: `Country${i}`,
    hints: [
      { tier: 3, type: "when", content: `When clue alpha ${i}` },
      { tier: 3, type: "when", content: `When clue beta ${i}` },
      { tier: 4, type: "where", content: `Where clue gamma ${i}` },
      { tier: 4, type: "where", content: `Where clue delta ${i}` },
    ],
  }));
}
const SYN_POOL = synthPool();
const T4_DIST_SLOT = { tier: 3, type: "when" };

function letterCounts(letters: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of letters) out[l] = (out[l] ?? 0) + 1;
  return out;
}

describe("answer-position distribution", () => {
  it("T3 answerId letters stay within 15-25% over >=2000 (event,salt) pairs", () => {
    const letters: string[] = [];
    for (let i = 0; i < 2200; i++) {
      const event = SYN_POOL[i % SYN_POOL.length];
      const r = buildT3Item(event, SYN_POOL, `audit-${i}`);
      if (!r.ok) throw new Error(`unexpected T3 failure: ${JSON.stringify(r)}`);
      letters.push(r.answerId);
    }
    const counts = letterCounts(letters);
    console.log("T3 answerId distribution (n=%d):", letters.length, counts);
    for (const L of ["a", "b", "c", "d", "e"]) {
      const pct = (counts[L] ?? 0) / letters.length;
      expect(pct).toBeGreaterThanOrEqual(0.15);
      expect(pct).toBeLessThanOrEqual(0.25);
    }
  });

  it("T4 answerId letters stay within 20-30% over >=2000 pairs", () => {
    const letters: string[] = [];
    for (let i = 0; i < 2200; i++) {
      const event = SYN_POOL[i % SYN_POOL.length];
      const r = buildT4Item(event, SYN_POOL, T4_DIST_SLOT, `audit-${i}`);
      if (!r.ok) throw new Error(`unexpected T4 failure: ${JSON.stringify(r)}`);
      letters.push(r.answerId);
    }
    const counts = letterCounts(letters);
    console.log("T4 answerId distribution (n=%d):", letters.length, counts);
    for (const L of ["a", "b", "c", "d"]) {
      const pct = (counts[L] ?? 0) / letters.length;
      expect(pct).toBeGreaterThanOrEqual(0.2);
      expect(pct).toBeLessThanOrEqual(0.3);
    }
  });

  it("same inputs twice produce deep-equal results (T3 and T4)", () => {
    const event = SYN_POOL[7];
    expect(buildT3Item(event, SYN_POOL, "same-salt")).toEqual(
      buildT3Item(event, SYN_POOL, "same-salt")
    );
    expect(buildT4Item(event, SYN_POOL, T4_DIST_SLOT, "same-salt")).toEqual(
      buildT4Item(event, SYN_POOL, T4_DIST_SLOT, "same-salt")
    );
  });

  it("changing only the salt changes T3 answerId for ~80% of a 200-event sample", () => {
    let changed = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const event = SYN_POOL[i % SYN_POOL.length];
      const a = buildT3Item(event, SYN_POOL, "salt-A");
      const b = buildT3Item(event, SYN_POOL, "salt-B");
      if (!a.ok || !b.ok) continue;
      total++;
      if (a.answerId !== b.answerId) changed++;
    }
    const rate = changed / total;
    console.log(`T3 salt-flip rate: ${changed}/${total} = ${rate.toFixed(3)}`);
    expect(rate).toBeGreaterThanOrEqual(0.6);
    expect(rate).toBeLessThanOrEqual(0.95);
  });
});
