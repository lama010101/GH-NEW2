// EDQ-BUILD-WIKIDATA-VERIFY-1026-001-A
// Pure Wikidata matching / verification logic. No I/O: every function takes
// already-fetched Wikidata structures and the stored event fields. The runner
// (scripts/event-quality/wikidata-verify.ts) owns all DB and HTTP access.

import { haversineDistanceKm } from "./rules";

// Threshold constants — single source of truth for this verification system.
// initial values, unvalidated — CTO tunes after dry run; do not change in
// code without CTO ruling.
export const YEAR_TOLERANCE = 1;
export const KM_VERIFIED = 50;
export const KM_REVIEW = 200;
export const MIN_MATCH_SCORE = 0.6;
export const MIN_MATCH_MARGIN = 0.15;

// ─────────────────────────────────────────────────────────────────────────────
// Minimal structural types for the Wikidata Action API shapes we consume.
// Only the fields the matcher reads are typed; everything else is ignored.
// ─────────────────────────────────────────────────────────────────────────────

export type WdTimeClaimValue = { time: string; precision: number };

export type WdSnak = {
  mainsnak?: { datavalue?: { value?: unknown; type?: string } };
};

export type WdEntity = {
  id?: string;
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  sitelinks?: Record<string, unknown>;
  claims?: Record<string, WdSnak[]>;
};

export type VerificationStatus =
  | "verified"
  | "review"
  | "mismatch"
  | "ambiguous"
  | "no_match"
  | "no_wd_date";

// ─────────────────────────────────────────────────────────────────────────────
// parseWikidataTime — Wikidata timevalue -> event-year integer.
//
// BCE CONVENTION (empirical, EDQ-BUILD-WIKIDATA-VERIFY-1026-001-A):
// Wikidata's JSON "time" field serializes BCE years as -(N) for N BCE — the
// SAME 1-based convention as events.event_year. Verified against three
// unambiguous events (Action API, 2026-10-27):
//   Battle of Carrhae (53 BC)      Q205887  P585 "-0053-06-09T00:00:00Z" p11
//   Assassination of Caesar (44BC) Q1025466 P585 "-0044-03-15T00:00:00Z" p11
//   Battle of Gaugamela (331 BC)   Q179670  P585 "-0331-10-01T00:00:00Z" p11
// and corroborated by Q827612 (Jugurthine War) P580 "-0111" / P582 "-0105".
// Therefore wdYear is used DIRECTLY: -N -> event_year -N. Serialized year 0
// is ambiguous under this convention and is rejected (null -> no_wd_date)
// rather than guessed.
// ─────────────────────────────────────────────────────────────────────────────

export function parseWikidataTime(
  v: { time?: unknown; precision?: unknown } | null | undefined
): { year: number; precision: number } | null {
  if (v == null) return null;
  const time = v.time;
  const precision = v.precision;
  if (typeof time !== "string") return null;
  if (typeof precision !== "number" || !Number.isFinite(precision)) return null;
  const m = /^([+-]?)(\d+)-\d{2}-\d{2}T/.exec(time);
  if (!m) return null;
  const magnitude = parseInt(m[2], 10);
  if (!Number.isFinite(magnitude)) return null;
  const wdYear = m[1] === "-" ? -magnitude : magnitude;
  if (wdYear === 0) return null; // serialized year 0 is ambiguous — never guess
  return { year: wdYear, precision };
}

// ─────────────────────────────────────────────────────────────────────────────
// extractEventDates — event-dating claims on a Wikidata item.
// Supported: P585 point in time (bounds both ends), P580 start time,
// P582 end time, P571 inception (bounds the start). Uses the earliest start
// and the latest end. `precision` is the COARSEST precision seen among all
// consumed claims (conservative: any sub-year-precision claim means we cannot
// compare at year granularity).
// ─────────────────────────────────────────────────────────────────────────────

export type WdDateRange = {
  yearStart: number;
  yearEnd: number;
  precision: number;
  /** Sorted list of supported properties that produced parseable dates. */
  props: string[];
};

const START_PROPS = ["P585", "P580", "P571"] as const;
const END_PROPS = ["P585", "P582"] as const;
export const EVENT_DATE_PROPS = ["P585", "P580", "P582", "P571"] as const;

function claimTimeValues(entity: WdEntity, prop: string): WdTimeClaimValue[] {
  const claims = entity.claims?.[prop] ?? [];
  const out: WdTimeClaimValue[] = [];
  for (const c of claims) {
    const v = c.mainsnak?.datavalue?.value;
    if (v != null && typeof v === "object" && "time" in v) {
      out.push(v as WdTimeClaimValue);
    }
  }
  return out;
}

