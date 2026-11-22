// EDQ-BUILD-WDHARVEST-1122-801
// Pure fact-lock gates G1-G5 for the Wikidata-first candidate harvester.
// No I/O: every input (Wikidata entities, Wikipedia lead extracts, the
// Nominatim reverse-geocode result) is fetched by the runner
// (scripts/generation/harvest-wikidata.ts) and passed in already resolved.
// An LLM never supplies a fact — every gate verdict is derived only from
// Wikidata claims, Wikipedia lead text and the OSM reverse geocode.
//
// Gate summary (CTO spec):
//   G1 notability/class  — P31 inside the allowed event-class set, no
//                          fictional-entity class, sitelinks >= threshold
//                          (MIN_SITELINKS, or MIN_SITELINKS_RELAXED for the
//                          eras BCE / 0-999 / 1000-1499 only), enwiki sitelink.
//   G2 date              — exactly one usable (non-deprecated) P585 or P580
//                          claim, precision >= MIN_DATE_PRECISION, span to any
//                          P582 end <= MAX_DATE_SPAN_YEARS. BCE via
//                          parseWikidataTime (Wikidata -N == N BCE).
//   G3 date support      — the year string appears in the en.wikipedia lead
//                          extract AND in >= MIN_LANG_AGREEMENT leads among
//                          {de,fr,es,ru,zh,pt,it,ja} that exist.
//   G4 location          — coordinates from P625 on the item, else from its
//                          P276 location item (one hop), else reject.
//   G5 location independence — Nominatim REVERSE geocode of those coordinates
//                          must return a country whose ISO-3166 alpha-2 equals
//                          the item's (or its P276 item's) P17 country ISO
//                          (P297). Historical (defunct) countries fall back to
//                          the modern country of the P276/P131 place. The place
//                          NAME is never geocoded (that would be circular).

import { extractCoords, parseWikidataTime } from "./wikidataMatch";
import type { WdEntity } from "./wikidataMatch";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — single source of truth for the fact-lock thresholds.
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_SITELINKS = 40;
export const MIN_SITELINKS_RELAXED = 25;
export const MAX_DATE_SPAN_YEARS = 1;
export const MIN_DATE_PRECISION = 9;
export const MIN_LANG_AGREEMENT = 2;

/** The 7 stratification eras, youngest-negative first. */
export const ERA_BUCKETS = [
  "BCE",
  "0-999",
  "1000-1499",
  "1500-1799",
  "1800-1899",
  "1900-1949",
  "1950+",
] as const;
export type EraBucket = (typeof ERA_BUCKETS)[number];

/** Only these eras may use MIN_SITELINKS_RELAXED (spec: BCE, 0-999, 1000-1499). */
export const RELAXED_SITELINK_ERAS: ReadonlySet<string> = new Set([
  "BCE",
  "0-999",
  "1000-1499",
]);

/** Non-English Wikipedia languages counted by G3 ("those that exist"). */
export const SUPPORT_LANGS = ["de", "fr", "es", "ru", "zh", "pt", "it", "ja"] as const;

