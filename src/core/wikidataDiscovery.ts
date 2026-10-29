// GEN-BUILD-DISCOVER-1028-001
// Pure Wikidata discovery logic for the generation pipeline: SPARQL query
// building for the Wikidata Query Service and mapping of SPARQL binding
// rows into generation_candidates rows. No I/O, no network, no env —
// the runner (scripts/generation/discover-wikidata.ts) owns all HTTP/DB.
//
// Reuses parseWikidataTime (BCE convention: Wikidata -N = N BCE, year 0
// rejected) and the fingerprint builder — single source of truth each.

import { buildDedupeFingerprint } from "./candidateFingerprint";
import { parseWikidataTime } from "./wikidataMatch";

// ─────────────────────────────────────────────────────────────────────────────
// CLASS_GROUPS — ONE exported constant, the only class table. QIDs verified
// via wbgetentities/wbsearchentities on 2026-10-28 (English labels checked,
// several memory candidates were wrong and corrected).
// ─────────────────────────────────────────────────────────────────────────────

export type ClassGroup = {
  /** Group key accepted by --classes <csv>. */
  name: string;
  /** Verified English label(s) for documentation/reporting. */
  label: string;
  qids: readonly string[];
};

export const CLASS_GROUPS: readonly ClassGroup[] = [
  { name: "battle", label: "battle", qids: ["Q178561"] },
  { name: "treaty", label: "treaty", qids: ["Q131569"] },
  { name: "siege", label: "siege", qids: ["Q188055"] },
  { name: "revolution", label: "revolution", qids: ["Q10931"] },
  { name: "coronation", label: "coronation + inauguration", qids: ["Q209715", "Q1417098"] },
  { name: "assassination", label: "assassination", qids: ["Q3882219"] },
  { name: "expedition", label: "expedition", qids: ["Q2401485"] },
  { name: "disaster", label: "disaster + earthquake + volcanic eruption", qids: ["Q3839081", "Q7944", "Q7692360"] },
  { name: "conference", label: "peace conference", qids: ["Q7157512"] },
  { name: "founding", label: "founding + city founding", qids: ["Q3075355", "Q116181743"] },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Era buckets — fixed century/millennium partition of the year line.
//   year >= 1        -> "c<N>"          N = ceil(year/100)   (1..100 -> c1)
//   -999..-1         -> "bce<N>c"       N = ceil(-year/100)  (-100..-1 -> bce1c)
//   year <= -1000    -> "bce<N>m"       N = ceil(-year/1000) (-2000..-1001 -> bce2m)
//   year 0 / null    -> "unknown"       (never emitted by eraWindows)
// ─────────────────────────────────────────────────────────────────────────────

export function eraLabelForYear(year: number | null): string {
  if (year == null || year === 0) return "unknown";
  if (year <= -1000) return `bce${Math.floor((-year - 1) / 1000) + 1}m`;
  if (year < 0) return `bce${Math.floor((-year - 1) / 100) + 1}c`;
  return `c${Math.floor((year - 1) / 100) + 1}`;
}

export type EraWindow = { era: string; yearMin: number; yearMax: number };

/**
 * eraWindows — contiguous partition of [yearMin, yearMax] aligned to era
 * bucket boundaries. Used by the runner to split WDQS queries before the
 * 60 s timeout bites, and by the report's class x era count table.
 */
export function eraWindows(yearMin: number, yearMax: number): EraWindow[] {
  const out: EraWindow[] = [];
  let y = yearMin;
  while (y <= yearMax) {
    const era = eraLabelForYear(y);
    let end: number;
    if (era.endsWith("m")) {
      const m = Number(era.slice(3, -1));
      // Millennium buckets only cover year <= -1000; cap there so the
      // partition cannot overlap the BCE-century range.
      end = Math.min(-(m - 1) * 1000 - 1, -1000);
    } else if (era.startsWith("bce")) {
      const c = Number(era.slice(3, -1));
      end = -(c - 1) * 100 - 1;
    } else if (era === "unknown") {
      end = 0; // the year-0 gap between -1 and 1
    } else {
      const c = Number(era.slice(1));
      end = c * 100;
    }
    const wMax = Math.min(end, yearMax);
    if (era !== "unknown") out.push({ era, yearMin: y, yearMax: wMax });
    y = wMax + 1;
  }
  return out;
}

/**
 * regionLabel — coarse 10-degree lat/lon cell label, no external geocoder.
 * e.g. 41.9/12.5 -> "N40_E10"; -33.9/151.2 -> "S40_E150"; nulls -> "unknown".
 */
export function regionLabel(lat: number | null, lon: number | null): string {
  if (lat == null || lon == null) return "unknown";
  const la = Math.floor(lat / 10) * 10;
  const lo = Math.floor(lon / 10) * 10;
  const ns = la >= 0 ? `N${la}` : `S${-la}`;
  const ew = lo >= 0 ? `E${lo}` : `W${-lo}`;
  return `${ns}_${ew}`;
}

export type QuotaBucket = { era: string; class: string; region: string };

export function quotaBucket(input: {
  year: number | null;
  classGroup: string;
  lat: number | null;
  lon: number | null;
}): QuotaBucket {
  return {
    era: eraLabelForYear(input.year),
    class: input.classGroup,
    region: regionLabel(input.lat, input.lon),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDiscoveryQuery — SPARQL for the Wikidata Query Service selecting items
// that are instance-of (P31/P279*) the given class QIDs, with a point in time
// P585 or start time P580 at date precision >= year (wikibase:timePrecision
// >= 9), optional coordinates (P625 direct or via P276 -> P625), and a
// sitelinks floor. Returns qid, en label, date, precision, lat/lon, coord
// source, sitelinks and the item's full P31 list.
// ─────────────────────────────────────────────────────────────────────────────

export function buildDiscoveryQuery(input: {
  classQids: readonly string[];
  yearMin: number;
  yearMax: number;
  minSitelinks: number;
  limit: number;
  offset: number;
}): string {
  const { classQids, yearMin, yearMax, minSitelinks, limit, offset } = input;
  const values = classQids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?item ?itemLabel ?date ?precision ?lat ?lon ?coordSource ?sitelinks
  (GROUP_CONCAT(DISTINCT ?p31; separator=",") AS ?p31s)
WHERE {
  VALUES ?classQid { ${values} }
  ?item wdt:P31/wdt:P279* ?classQid .
  {
    ?item p:P585 ?dateStmt .
    ?dateStmt psv:P585 ?dateNode .
    ?dateNode wikibase:timeValue ?date ;
              wikibase:timePrecision ?precision .
  } UNION {
    ?item p:P580 ?dateStmt .
    ?dateStmt psv:P580 ?dateNode .
    ?dateNode wikibase:timeValue ?date ;
              wikibase:timePrecision ?precision .
  }
  FILTER(?precision >= 9)
  FILTER(YEAR(?date) >= ${yearMin} && YEAR(?date) <= ${yearMax})
  OPTIONAL {
    {
      ?item p:P625 ?coordStmt .
      ?coordStmt psv:P625 ?coordNode .
      ?coordNode wikibase:geoLatitude ?lat ;
                 wikibase:geoLongitude ?lon .
      BIND("P625" AS ?coordSource)
    } UNION {
      ?item wdt:P276 ?loc .
      ?loc p:P625 ?coordStmt .
      ?coordStmt psv:P625 ?coordNode .
      ?coordNode wikibase:geoLatitude ?lat ;
                 wikibase:geoLongitude ?lon .
      BIND("P276" AS ?coordSource)
    }
  }
  OPTIONAL { ?item wdt:P31 ?p31 . }
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  # label service is evaluated last on the surviving bindings — a raw
  # rdfs:label pattern here makes Blazegraph drive the query on labels.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?date ?precision ?lat ?lon ?coordSource ?sitelinks
ORDER BY DESC(?sitelinks) ?item
LIMIT ${limit}
OFFSET ${offset}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// wdqsLiteralToJsonTime — WDQS serializes xsd:dateTime in ASTRONOMICAL year
// numbering (53 BC -> "-0052-...", 1 BC -> "0000-..."), while the JSON/Action
// API form that parseWikidataTime expects uses -N for N BC and has no year 0
// (53 BC -> "-0053-...", 1 BC -> "-0001-..."). This converts the WDQS literal
// to the JSON form before it reaches parseWikidataTime: signed year <= 0 ->
// year - 1; year >= 1 and unparseable input pass through unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export function wdqsLiteralToJsonTime(lit: string): string {
  const m = /^([+-]?)(\d+)-\d{2}-\d{2}T/.exec(lit);
  if (!m) return lit;
  const magnitude = parseInt(m[2], 10);
  if (!Number.isFinite(magnitude)) return lit;
  const year = m[1] === "-" ? -magnitude : magnitude;
  if (year >= 1) return lit;
  const jsonYear = year - 1;
  return `-${String(-jsonYear).padStart(m[2].length, "0")}${lit.slice(m[1].length + m[2].length)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// mapBindingToCandidate — one SPARQL binding row -> generation_candidates row
// shape. Reject reasons are explicit so the runner can count them.
// ─────────────────────────────────────────────────────────────────────────────

export type SparqlBindingValue = { type: string; value: string };

export type DiscoveryBinding = {
  item?: SparqlBindingValue;
  itemLabel?: SparqlBindingValue;
  date?: SparqlBindingValue;
  precision?: SparqlBindingValue;
  lat?: SparqlBindingValue;
  lon?: SparqlBindingValue;
  coordSource?: SparqlBindingValue;
  sitelinks?: SparqlBindingValue;
  p31s?: SparqlBindingValue;
};

export type MappedCandidate = {
  status: "new";
  wikidata_qid: string;
  wd_label: string;
  event_year: number;
  event_date: string;
  date_precision: number;
  latitude: number | null;
  longitude: number | null;
  coord_source: "P625" | "P276" | null;
  p31: string[];
  sitelinks: number;
  real_event: true;
  dedupe_fingerprint: string;
  source_citations: Array<{ type: "wikidata"; qid: string; url: string }>;
  quota_bucket: QuotaBucket;
  title: string;
};

export type MapRejectReason =
  | "bad_qid"
  | "missing_label"
  | "null_year"
  | "precision_below_year"
  | "year_out_of_range"
  | "no_coords";

export type MapResult =
  | { ok: true; candidate: MappedCandidate }
  | { ok: false; reason: MapRejectReason; qid: string | null };

export function mapBindingToCandidate(
  row: DiscoveryBinding,
  ctx: { classGroup: string; yearMin: number; yearMax: number }
): MapResult {
  const itemUri = row.item?.value ?? "";
  const qidMatch = /(Q\d+)$/.exec(itemUri);
  const qid = qidMatch ? qidMatch[1] : itemUri;
  if (!/^Q\d+$/.test(qid)) return { ok: false, reason: "bad_qid", qid: null };

  const label = row.itemLabel?.value?.trim();
  // The label service falls back to the qid string when no en label exists —
  // a qid-shaped label is treated as missing, never stored as wd_label.
  if (!label || label === qid) return { ok: false, reason: "missing_label", qid };

  // WDQS literals are astronomical-numbered; convert to the JSON form once —
  // the raw literal is never fed to parseWikidataTime or stored as event_date.
  const jsonTime =
    row.date?.value == null ? undefined : wdqsLiteralToJsonTime(row.date.value);
  const parsed = parseWikidataTime({
    time: jsonTime,
    precision: row.precision == null ? undefined : Number(row.precision.value),
  });
  if (!parsed) return { ok: false, reason: "null_year", qid };
  if (parsed.precision < 9) return { ok: false, reason: "precision_below_year", qid };
  if (parsed.year < ctx.yearMin || parsed.year > ctx.yearMax) {
    return { ok: false, reason: "year_out_of_range", qid };
  }

  const lat = row.lat == null ? null : Number(row.lat.value);
  const lon = row.lon == null ? null : Number(row.lon.value);
  const coordSourceRaw = row.coordSource?.value;
  const coord_source =
    coordSourceRaw === "P625" || coordSourceRaw === "P276" ? coordSourceRaw : null;
  if (
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    coord_source == null
  ) {
    return { ok: false, reason: "no_coords", qid };
  }

  const sitelinks = row.sitelinks == null ? 0 : Number(row.sitelinks.value);
  const p31 = (row.p31s?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^Q\d+$/.test(s));
  // Date text: strip leading "+" and the time-of-day tail, keep BCE sign.
  const event_date = (jsonTime ?? "").replace(/^\+/, "").replace(/T.*$/, "");
  const quota_bucket = quotaBucket({ year: parsed.year, classGroup: ctx.classGroup, lat, lon });

  return {
    ok: true,
    candidate: {
      status: "new",
      wikidata_qid: qid,
      wd_label: label,
      event_year: parsed.year,
      event_date,
      date_precision: parsed.precision,
      latitude: lat,
      longitude: lon,
      coord_source,
      p31,
      sitelinks: Number.isFinite(sitelinks) ? sitelinks : 0,
      real_event: true,
      dedupe_fingerprint: buildDedupeFingerprint({ title: label, year: parsed.year, lat, lon }),
      source_citations: [
        { type: "wikidata", qid, url: `https://www.wikidata.org/wiki/${qid}` },
      ],
      quota_bucket,
      title: label,
    },
  };
}
