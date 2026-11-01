// EDQ-BUILD-WIKIDATA-VERIFY-1026-001-A
// Wikidata verification runner (DRY-RUN by default).
//
// Checks each sampled stored event's year + location against Wikidata and
// records the verdict in public.event_wikidata_verification — ONLY when
// --write is passed. Without --write this script performs ZERO database
// writes. Wikidata results never overwrite events/locations.
//
//   npx tsx scripts/event-quality/wikidata-verify.ts [--limit N] [--seed S]
//           [--run-id X] [--out <path>] [--write]
//
// Wikidata Action API only (wbsearchentities + wbgetentities). Serial
// requests, >=250ms gap, retry on 429/5xx honoring Retry-After (max 5).
// Matching logic lives in src/core/wikidataMatch.ts (pure, tested).

import dotenv from "dotenv";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { dbPool } from "../../src/server/db";
import {
  EVENT_DATE_PROPS,
  MIN_MATCH_MARGIN,
  MIN_MATCH_SCORE,
  YEAR_TOLERANCE,
  classifyVerification,
  closestYearQid,
  extractCoords,
  extractEventDates,
  isEventLike,
  normalizeText,
  scoreCandidate,
  selectCandidate,
  type MatchCandidate,
  type VerificationStatus,
  type WdDateRange,
  type WdEntity,
} from "../../src/core/wikidataMatch";

dotenv.config({ path: ".env.local" });

// ─────────────────────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────────────────────

function parseFlags(): { limit: number; seed: number; write: boolean; runId: string; out: string; fulltext: boolean } {
  const flags = new Map<string, string | true>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 2) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags.set(a.slice(2), argv[++i]);
    } else {
      flags.set(a.slice(2), true);
    }
  }
  const seed = flags.has("seed") ? Number(flags.get("seed")) : 1026001;
  const limit = flags.has("limit") ? Number(flags.get("limit")) : 100;
  const runId = String(flags.get("run-id") ?? `wd-1027-001-seed${seed}`);
  const out = String(flags.get("out") ?? "../wikidata-dryrun-1027-001.json");
  return { limit, seed, write: flags.has("write"), runId, out, fulltext: flags.has("fulltext") };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic seeded RNG (mulberry32) + shuffle
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Title cleaning for the first search query (per spec):
// strip leading "The", take text before ":", strip trailing " in <place>".
// ─────────────────────────────────────────────────────────────────────────────