export function extractEventDates(entity: WdEntity): WdDateRange | null {
  const starts: number[] = [];
  const ends: number[] = [];
  const usedProps = new Set<string>();
  let coarsest = Number.POSITIVE_INFINITY;
  const consume = (prop: string, into: number[]) => {
    for (const tv of claimTimeValues(entity, prop)) {
      const p = parseWikidataTime(tv);
      if (!p) continue;
      into.push(p.year);
      usedProps.add(prop);
      if (p.precision < coarsest) coarsest = p.precision;
    }
  };
  for (const prop of START_PROPS) consume(prop, starts);
  for (const prop of END_PROPS) consume(prop, ends);
  if (starts.length === 0 && ends.length === 0) return null;
  const yearEnd = ends.length > 0 ? Math.max(...ends) : Math.min(...starts);
  const yearStart = starts.length > 0 ? Math.min(...starts) : yearEnd;
  return {
    yearStart,
    yearEnd,
    precision: coarsest,
    props: [...usedProps].sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// extractCoords — P625 coordinate location on the item; if absent, P625 of the
// item's P276 (location) entity — ONE hop max, looked up in the caller-provided
// entity map (the runner fetches them in a single batch). Else null.
// ─────────────────────────────────────────────────────────────────────────────

export type WdCoords = { lat: number; lon: number; source: "P625" | "P276" };

function coordFromEntity(entity: WdEntity): { lat: number; lon: number } | null {
  for (const c of entity.claims?.P625 ?? []) {
    const v = c.mainsnak?.datavalue?.value;
    if (v != null && typeof v === "object") {
      const lat = (v as { latitude?: unknown }).latitude;
      const lon = (v as { longitude?: unknown }).longitude;
      if (
        typeof lat === "number" &&
        Number.isFinite(lat) &&
        typeof lon === "number" &&
        Number.isFinite(lon)
      ) {
        return { lat, lon };
      }
    }
  }
  return null;
}

export function extractCoords(
  entity: WdEntity,
  p276Entities: Record<string, WdEntity>
): WdCoords | null {
  const direct = coordFromEntity(entity);
  if (direct) return { ...direct, source: "P625" };
  for (const c of entity.claims?.P276 ?? []) {
    const v = c.mainsnak?.datavalue?.value;
    const id =
      v != null && typeof v === "object"
        ? (v as { id?: unknown }).id
        : undefined;
    if (typeof id !== "string") continue;
    const loc = p276Entities[id];
    if (!loc) continue;
    const viaLoc = coordFromEntity(loc);
    if (viaLoc) return { ...viaLoc, source: "P276" };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalization + scoring. Selection may use ONLY normalized label/alias
// similarity to the cleaned title, the event-like structural filter, and the
// sitelink count as tie-break. Stored event year/coordinates are deliberately
// NOT parameters of scoreCandidate / selectCandidate — choosing the candidate
// by year and then verifying by year would inflate the verified rate.
// ─────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the", "of", "in", "on", "at", "a", "an", "and", "or", "for", "to", "by",
  "with", "from", "during", "after", "before", "over", "vs", "v", "de", "la",
  "le", "el", "del", "di", "da", "du", "von", "van", "der", "den", "het",
]);

/** Full-string normalization: lowercase, diacritics stripped, non-alnum -> space, collapsed. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Meaningful tokens = normalized tokens minus stopwords. */
export function normalizeTokens(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function intersectCount(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  let n = 0;
  for (const t of new Set(a)) if (setB.has(t)) n += 1;
  return n;
}

export type CandidateScore = {
  /** Primary score: |A∩B| / min(|A|,|B|) over best label/alias. 0..1. */
  containment: number;
  /** Diagnostic only (CTO tuning): 2|∩B| / (|A|+|B|) of the SAME winning text. */
  dice: number;
};

/**
 * Scores a candidate's label/aliases against the cleaned title.
 * CORRECTION 1 (CTO ruling 1026-001-A): a label/alias with fewer than 2
 * meaningful tokens (after stopword removal) contributes containment 0 UNLESS
 * its normalizeText() equals normalizeText(cleanedTitle) exactly — containment
 * saturates at 1.0 whenever a short label sits inside a long narrative title.
 * Dice is always computed honestly for the winning text (stored for tuning).
 */
export function scoreCandidate(
  candidate: { label?: string | null; aliases?: readonly string[] | null },
  cleanedTitle: string | readonly string[]
): CandidateScore {
  // EDQ-FIX-WIKIDATA-RECALL-1027-001: the runner may pass multiple title
  // variants (q1 full clean + q2 clause-trim). Each variant is scored and the
  // better containment wins — variants are title text only, never stored
  // year/coords.
  const titles = (
    typeof cleanedTitle === "string" ? [cleanedTitle] : [...cleanedTitle]
  ).map((t) => ({ norm: normalizeText(t), tokens: normalizeTokens(t) }));
  const texts = [candidate.label, ...(candidate.aliases ?? [])].filter(
    (t): t is string => typeof t === "string" && t.trim().length > 0
  );
  let best: CandidateScore = { containment: 0, dice: 0 };
  for (const text of texts) {
    const tokens = normalizeTokens(text);
    const textNorm = normalizeText(text);
    for (const title of titles) {
      const exact = title.norm.length > 0 && textNorm === title.norm;
      const inter = intersectCount(tokens, title.tokens);
      const dice =
        tokens.length + title.tokens.length === 0
          ? 0
          : (2 * inter) / (tokens.length + title.tokens.length);
      const gated = tokens.length < 2 && !exact;
      const containment =
        !gated && Math.min(tokens.length, title.tokens.length) > 0
          ? inter / Math.min(tokens.length, title.tokens.length)
          : 0;
      if (
        containment > best.containment ||
        (containment === best.containment && dice > best.dice)
      ) {
        best = { containment, dice };
      }
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate selection. Integrity rule: stored year/coords NEVER enter here.
// ─────────────────────────────────────────────────────────────────────────────

export type MatchCandidate = {
  qid: string;
  label: string | null;
  aliases: string[];
  sitelinks: number;
  /** True iff the entity has at least one of P585/P580/P582/P571 claims. */
  eventLike: boolean;
};

export type ScoredCandidate = MatchCandidate & CandidateScore;

export type Selection = {
  kind: "winner" | "ambiguous" | "no_match";
  winner: ScoredCandidate | null;
  runnerUp: ScoredCandidate | null;
  /** All event-like candidates, sorted by containment desc, sitelinks desc, qid asc. */
  ranked: ScoredCandidate[];
};

export function isEventLike(entity: WdEntity): boolean {
  return EVENT_DATE_PROPS.some(
    (p) => (entity.claims?.[p]?.length ?? 0) > 0
  );
}

export function selectCandidate(
  candidates: readonly MatchCandidate[],
  cleanedTitle: string | readonly string[]
): Selection {
  const ranked = candidates
    .filter((c) => c.eventLike)
    .map((c) => ({ ...c, ...scoreCandidate(c, cleanedTitle) }))
    .sort(
      (a, b) =>
        b.containment - a.containment ||
        b.sitelinks - a.sitelinks ||
        (a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0)
    );
  const winner = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  if (!winner || winner.containment < MIN_MATCH_SCORE) {
    return { kind: "no_match", winner: null, runnerUp, ranked };
  }
  const margin = winner.containment - (runnerUp?.containment ?? 0);
  if (margin < MIN_MATCH_MARGIN) {
    return { kind: "ambiguous", winner, runnerUp, ranked };
  }
  return { kind: "winner", winner, runnerUp, ranked };
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyVerification — AFTER selection. Compares stored year/location to the
// WINNING candidate's Wikidata dates/coords.
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationVerdict = {
  status: VerificationStatus;
  /** Signed distance of stored year outside [wd_start, wd_end]; 0 = inside. */
  yearDelta: number | null;
  distanceKm: number | null;
  reason: string | null;
  coordsUnverifiable: boolean;
};

export function classifyVerification(input: {
  storedYear: number;
  storedLat: number | null;
  storedLon: number | null;
  selection: Selection;
  dates: WdDateRange | null;
  coords: WdCoords | null;
}): VerificationVerdict {
  const { selection, dates, coords } = input;

  const distanceKm =
    coords != null &&
    input.storedLat != null &&
    input.storedLon != null
      ? Math.round(
          haversineDistanceKm(
            { lat: input.storedLat, lng: input.storedLon },
            { lat: coords.lat, lng: coords.lon }
          ) * 1000
        ) / 1000
      : null;

  const yearDelta =
    dates == null
      ? null
      : input.storedYear < dates.yearStart
        ? input.storedYear - dates.yearStart
        : input.storedYear > dates.yearEnd
          ? input.storedYear - dates.yearEnd
          : 0;

  const base = { yearDelta, distanceKm, coordsUnverifiable: false };

  if (selection.kind === "no_match" || selection.winner == null) {
    return { ...base, status: "no_match", reason: null };
  }
  if (selection.kind === "ambiguous") {
    return { ...base, status: "ambiguous", reason: "below_margin" };
  }
  if (dates == null) {
    return { ...base, status: "no_wd_date", reason: null };
  }
  if (dates.precision < 9) {
    return { ...base, status: "review", reason: "coarse_precision" };
  }

  const yearOk =
    input.storedYear >= dates.yearStart - YEAR_TOLERANCE &&
    input.storedYear <= dates.yearEnd + YEAR_TOLERANCE;
  if (!yearOk) {
    return { ...base, status: "mismatch", reason: "year_out_of_range" };
  }
  if (distanceKm != null && distanceKm > KM_REVIEW) {
    return { ...base, status: "mismatch", reason: "distance_beyond_review" };
  }
  if (YEAR_TOLERANCE > 0 && Math.abs(yearDelta ?? 0) === YEAR_TOLERANCE) {
    return { ...base, status: "review", reason: "year_at_tolerance_boundary" };
  }
  if (distanceKm != null && distanceKm > KM_VERIFIED) {
    return { ...base, status: "review", reason: "distance_in_review_band" };
  }
  if (distanceKm == null) {
    // EDQ-FIX-WIKIDATA-RECALL-1027-001: 'verified' requires distance evidence.
    // When no coordinates can be compared (Wikidata has none, or the stored
    // location is missing), an exact-label hit can still be the wrong entity
    // ("Expo 2024 in Rome" matched the Chengdu expo via an exact alias after
    // " in Rome" was cleaned away). Best attainable status here is review.
    return {
      ...base,
      status: "review",
      reason: "coords_unverifiable",
      coordsUnverifiable: true,
    };
  }
  return { ...base, status: "verified", reason: null };
}