/** Maps an event year (Wikidata convention: negative == BCE) to its era bucket. */
export function eraForYear(year: number): EraBucket {
  if (year < 0) return "BCE";
  if (year <= 999) return "0-999";
  if (year <= 1499) return "1000-1499";
  if (year <= 1799) return "1500-1799";
  if (year <= 1899) return "1800-1899";
  if (year <= 1949) return "1900-1949";
  return "1950+";
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GateVerdict = { ok: boolean; reason: string | null };

export type FactLockInput = {
  /** The candidate Wikidata item (claims, labels, sitelinks). */
  entity: WdEntity;
  /**
   * Already-fetched entities needed for lookups, keyed by QID: P17 country
   * items (P297/P576/P582), P276 location items (P625/P17/P131), P131 admin
   * items and their P17 countries. The runner owns all fetching.
   */
  related?: Record<string, WdEntity>;
  /** Allowed event-class QIDs — the item's P31 must intersect this set (G1). */
  eventClasses: ReadonlySet<string>;
  /** Fictional/mythological entity classes — any P31 hit fails G1. */
  fictionalClasses?: ReadonlySet<string>;
  /**
   * Era bucket used for the sitelinks threshold when G2 yields no year
   * (e.g. the harvest query era). When a year IS resolved, eraForYear(year)
   * wins — the threshold always follows the item's own date.
   */
  era?: string;
  /** Wikipedia lead extracts keyed by language ("en","de",...). Missing/empty = does not exist. */
  extracts?: Record<string, string | null>;
  /** Nominatim reverse-geocode result for the G4 coordinates (never a place name). */
  reverseGeocode?: { countryCode: string | null; displayName?: string | null } | null;
};

export type FactLockResult = {
  pass: boolean;
  gates: {
    G1: GateVerdict;
    G2: GateVerdict;
    G3: GateVerdict;
    G4: GateVerdict;
    G5: GateVerdict;
  };
  year: number | null;
  coords: { lat: number; lon: number } | null;
  coord_source: "P625" | "P276" | null;
  era: EraBucket | null;
  sitelinks: number;
  p31: string[];
  /** Languages (en + support set) whose lead extract contained the year. */
  langsAgreed: string[];
  date_prop: "P585" | "P580" | null;
  date_time: string | null;
  date_precision: number | null;
  span_years: number | null;
  stated_country_isos: string[];
  place_country_isos: string[];
  reverse_country_code: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Claim helpers — WdSnak in wikidataMatch.ts does not declare `rank`, so the
// Action-API shape is widened locally. Deprecated-rank claims never count.
// ─────────────────────────────────────────────────────────────────────────────

type Snak = {
  rank?: unknown;
  mainsnak?: { datavalue?: { value?: unknown; type?: string } };
};

function snaksOf(entity: WdEntity | undefined, prop: string): Snak[] {
  if (!entity) return [];
  return (entity.claims?.[prop] ?? []) as unknown as Snak[];
}

function isDeprecated(s: Snak): boolean {
  return s.rank === "deprecated";
}

function snakValue(s: Snak): unknown {
  return s.mainsnak?.datavalue?.value;
}

/** Non-deprecated claim target QIDs for a property (P31/P17/P276/P131/...). */
function itemIds(entity: WdEntity | undefined, prop: string): string[] {
  const out: string[] = [];
  for (const s of snaksOf(entity, prop)) {
    if (isDeprecated(s)) continue;
    const v = snakValue(s);
    const id =
      v != null && typeof v === "object" ? (v as { id?: unknown }).id : undefined;
    if (typeof id === "string" && id.length > 0) out.push(id);
  }
  return out;
}

/** First non-deprecated string datavalue for a property (e.g. P297 ISO code). */
function stringValue(entity: WdEntity | undefined, prop: string): string | null {
  for (const s of snaksOf(entity, prop)) {
    if (isDeprecated(s)) continue;
    const v = snakValue(s);
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// G2 date scan — exactly one usable (non-deprecated, parseable) P585|P580
// claim; span to any non-deprecated P582 end must stay <= MAX_DATE_SPAN_YEARS.
// ─────────────────────────────────────────────────────────────────────────────

type UsableDateClaim = {
  prop: "P585" | "P580";
  time: string;
  year: number;
  precision: number;
};

type DateScan = {
  usableCount: number;
  claim: UsableDateClaim | null;
  spanYears: number | null;
};

function scanDateClaim(entity: WdEntity): DateScan {
  const usable: UsableDateClaim[] = [];
  for (const prop of ["P585", "P580"] as const) {
    for (const s of snaksOf(entity, prop)) {
      if (isDeprecated(s)) continue;
      const v = snakValue(s);
      const parsed = parseWikidataTime(
        v != null && typeof v === "object"
          ? (v as { time?: unknown; precision?: unknown })
          : null
      );
      if (!parsed) continue;
      usable.push({
        prop,
        time: (v as { time: string }).time,
        year: parsed.year,
        precision: parsed.precision,
      });
    }
  }
  const claim = usable.length === 1 ? usable[0] : null;
  let spanYears: number | null = null;
  if (claim) {
    const endYears: number[] = [];
    for (const s of snaksOf(entity, "P582")) {
      if (isDeprecated(s)) continue;
      const parsed = parseWikidataTime(
        snakValue(s) != null && typeof snakValue(s) === "object"
          ? (snakValue(s) as { time?: unknown; precision?: unknown })
          : null
      );
      if (parsed) endYears.push(parsed.year);
    }
    spanYears = endYears.length
      ? Math.max(...endYears.map((e) => Math.abs(e - claim.year)))
      : 0;
  }
  return { usableCount: usable.length, claim, spanYears };
}

// ─────────────────────────────────────────────────────────────────────────────
// G3 date support — year-string matching in Wikipedia lead extracts.
// ─────────────────────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Surface forms of the year that may appear in prose. CE years match their
 * decimal string; BCE years (Wikidata -N == N BCE) match "N BC"/"N BCE" forms.
 */
export function yearNeedles(year: number): string[] {
  if (year > 0) return [String(year)];
  const a = Math.abs(year);
  return [`${a} BC`, `${a} BCE`, `${a}BC`, `${a}BCE`];
}

/** True when `text` contains the year as a standalone token (digit-bounded). */
export function containsYear(text: string, year: number): boolean {
  const normalized = text.replace(/[\u00A0\u202F\u2009]/g, " ");
  for (const needle of yearNeedles(year)) {
    const re = new RegExp(`(?<![0-9])${escapeRe(needle)}(?![0-9])`);
    if (re.test(normalized)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// G5 location independence — country ISO helpers.
// ─────────────────────────────────────────────────────────────────────────────

/** ISO-3166 alpha-2 (P297) of a country item, uppercased; null when absent. */
function countryIso(entity: WdEntity | undefined): string | null {
  const v = stringValue(entity, "P297");
  return v ? v.toUpperCase() : null;
}

/** ISO codes of every country targeted by the entity's non-deprecated P17. */
function p17Isos(entity: WdEntity | undefined, related: Record<string, WdEntity>): string[] {
  const out = new Set<string>();
  for (const id of itemIds(entity, "P17")) {
    const iso = countryIso(related[id]);
    if (iso) out.add(iso);
  }
  return [...out];
}

/**
 * A country "no longer exists" when its item carries a dissolution/end claim
 * (P576 dissolved / P582 end time) or has no current P297 ISO code at all.
 */
function countryDefunct(entity: WdEntity | undefined): boolean {
  if (!entity) return false;
  const hasEnd =
    snaksOf(entity, "P576").some((s) => !isDeprecated(s)) ||
    snaksOf(entity, "P582").some((s) => !isDeprecated(s));
  return hasEnd || countryIso(entity) == null;
}

/**
 * Modern-country ISO set of the "P276/P131 place": for each P276 location item
 * its own P17 country and each of its P131 admin parents' P17 country, plus the
 * item's own P131 admin parents' P17 country. Used only by the G5 historical /
 * unstated-country fallback — never by geocoding a place name.
 */
function placeCountryIsos(
  entity: WdEntity,
  related: Record<string, WdEntity>
): string[] {
  const out = new Set<string>();
  const addAdminCountry = (admin: WdEntity | undefined) => {
    if (!admin) return;
    for (const cid of itemIds(admin, "P17")) {
      const iso = countryIso(related[cid]);
      if (iso) out.add(iso);
    }
  };
  const addPlace = (place: WdEntity | undefined) => {
    if (!place) return;
    for (const iso of p17Isos(place, related)) out.add(iso);
    for (const aid of itemIds(place, "P131")) addAdminCountry(related[aid]);
  };
  for (const pid of itemIds(entity, "P276")) addPlace(related[pid]);
  for (const aid of itemIds(entity, "P131")) addAdminCountry(related[aid]);
  return [...out].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// certifyFacts — runs G1..G5 over the supplied inputs and returns the verdict.
// ─────────────────────────────────────────────────────────────────────────────

export function certifyFacts(input: FactLockInput): FactLockResult {
  const entity = input.entity;
  const related = input.related ?? {};
  const fictionalClasses = input.fictionalClasses ?? new Set<string>();
  const extracts = input.extracts ?? {};
  const reverseGeocode = input.reverseGeocode ?? null;

  // Date scan first: G2's year also fixes the era used by G1's sitelinks
  // threshold (the threshold always follows the item's own date).
  const scan = scanDateClaim(entity);
  const year = scan.claim?.year ?? null;
  const era = (
    year != null ? eraForYear(year) : (input.era ?? "")
  ) as EraBucket | "";

  const sitelinks = entity.sitelinks ? Object.keys(entity.sitelinks).length : 0;
  const p31 = itemIds(entity, "P31");
  const coords = extractCoords(entity, related);
  const coord_source = coords?.source ?? null;

  // ── G1: notability / class ──
  let g1: GateVerdict;
  if (!p31.some((q) => input.eventClasses.has(q))) {
    g1 = { ok: false, reason: `p31_not_in_allowed_set:${p31.join("+") || "none"}` };
  } else if (p31.some((q) => fictionalClasses.has(q))) {
    g1 = {
      ok: false,
      reason: `fictional_class:${p31.filter((q) => fictionalClasses.has(q)).join("+")}`,
    };
  } else {
    const relaxed = RELAXED_SITELINK_ERAS.has(era);
    const threshold = relaxed ? MIN_SITELINKS_RELAXED : MIN_SITELINKS;
    if (sitelinks < threshold) {
      g1 = {
        ok: false,
        reason: `sitelinks_${sitelinks}_below_${threshold}${relaxed ? "_relaxed" : ""}`,
      };
    } else if (!entity.sitelinks || !("enwiki" in entity.sitelinks)) {
      g1 = { ok: false, reason: "no_en_sitelink" };
    } else {
      g1 = { ok: true, reason: null };
    }
  }

  // ── G2: date ──
  let g2: GateVerdict;
  if (scan.usableCount !== 1 || !scan.claim) {
    g2 = { ok: false, reason: `usable_p585_p580_claims_${scan.usableCount}_ne_1` };
  } else if (scan.claim.precision < MIN_DATE_PRECISION) {
    g2 = {
      ok: false,
      reason: `precision_${scan.claim.precision}_below_${MIN_DATE_PRECISION}`,
    };
  } else if (scan.spanYears != null && scan.spanYears > MAX_DATE_SPAN_YEARS) {
    g2 = {
      ok: false,
      reason: `date_span_${scan.spanYears}y_exceeds_${MAX_DATE_SPAN_YEARS}y`,
    };
  } else {
    g2 = { ok: true, reason: null };
  }

  // ── G3: date support in Wikipedia leads ──
  let g3: GateVerdict;
  const langsAgreed: string[] = [];
  if (year == null) {
    g3 = { ok: false, reason: "no_date_year" };
  } else {
    const en = extracts.en;
    const enOk = typeof en === "string" && en.trim().length > 0 && containsYear(en, year);
    if (typeof en !== "string" || en.trim().length === 0) {
      g3 = { ok: false, reason: "missing_en_extract" };
    } else if (!enOk) {
      g3 = { ok: false, reason: "en_extract_lacks_year" };
    } else {
      for (const lang of SUPPORT_LANGS) {
        const text = extracts[lang];
        if (typeof text === "string" && text.trim().length > 0 && containsYear(text, year)) {
          langsAgreed.push(lang);
        }
      }
      if (langsAgreed.length < MIN_LANG_AGREEMENT) {
        g3 = {
          ok: false,
          reason: `support_lang_agreement_${langsAgreed.length}_below_${MIN_LANG_AGREEMENT}`,
        };
      } else {
        g3 = { ok: true, reason: null };
      }
      langsAgreed.unshift("en");
    }
  }

  // ── G4: location ──
  const g4: GateVerdict = coords
    ? { ok: true, reason: null }
    : { ok: false, reason: "no_coordinates_P625_or_P276" };

  // ── G5: location independence ──
  let statedIsos: string[] = [];
  let placeIsos: string[] = [];
  let revIso: string | null = null;
  let g5: GateVerdict;
  if (!coords) {
    g5 = { ok: false, reason: "no_coords_from_G4" };
  } else {
    revIso = reverseGeocode?.countryCode
      ? reverseGeocode.countryCode.toUpperCase()
      : null;
    if (!revIso) {
      g5 = { ok: false, reason: "reverse_geocode_unavailable" };
    } else {
      const p276Ids = itemIds(entity, "P276");
      statedIsos = [
        ...new Set([
          ...p17Isos(entity, related),
          ...(coord_source === "P276"
            ? p276Ids.flatMap((id) => p17Isos(related[id], related))
            : []),
        ]),
      ].sort();
      placeIsos = placeCountryIsos(entity, related);

      if (statedIsos.includes(revIso)) {
        g5 = { ok: true, reason: null };
      } else {
        const p17Entities = itemIds(entity, "P17")
          .map((id) => related[id])
          .filter((e): e is WdEntity => e != null);
        const allStatedDefunct =
          p17Entities.length > 0 && p17Entities.every(countryDefunct);
        const statedEmpty = statedIsos.length === 0;
        if ((allStatedDefunct || statedEmpty) && placeIsos.includes(revIso)) {
          g5 = { ok: true, reason: null };
        } else if (allStatedDefunct || statedEmpty) {
          g5 = {
            ok: false,
            reason: `place_country_mismatch:reverse=${revIso} place=${placeIsos.join(",") || "none"}`,
          };
        } else {
          g5 = {
            ok: false,
            reason: `country_mismatch:reverse=${revIso} stated=${statedIsos.join(",")}`,
          };
        }
      }
    }
  }

  const pass = g1.ok && g2.ok && g3.ok && g4.ok && g5.ok;

  return {
    pass,
    gates: { G1: g1, G2: g2, G3: g3, G4: g4, G5: g5 },
    year,
    coords: coords ? { lat: coords.lat, lon: coords.lon } : null,
    coord_source,
    era: era === "" ? null : era,
    sitelinks,
    p31,
    langsAgreed,
    date_prop: scan.claim?.prop ?? null,
    date_time: scan.claim?.time ?? null,
    date_precision: scan.claim?.precision ?? null,
    span_years: scan.spanYears,
    stated_country_isos: statedIsos,
    place_country_isos: placeIsos,
    reverse_country_code: revIso,
  };
}