function cleanTitleForSearch(title: string): string {
  let t = title.trim().replace(/^The\s+/i, "");
  t = t.split(":")[0].trim();
  const m = /^(.*\S)\s+in\s+[A-Z][A-Za-z' -]{1,60}$/.exec(t);
  if (m && m[1].trim().length >= 3) t = m[1].trim();
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECALL-1027-001 — query variants. wbsearchentities is a label-prefix search;
// long narrative titles cannot prefix-match short labels, so each event gets
// up to 4 deduped queries:
//   q0 = original title
//   q1 = cleanTitleForSearch(title)
//   q2 = clause-trimmed (cut at the first clause separator below; skip <3ch)
//   q3 = q2 iff it begins with Battle of / Siege of / Treaty of / Peace of —
//        kept as is; for any other shape no further variant is attempted.
// ─────────────────────────────────────────────────────────────────────────────

const CLAUSE_CUT =
  /\s(?:between|after|during|in|at|on|near|by|as|amid|following|for|with)\s|:|–|—|,/i;

const BATTLE_PREFIX = /^(battle|siege|treaty|peace)\s+of\b/i;

function clauseTrimmedTitle(title: string): string | null {
  const m = CLAUSE_CUT.exec(title);
  const cut = (m ? title.slice(0, m.index) : title).trim().replace(/^The\s+/i, "");
  return cut.length >= 3 ? cut : null;
}

function buildQueries(title: string): { q1: string; q2: string | null; all: string[] } {
  const q0 = title.trim();
  const q1 = cleanTitleForSearch(title);
  const q2 = clauseTrimmedTitle(title);
  const q3 = q2 != null && BATTLE_PREFIX.test(q2) ? q2 : null;
  const all = [...new Set([q0, q1, q2, q3].filter((q): q is string => q != null && q.length > 0))];
  return { q1, q2, all };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event loading + stratified sampling (Correction 4: EXACTLY 60 validated +
// 40 draft; special-year quotas counted INSIDE the status quotas; degrade
// honestly when a pool is too small).
// ─────────────────────────────────────────────────────────────────────────────

type DbEvent = {
  id: string;
  title: string;
  event_year: number;
  status: string;
  latitude: number | null;
  longitude: number | null;
  display_name: string | null;
  country: string | null;
};

const STATUS_TARGET: Record<string, number> = { validated: 60, draft: 40 };
const BCE_MIN = 5;
const PRE1000_MIN = 10;

function sampleEvents(all: DbEvent[], limit: number, rng: () => number) {
  const target: Record<string, number> = {
    validated: Math.min(STATUS_TARGET.validated, Math.round(limit * 0.6)),
    draft: 0,
  };
  target.draft = limit - target.validated; // exact split scaled to --limit

  const order = shuffled(all, rng);
  const picked: DbEvent[] = [];
  const pickedIds = new Set<string>();
  const counts: Record<string, number> = { validated: 0, draft: 0 };
  let bce = 0;
  let pre1000 = 0;

  const tryPick = (e: DbEvent): boolean => {
    if (pickedIds.has(e.id)) return false;
    if ((counts[e.status] ?? 0) >= (target[e.status] ?? 0)) return false;
    picked.push(e);
    pickedIds.add(e.id);
    counts[e.status] = (counts[e.status] ?? 0) + 1;
    if (e.event_year < 0) bce += 1;
    if (e.event_year < 1000) pre1000 += 1;
    return true;
  };

  // pass 1: BCE quota first
  for (const e of order) {
    if (bce >= BCE_MIN) break;
    if (e.event_year < 0) tryPick(e);
  }
  // pass 2: pre-1000 quota (BCE picks already count toward it)
  for (const e of order) {
    if (pre1000 >= PRE1000_MIN) break;
    if (e.event_year < 1000) tryPick(e);
  }
  // pass 3: fill each status to its target
  for (const e of order) tryPick(e);

  const quotas = {
    validated: { requested: target.validated, achieved: counts.validated ?? 0 },
    draft: { requested: target.draft, achieved: counts.draft ?? 0 },
    event_year_lt_0: { requested: BCE_MIN, achieved: bce },
    event_year_lt_1000: { requested: PRE1000_MIN, achieved: pre1000 },
  };
  return { picked, quotas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wikidata client: serial requests, >=250ms gap, 429/5xx retry honoring
// Retry-After (max 5 retries -> caller records an error row). Every raw
// response is captured for the out-of-repo rescore cache (Correction 3).
// ─────────────────────────────────────────────────────────────────────────────

const UA = "GuessHistoryBot/1.0 (https://www.guess-history.com)";
const MIN_GAP_MS = 250;
const MAX_RETRIES = 5;
const MAX_429_BUDGET = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stats = { requests: 0, retries429: 0, errors: 0 };
const rawCache: Array<{ action: string; params: Record<string, string>; response: unknown }> = [];

let lastRequestAt = 0;

async function wdApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = "https://www.wikidata.org/w/api.php?" + new URLSearchParams({ ...params, format: "json" });
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const gap = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (gap > 0) await sleep(gap);
    lastRequestAt = Date.now();
    stats.requests += 1;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        if (res.status === 429) {
          stats.retries429 += 1;
          // RECALL-1027-001: hard run abort when the Wikimedia 429 budget is
          // blown — surfaced as an error row and the main loop stops.
          if (stats.retries429 > MAX_429_BUDGET) {
            throw new Error("rate_limit_abort: 429 budget exceeded");
          }
        }
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(16000, 1000 * 2 ** attempt);
        lastErr = `HTTP ${res.status}`;
        if (attempt === MAX_RETRIES) break;
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        break; // 4xx other than 429 — not retryable
      }
      const json = await res.json();
      rawCache.push({ action: params.action ?? "", params: { ...params }, response: json });
      return json as Record<string, unknown>;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_RETRIES) break;
      await sleep(Math.min(16000, 1000 * 2 ** attempt));
    }
  }
  throw new Error(`wikidata request failed after retries: ${lastErr} (${params.action})`);
}

type SearchHit = { id: string; label?: string };

async function searchEntities(query: string): Promise<SearchHit[]> {
  const json = await wdApi({
    action: "wbsearchentities",
    search: query,
    language: "en",
    type: "item",
    limit: "7",
  });
  return (json.search as SearchHit[] | undefined) ?? [];
}

// RECALL-1027-001 --fulltext: one Action API full-text fallback query when no
// event-like candidate was found. Returns ns0 item titles ("Q123").
async function fullTextSearch(query: string): Promise<string[]> {
  const json = await wdApi({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "0",
    srlimit: "5",
  });
  const hits =
    (json.query as { search?: Array<{ title?: string }> } | undefined)?.search ?? [];
  return hits
    .map((h) => h.title)
    .filter((t): t is string => typeof t === "string" && /^Q\d+$/.test(t));
}

async function getEntities(ids: string[], props: string): Promise<Record<string, WdEntity>> {
  const out: Record<string, WdEntity> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    if (!batch.length) continue;
    const json = await wdApi({
      action: "wbgetentities",
      ids: batch.join("|"),
      props,
      languages: "en",
    });
    Object.assign(out, json.entities as Record<string, WdEntity>);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate assembly (Correction 3: full per-candidate detail for tuning)
// ─────────────────────────────────────────────────────────────────────────────

function entityLabel(e: WdEntity): string | null {
  return e.labels?.en?.value ?? null;
}

function entityAliases(e: WdEntity): string[] {
  return (e.aliases?.en ?? []).map((a) => a.value);
}

function entityP31(e: WdEntity): string[] {
  const out: string[] = [];
  for (const c of e.claims?.P31 ?? []) {
    const v = c.mainsnak?.datavalue?.value;
    const id = v != null && typeof v === "object" ? (v as { id?: unknown }).id : undefined;
    if (typeof id === "string") out.push(id);
  }
  return out;
}

/** Every claim property carrying a time-valued datavalue (findings: P577 etc.). */
function entityTimeProps(e: WdEntity): string[] {
  const props: string[] = [];
  for (const [prop, claims] of Object.entries(e.claims ?? {})) {
    const hasTime = claims.some((c) => {
      const v = c.mainsnak?.datavalue?.value;
      return v != null && typeof v === "object" && "time" in v;
    });
    if (hasTime) props.push(prop);
  }
  return props.sort();
}

function firstP276Id(e: WdEntity): string | null {
  for (const c of e.claims?.P276 ?? []) {
    const v = c.mainsnak?.datavalue?.value;
    const id = v != null && typeof v === "object" ? (v as { id?: unknown }).id : undefined;
    if (typeof id === "string") return id;
  }
  return null;
}

type CandidateDetail = {
  qid: string;
  label: string | null;
  containment: number;
  dice: number;
  sitelinks: number;
  eventLike: boolean;
  p31: string[];
  dateProps: string[];
  /** DIAGNOSTIC ONLY (RECALL-1027-001): selection never reads this field. */
  yearConsistentWithStored: boolean;
  rejectReason: string | null;
};

type QueryHit = {
  query: string;
  hits: number;
  top3: Array<{ qid: string; label: string | null; eventLike: boolean }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Report rows
// ─────────────────────────────────────────────────────────────────────────────

type EventRow = {
  event_id: string;
  title: string;
  status: string;
  stored_year: number;
  stored_place: string | null;
  stored_lat: number | null;
  stored_lon: number | null;
  queries: string[];
  verification_status: VerificationStatus | "error";
  wikidata_qid: string | null;
  wd_label: string | null;
  wd_year_start: number | null;
  wd_year_end: number | null;
  wd_date_precision: number | null;
  wd_lat: number | null;
  wd_lon: number | null;
  wd_coord_source: "P625" | "P276" | null;
  year_delta: number | null;
  distance_km: number | null;
  match_score: number | null;
  winner_dice: number | null;
  winner_p31: string[];
  runner_up_qid: string | null;
  runner_up_score: number | null;
  reason: string | null;
  coords_unverifiable: boolean;
  candidates: CandidateDetail[];
  query_hits: QueryHit[];
  no_match_reason: "no_search_hits" | "no_event_like" | "below_score" | null;
  tied_candidates: Array<{ qid: string; label: string | null; containment: number; yearConsistentWithStored: boolean }> | null;
  year_consistent_count: number | null;
  winner_year_consistent: boolean | null;
  runner_up_year_consistent: boolean | null;
  /** RECALL-1101-032: qid uniquely picked by the same-label year preference. */
  year_pref_qid: string | null;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-event verification pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function verifyEvent(ev: DbEvent, fulltext: boolean): Promise<EventRow> {
  const { q1, q2, all: queries } = buildQueries(ev.title);
  // Scoring texts: cleaned title q1 AND clause-trimmed q2 — better containment
  // wins (RECALL-1027-001). Stored year/coords still never enter selection.
  const scoreTitles = q2 != null && q2 !== q1 ? [q1, q2] : [q1];
  const row: EventRow = {
    event_id: ev.id,
    title: ev.title,
    status: ev.status,
    stored_year: ev.event_year,
    stored_place: [ev.display_name, ev.country].filter(Boolean).join(", ") || null,
    stored_lat: ev.latitude,
    stored_lon: ev.longitude,
    queries,
    verification_status: "error",
    wikidata_qid: null,
    wd_label: null,
    wd_year_start: null,
    wd_year_end: null,
    wd_date_precision: null,
    wd_lat: null,
    wd_lon: null,
    wd_coord_source: null,
    year_delta: null,
    distance_km: null,
    match_score: null,
    winner_dice: null,
    winner_p31: [],
    runner_up_qid: null,
    runner_up_score: null,
    reason: null,
    coords_unverifiable: false,
    candidates: [],
    query_hits: [],
    no_match_reason: null,
    tied_candidates: null,
    year_consistent_count: null,
    winner_year_consistent: null,
    runner_up_year_consistent: null,
    year_pref_qid: null,
  };

  // Union hits across all query variants; keep per-query hit lists for the
  // no_match diagnostics report.
  const qidSet = new Set<string>();
  const perQuery: Array<{ query: string; hits: SearchHit[] }> = [];
  for (const q of queries) {
    const hits = await searchEntities(q);
    perQuery.push({ query: q, hits });
    for (const h of hits) qidSet.add(h.id);
  }

  const entities = qidSet.size
    ? await getEntities([...qidSet], "claims|labels|aliases|sitelinks")
    : {};

  // --fulltext: one extra full-text query when no event-like candidate was
  // found among the label-prefix hits.
  if (fulltext && !Object.values(entities).some((e) => isEventLike(e))) {
    const ftQids = await fullTextSearch(q1);
    const fresh = ftQids.filter((q) => !(q in entities));
    if (fresh.length) {
      const ftEntities = await getEntities(fresh, "claims|labels|aliases|sitelinks");
      for (const q of fresh) qidSet.add(q);
      Object.assign(entities, ftEntities);
      perQuery.push({ query: `[fulltext] ${q1}`, hits: fresh.map((id) => ({ id })) });
    } else {
      perQuery.push({ query: `[fulltext] ${q1}`, hits: [] });
    }
  }

  // Per-query hit detail for the report (top-3 labels + eventLike flag).
  row.query_hits = perQuery.map((pq) => ({
    query: pq.query,
    hits: pq.hits.length,
    top3: pq.hits.slice(0, 3).map((h) => ({
      qid: h.id,
      label: h.label ?? entityLabel(entities[h.id] ?? {}) ?? null,
      eventLike: entities[h.id] ? isEventLike(entities[h.id]) : false,
    })),
  }));

  // One-hop P276 coordinate lookup: only for entities lacking direct P625.
  const p276Ids = new Set<string>();
  for (const e of Object.values(entities)) {
    const hasP625 = (e.claims?.P625?.length ?? 0) > 0;
    if (!hasP625) {
      const pid = firstP276Id(e);
      if (pid) p276Ids.add(pid);
    }
  }
  const p276Entities = p276Ids.size ? await getEntities([...p276Ids], "claims") : {};

  // Build match candidates (selection inputs ONLY: label/aliases, eventLike,
  // sitelinks — stored year/coords never reach selectCandidate).
  const candidates: MatchCandidate[] = Object.entries(entities).map(([qid, e]) => ({
    qid,
    label: entityLabel(e),
    aliases: entityAliases(e),
    sitelinks: Object.keys(e.sitelinks ?? {}).length,
    eventLike: isEventLike(e),
  }));

  let selection = selectCandidate(candidates, scoreTitles);

  // EDQ-FIX-WIKIDATA-RECALL-1101-032 — same-label homonym year preference.
  // When several search-hit entities carry the winner's exact normalized
  // en-label, prefer the one whose Wikidata year range is uniquely closest
  // to stored event_year ("Battle of Quang Tri" 1968 item vs a same-labelled
  // sibling). A uniquely closest pick becomes — or keeps — the winner;
  // classifyVerification still runs on it, so a wrong-year homonym reports
  // "mismatch" with both years (Chlumec 1124 vs 1775), never auto-passed.
  let yearPrefQid: string | null = null;
  if (selection.winner) {
    const winnerLabelNorm = normalizeText(selection.winner.label ?? "");
    if (winnerLabelNorm !== "") {
      const group: string[] = [selection.winner.qid];
      for (const [qid, e] of Object.entries(entities)) {
        if (qid === selection.winner.qid) continue;
        if (normalizeText(entityLabel(e) ?? "") !== winnerLabelNorm) continue;
        const s = scoreCandidate(
          { label: entityLabel(e), aliases: entityAliases(e) },
          scoreTitles
        );
        if (s.containment < MIN_MATCH_SCORE) continue;
        group.push(qid);
      }
      if (group.length > 1) {
        const datesByQid: Record<string, WdDateRange | null> = {};
        for (const qid of group) {
          datesByQid[qid] = entities[qid] ? extractEventDates(entities[qid]) : null;
        }
        const pick = closestYearQid(group, ev.event_year, datesByQid);
        if (pick != null) {
          yearPrefQid = pick;
          if (pick !== selection.winner.qid || selection.kind === "ambiguous") {
            const pc = candidates.find((c) => c.qid === pick);
            selection = {
              ...selection,
              kind: "winner",
              winner: pc
                ? { ...pc, ...scoreCandidate(pc, scoreTitles) }
                : selection.winner,
            };
          }
        }
      }
    }
  }

  const winnerEntity = selection.winner ? entities[selection.winner.qid] : undefined;
  const runnerUpEntity = selection.runnerUp ? entities[selection.runnerUp.qid] : undefined;
  const dates = winnerEntity ? extractEventDates(winnerEntity) : null;
  const coords = winnerEntity ? extractCoords(winnerEntity, p276Entities) : null;

  const verdict = classifyVerification({
    storedYear: ev.event_year,
    storedLat: ev.latitude,
    storedLon: ev.longitude,
    selection,
    dates,
    coords,
  });

  // DIAGNOSTIC ONLY (RECALL-1027-001 CHANGE 3): stored-year consistency is
  // computed for reporting — selectCandidate/scoreCandidate never see it.
  const yearConsistent = (e: WdEntity | undefined): boolean => {
    if (!e) return false;
    const d = extractEventDates(e);
    if (!d) return false;
    return (
      ev.event_year >= d.yearStart - YEAR_TOLERANCE &&
      ev.event_year <= d.yearEnd + YEAR_TOLERANCE
    );
  };

  // Per-candidate detail: scores + diagnostics on every candidate — including
  // non-event-like and rejected ones.
  const allDetails: CandidateDetail[] = Object.entries(entities).map(([qid, e]) => {
    const s = scoreCandidate({ label: entityLabel(e), aliases: entityAliases(e) }, scoreTitles);
    let rejectReason: string | null = null;
    if (selection.winner?.qid !== qid) {
      if (!isEventLike(e)) rejectReason = "not_event_like";
      else if (s.containment < MIN_MATCH_SCORE) rejectReason = "below_min_score";
      else rejectReason = "below_margin";
    }
    return {
      qid,
      label: entityLabel(e),
      containment: s.containment,
      dice: s.dice,
      sitelinks: Object.keys(e.sitelinks ?? {}).length,
      eventLike: isEventLike(e),
      p31: entityP31(e),
      dateProps: entityTimeProps(e),
      yearConsistentWithStored: yearConsistent(e),
      rejectReason,
    };
  });
  allDetails.sort((a, b) => b.containment - a.containment || b.sitelinks - a.sitelinks);

  row.verification_status = verdict.status;
  row.wikidata_qid = selection.winner?.qid ?? null;
  row.wd_label = selection.winner?.label ?? null;
  row.wd_year_start = dates?.yearStart ?? null;
  row.wd_year_end = dates?.yearEnd ?? null;
  row.wd_date_precision = dates?.precision ?? null;
  row.wd_lat = coords?.lat ?? null;
  row.wd_lon = coords?.lon ?? null;
  row.wd_coord_source = coords?.source ?? null;
  row.year_delta = verdict.yearDelta;
  row.distance_km = verdict.distanceKm;
  row.match_score = selection.winner?.containment ?? null;
  row.winner_dice = selection.winner?.dice ?? null;
  row.winner_p31 = winnerEntity ? entityP31(winnerEntity) : [];
  row.runner_up_qid = selection.runnerUp?.qid ?? null;
  row.runner_up_score = selection.runnerUp?.containment ?? null;
  row.reason = verdict.reason;
  row.coords_unverifiable = verdict.coordsUnverifiable;
  row.candidates = allDetails.slice(0, 5); // details jsonb: truncated to 5
  row.winner_year_consistent = winnerEntity ? yearConsistent(winnerEntity) : null;
  row.runner_up_year_consistent = runnerUpEntity ? yearConsistent(runnerUpEntity) : null;
  row.year_pref_qid = yearPrefQid;

  // Ambiguous: the tie set = ranked event-like candidates within
  // MIN_MATCH_MARGIN of the winner (winner + runner-up at minimum).
  if (verdict.status === "ambiguous" && selection.winner) {
    const w = selection.winner;
    row.tied_candidates = selection.ranked
      .filter((c) => w.containment - c.containment < MIN_MATCH_MARGIN)
      .map((c) => ({
        qid: c.qid,
        label: c.label,
        containment: c.containment,
        yearConsistentWithStored: yearConsistent(entities[c.qid]),
      }));
    row.year_consistent_count = row.tied_candidates.filter(
      (t) => t.yearConsistentWithStored
    ).length;
  }

  // no_match diagnostics: which stage stopped the match.
  if (verdict.status === "no_match") {
    const totalHits = perQuery.reduce((n, pq) => n + pq.hits.length, 0);
    row.no_match_reason =
      totalHits === 0
        ? "no_search_hits"
        : !candidates.some((c) => c.eventLike)
          ? "no_event_like"
          : "below_score";
  }

  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregates for the console report
// ─────────────────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const STATUS_ORDER: VerificationStatus[] = ["verified", "review", "mismatch", "ambiguous", "no_match", "no_wd_date"];

async function main() {
  const { limit, seed, write, runId, out, fulltext } = parseFlags();
  const startedAt = Date.now();
  console.log("=== WIKIDATA VERIFY — EDQ-FIX-WIKIDATA-RECALL-1101-032 ===");
  console.log(`mode: ${write ? "WRITE (upserts to event_wikidata_verification)" : "DRY RUN — zero DB writes"}   fulltext: ${fulltext ? "ON" : "OFF"}`);
  console.log(`run_id: ${runId}   seed: ${seed}   limit: ${limit}`);

  const evRes = await dbPool.query<DbEvent>(
    `SELECT e.id, e.title, e.event_year, e.status,
            l.latitude, l.longitude, l.display_name, l.country
       FROM events e
       JOIN locations l ON l.event_id = e.id
      WHERE e.real_event = true`
  );
  const rng = mulberry32(seed);
  const { picked, quotas } = sampleEvents(evRes.rows, limit, rng);
  console.log(`pool: ${evRes.rows.length} real events; sampled: ${picked.length}`);
  console.log("quotas (achieved/requested):");
  for (const [k, v] of Object.entries(quotas)) {
    console.log(`  ${k}: ${v.achieved}/${v.requested}`);
  }

  const rows: EventRow[] = [];
  let abortedBy429 = false;
  for (let i = 0; i < picked.length; i++) {
    // RECALL-1027-001: Wikimedia rate-limit guard — stop the run and report.
    if (stats.retries429 > MAX_429_BUDGET) {
      abortedBy429 = true;
      console.log(`  STOPPING RUN: 429 count ${stats.retries429} exceeds ${MAX_429_BUDGET} — partial report follows`);
      break;
    }
    const ev = picked[i];
    try {
      rows.push(await verifyEvent(ev, fulltext));
    } catch (err) {
      stats.errors += 1;
      rows.push({
        event_id: ev.id, title: ev.title, status: ev.status,
        stored_year: ev.event_year,
        stored_place: [ev.display_name, ev.country].filter(Boolean).join(", ") || null,
        stored_lat: ev.latitude, stored_lon: ev.longitude,
        queries: buildQueries(ev.title).all,
        verification_status: "error",
        wikidata_qid: null, wd_label: null, wd_year_start: null, wd_year_end: null,
        wd_date_precision: null, wd_lat: null, wd_lon: null, wd_coord_source: null,
        year_delta: null, distance_km: null, match_score: null, winner_dice: null,
        winner_p31: [], runner_up_qid: null, runner_up_score: null,
        reason: null, coords_unverifiable: false, candidates: [],
        query_hits: [], no_match_reason: null, tied_candidates: null,
        year_consistent_count: null, winner_year_consistent: null,
        runner_up_year_consistent: null, year_pref_qid: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if ((i + 1) % 10 === 0) {
      console.log(`  ... ${i + 1}/${picked.length} events processed (requests so far: ${stats.requests}, 429s: ${stats.retries429})`);
    }
  }
  if (abortedBy429) console.log(`  aborted: ${picked.length - rows.length} events unprocessed`);

  // Optional write path — upserts into event_wikidata_verification ONLY.
  // NOT run in this task.
  let written = 0;
  if (write) {
    for (const r of rows) {
      if (r.verification_status === "error") continue;
      await dbPool.query(
        `INSERT INTO public.event_wikidata_verification
          (event_id, run_id, status, wikidata_qid, wd_label, wd_year_start, wd_year_end,
           wd_date_precision, wd_lat, wd_lon, wd_coord_source, year_delta, distance_km,
           match_score, runner_up_qid, runner_up_score, details)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (event_id) DO UPDATE SET
           run_id=EXCLUDED.run_id, status=EXCLUDED.status, wikidata_qid=EXCLUDED.wikidata_qid,
           wd_label=EXCLUDED.wd_label, wd_year_start=EXCLUDED.wd_year_start,
           wd_year_end=EXCLUDED.wd_year_end, wd_date_precision=EXCLUDED.wd_date_precision,
           wd_lat=EXCLUDED.wd_lat, wd_lon=EXCLUDED.wd_lon, wd_coord_source=EXCLUDED.wd_coord_source,
           year_delta=EXCLUDED.year_delta, distance_km=EXCLUDED.distance_km,
           match_score=EXCLUDED.match_score, runner_up_qid=EXCLUDED.runner_up_qid,
           runner_up_score=EXCLUDED.runner_up_score, details=EXCLUDED.details`,
        [
          r.event_id, runId, r.verification_status, r.wikidata_qid, r.wd_label,
          r.wd_year_start, r.wd_year_end, r.wd_date_precision, r.wd_lat, r.wd_lon,
          r.wd_coord_source, r.year_delta, r.distance_km, r.match_score,
          r.runner_up_qid, r.runner_up_score,
          JSON.stringify({ queries: r.queries, reason: r.reason, coords_unverifiable: r.coords_unverifiable, winner_dice: r.winner_dice, winner_p31: r.winner_p31, candidates: r.candidates, no_match_reason: r.no_match_reason, tied_candidates: r.tied_candidates, year_consistent_count: r.year_consistent_count, winner_year_consistent: r.winner_year_consistent, runner_up_year_consistent: r.runner_up_year_consistent, year_pref_qid: r.year_pref_qid, query_hits: r.query_hits }),
        ]
      );
      written += 1;
    }
    console.log(`write: upserted ${written} rows into event_wikidata_verification`);
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 10) / 100;

  // ── Report JSON (outside repo) + raw response cache (Correction 3) ──
  const outPath = resolve(out);
  const cachePath = outPath.replace(/\.json$/i, "") + ".rawcache.json";
  writeFileSync(outPath, JSON.stringify({ meta: { runId, seed, limit, write, fulltext, abortedBy429, elapsedSec, stats, quotas }, rows }, null, 1));
  writeFileSync(cachePath, JSON.stringify(rawCache));
  console.log(`report: ${outPath}`);
  console.log(`raw cache: ${cachePath} (${rawCache.length} responses)`);

  // ── Console report ──
  const dist: Record<string, number> = {};
  for (const r of rows) dist[r.verification_status] = (dist[r.verification_status] ?? 0) + 1;
  const matched = rows.filter((r) => r.wikidata_qid != null).length;
  const coarse = rows.filter((r) => r.wd_date_precision != null && r.wd_date_precision < 9).length;
  console.log("\n=== STATUS DISTRIBUTION ===");
  for (const s of [...STATUS_ORDER, "error"]) {
    const n = dist[s] ?? 0;
    console.log(`  ${s}: ${n} (${((n / rows.length) * 100).toFixed(1)}%)`);
  }
  console.log(`overall match rate (matched=${matched}/${rows.length}): ${((matched / rows.length) * 100).toFixed(1)}%`);
  console.log(`date precision < 9: ${coarse}`);

  const dists = rows.map((r) => r.distance_km).filter((d): d is number => d != null).sort((a, b) => a - b);
  console.log(`\n=== DISTANCE_KM percentiles (n=${dists.length}, both-side coords) ===`);
  console.log(`  min=${dists[0]?.toFixed(1)} p25=${percentile(dists, 25)?.toFixed(1)} median=${percentile(dists, 50)?.toFixed(1)} p75=${percentile(dists, 75)?.toFixed(1)} p90=${percentile(dists, 90)?.toFixed(1)} max=${dists[dists.length - 1]?.toFixed(1)}`);

  const deltas = rows.map((r) => r.year_delta).filter((d): d is number => d != null);
  const hist: Record<string, number> = {};
  for (const d of deltas) hist[String(d)] = (hist[String(d)] ?? 0) + 1;
  console.log(`\n=== YEAR_DELTA histogram (n=${deltas.length}) ===`);
  for (const k of Object.keys(hist).sort((a, b) => Number(a) - Number(b))) {
    console.log(`  ${k}: ${hist[k]}`);
  }

  console.log(`\n=== SAMPLE ROWS (first 25) ===`);
  for (const r of rows.slice(0, 25)) {
    const wdYears = r.wd_year_start == null ? "-" : r.wd_year_start === r.wd_year_end ? `${r.wd_year_start}` : `${r.wd_year_start}..${r.wd_year_end}`;
    console.log(
      `  ${r.title} | ${r.stored_year} | ${r.stored_place ?? "-"} | ${r.wikidata_qid ?? "-"} | ${r.wd_label ?? "-"} | ${wdYears} | p${r.wd_date_precision ?? "-"} | ${r.distance_km?.toFixed(1) ?? "-"}km | ${r.verification_status} | cont=${r.match_score?.toFixed(2) ?? "-"} dice=${r.winner_dice?.toFixed(2) ?? "-"} | runner=${r.runner_up_qid ?? "-"}@${r.runner_up_score?.toFixed(2) ?? "-"} | p31=${r.winner_p31.join("+") || "-"}`
    );
  }

  const ambiguous = rows.filter((r) => r.verification_status === "ambiguous");
  console.log(`\n=== AMBIGUOUS (${ambiguous.length}) — top-2 candidates ===`);
  for (const r of ambiguous.slice(0, 10)) {
    const top2 = r.candidates.slice(0, 2).map((c) => `${c.qid} "${c.label}" cont=${c.containment.toFixed(2)}`).join(" vs ");
    console.log(`  ${r.title} | ${top2}`);
  }

  const noMatch = rows.filter((r) => r.verification_status === "no_match");
  console.log(`\n=== NO_MATCH sample (${noMatch.length} total) — first 5 with queries ===`);
  for (const r of noMatch.slice(0, 5)) {
    console.log(`  ${r.title} | queries: ${r.queries.map((q) => JSON.stringify(q)).join(", ")}`);
  }

  // RECALL-1027-001 CHANGE 4 — diagnostic report sections.
  const nmrDist: Record<string, number> = {};
  for (const r of noMatch) {
    const k = r.no_match_reason ?? "unknown";
    nmrDist[k] = (nmrDist[k] ?? 0) + 1;
  }
  console.log(`\n=== NO_MATCH REASON BREAKDOWN ===`);
  for (const k of ["no_search_hits", "no_event_like", "below_score"]) {
    console.log(`  ${k}: ${nmrDist[k] ?? 0}`);
  }

  console.log(`\n=== NO_MATCH DIAGNOSTIC SAMPLE (30, seeded) ===`);
  const nmSample = shuffled(noMatch, mulberry32(seed)).slice(0, 30);
  for (const r of nmSample) {
    const best = r.candidates[0];
    console.log(`  ${r.title} | reason=${r.no_match_reason ?? "-"} | best=${best ? `${best.qid} "${best.label}" cont=${best.containment.toFixed(2)}` : "-"}`);
    for (const qh of r.query_hits) {
      const t3 = qh.top3.map((t) => `${t.qid} "${t.label ?? "-"}" ev=${t.eventLike}`).join("; ");
      console.log(`      q="${qh.query}" hits=${qh.hits} top3: ${t3 || "-"}`);
    }
  }

  const nonNoMatch = rows.filter((r) => r.verification_status !== "no_match" && r.verification_status !== "error");
  console.log(`\n=== ALL NON-NO_MATCH ROWS (${nonNoMatch.length}) ===`);
  for (const r of nonNoMatch) {
    console.log(
      `  ${r.title} | ${r.stored_year} | winner=${r.wikidata_qid} "${r.wd_label}" cont=${r.match_score?.toFixed(2)} dice=${r.winner_dice?.toFixed(2)} yc=${r.winner_year_consistent} yp=${r.year_pref_qid ?? "-"} | runner=${r.runner_up_qid ?? "-"}@${r.runner_up_score?.toFixed(2) ?? "-"} yc=${r.runner_up_year_consistent} | p31=${r.winner_p31.join("+") || "-"} | ${r.verification_status} | ${r.reason ?? "-"}`
    );
  }

  // Recall comparison on the SAME sample (seed 1026001, limit 100): previous
  // run was matched 11/100, no_match 89, verified 5.
  console.log(`\n=== RECALL COMPARISON (same sample, seed 1026001) ===`);
  console.log(`  metric      | prev(1026-001) | this run (${fulltext ? "fulltext" : "default"})`);
  console.log(`  matched     | ${"11/100"}       | ${matched}/${rows.length}`);
  console.log(`  no_match    | ${"89"}           | ${dist["no_match"] ?? 0}`);
  console.log(`  verified    | ${"5"}            | ${dist["verified"] ?? 0}`);

  console.log(`\n=== RUN STATS ===`);
  console.log(`  requests: ${stats.requests}   429s: ${stats.retries429}   errors: ${stats.errors}   elapsed: ${elapsedSec}s   seed: ${seed}`);

  // Findings: time-valued properties present on rejected-but-plausible
  // candidates that are not among the 4 supported date props.
  const findings: Record<string, { count: number; qids: Set<string> }> = {};
  for (const r of rows) {
    for (const c of r.candidates) {
      if (c.rejectReason == null) continue;
      for (const p of c.dateProps) {
        if ((EVENT_DATE_PROPS as readonly string[]).includes(p)) continue;
        findings[p] ??= { count: 0, qids: new Set() };
        findings[p].count += 1;
        findings[p].qids.add(c.qid);
      }
    }
  }
  console.log(`\n=== UNSUPPORTED DATE PROPS on rejected candidates (findings only) ===`);
  const fkeys = Object.keys(findings);
  if (!fkeys.length) console.log("  none observed");
  for (const p of fkeys.sort()) {
    console.log(`  ${p}: ${findings[p].count} candidates — e.g. ${[...findings[p].qids].slice(0, 5).join(", ")}`);
  }

  if (!write) console.log("\nDRY RUN COMPLETE — event_wikidata_verification untouched (0 writes).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
