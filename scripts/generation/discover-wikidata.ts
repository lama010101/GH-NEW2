// GEN-BUILD-DISCOVER-1028-001
// Wikidata discovery runner for the generation pipeline — DRY-RUN by
// default: zero database writes. With --write (NOT run in this task) it
// inserts mapped candidates into public.generation_candidates in batches
// of 200 with ON CONFLICT (wikidata_qid) DO NOTHING; --write refuses to
// run unless --out is explicitly passed.
//
//   npx tsx --env-file=D:/GH-NEW2/.env.local scripts/generation/discover-wikidata.ts
//     [--year-min N] [--year-max N] [--min-sitelinks N] [--limit-per-class N]
//     [--classes battle,treaty,...] [--seed N] [--out <path>] [--write]
//
// Source: https://query.wikidata.org/sparql (Accept: sparql-results+json).
// Politeness (EDQ conventions, scripts/event-quality/wikidata-verify.ts):
// serial requests, >=250 ms gap, retry on 429/5xx honoring Retry-After
// (max 5), abort the run when total 429s exceed 20. WDQS ~60 s timeouts
// are handled by splitting the year window into era buckets (newest
// first); a single-era window that still times out is recorded+skipped.
//
// Pure logic lives in src/core/wikidataDiscovery.ts +
// src/core/candidateFingerprint.ts. Year defaults come from the game's
// valid range constants (narrowest declaration found): -400..2025.

import dotenv from "dotenv";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { dbPool } from "../../src/server/db";
import {
  CLASS_GROUPS,
  buildDiscoveryQuery,
  eraLabelForYear,
  eraWindows,
  mapBindingToCandidate,
  type DiscoveryBinding,
  type MappedCandidate,
  type MapRejectReason,
} from "../../src/core/wikidataDiscovery";
import { buildDedupeFingerprint } from "../../src/core/candidateFingerprint";
import { parseWikidataTime } from "../../src/core/wikidataMatch";

dotenv.config({ path: ".env.local" });

// ─────────────────────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────────────────────

// Grep-the-constant findings (src/, 2026-10-28) — multiple declarations:
//   src/server/sessionCore.ts:1479-1480  defaults yearMin -400, yearMax 2026
//   src/core/competeCreate.ts:8-9        yearMin -400, yearMax 2025
//   src/components/practice/practiceSettings.ts:19-20  yearMin -3000, yearMax CURRENT_YEAR
// Narrower range is used: -400..2025. No new declaration added.
const DEFAULT_YEAR_MIN = -400;
const DEFAULT_YEAR_MAX = 2025;
const DEFAULT_MIN_SITELINKS = 15;
const DEFAULT_LIMIT_PER_CLASS = 200;
const DEFAULT_SEED = 1028001;
const PAGE_SIZE = 200;
const WRITE_BATCH = 200;

function parseFlags() {
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
  return {
    yearMin: flags.has("year-min") ? Number(flags.get("year-min")) : DEFAULT_YEAR_MIN,
    yearMax: flags.has("year-max") ? Number(flags.get("year-max")) : DEFAULT_YEAR_MAX,
    minSitelinks: flags.has("min-sitelinks") ? Number(flags.get("min-sitelinks")) : DEFAULT_MIN_SITELINKS,
    limitPerClass: flags.has("limit-per-class") ? Number(flags.get("limit-per-class")) : DEFAULT_LIMIT_PER_CLASS,
    classes: flags.has("classes") ? String(flags.get("classes")).split(",").map((s) => s.trim()).filter(Boolean) : null,
    seed: flags.has("seed") ? Number(flags.get("seed")) : DEFAULT_SEED,
    out: flags.has("out") ? String(flags.get("out")) : "../gen-discover-dryrun.json",
    outGiven: flags.has("out"),
    write: flags.has("write"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic seeded RNG (mulberry32) + shuffle — same as EDQ runner.
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
// WDQS client — serial requests, >=250 ms gap, 429/5xx retry honoring
// Retry-After (max 5). Run aborts when retries429 > MAX_429_BUDGET.
// ─────────────────────────────────────────────────────────────────────────────

const UA = "GuessHistoryBot/1.0 (https://www.guess-history.com)";
const WDQS_URL = "https://query.wikidata.org/sparql";
const MIN_GAP_MS = 250;
const MAX_RETRIES = 5;
const MAX_429_BUDGET = 20;
const CLIENT_TIMEOUT_MS = 75000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stats = { requests: 0, retries429: 0, timeouts: 0, errors: 0, windowSplits: 0 };
let lastRequestAt = 0;

class WdqsTimeoutError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "WdqsTimeoutError";
  }
}

async function wdqs(sparql: string): Promise<DiscoveryBinding[]> {
  const url = WDQS_URL + "?query=" + encodeURIComponent(sparql) + "&format=json";
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const gap = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (gap > 0) await sleep(gap);
    lastRequestAt = Date.now();
    stats.requests += 1;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        const body = await res.text().catch(() => "");
        if (res.status === 429) {
          stats.retries429 += 1;
          if (stats.retries429 > MAX_429_BUDGET) {
            throw new Error("rate_limit_abort: 429 budget exceeded");
          }
        }
        if (/timeout/i.test(body)) {
          stats.timeouts += 1;
          throw new WdqsTimeoutError(`WDQS query timeout (HTTP ${res.status})`);
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
        break;
      }
      const json = (await res.json()) as { results?: { bindings?: DiscoveryBinding[] } };
      return json.results?.bindings ?? [];
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (err instanceof WdqsTimeoutError) throw err;
      if (ctrl.signal.aborted) {
        stats.timeouts += 1;
        throw new WdqsTimeoutError(`WDQS client timeout after ${CLIENT_TIMEOUT_MS}ms`);
      }
      if (attempt === MAX_RETRIES) break;
      await sleep(Math.min(16000, 1000 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`wdqs request failed after retries: ${lastErr}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Paged fetch of one class group over the full year range. On a WDQS
// (~60 s) timeout the window is split by era buckets (eraWindows). A
// single-era window that still times out is recorded as an error and
// skipped — deeper splitting would not help because every query rescans
// the whole class anyway (YEAR() is not sargable in Blazegraph).
// ─────────────────────────────────────────────────────────────────────────────

type WindowError = { yearMin: number; yearMax: number; error: string };
type FetchOutcome = { rows: DiscoveryBinding[]; errors: WindowError[] };

async function fetchClass(
  classQids: readonly string[],
  yearMin: number,
  yearMax: number,
  minSitelinks: number,
  limitPerClass: number,
  className: string
): Promise<FetchOutcome> {
  const rows: DiscoveryBinding[] = [];
  const errors: WindowError[] = [];
  const queue: Array<{ yearMin: number; yearMax: number }> = [{ yearMin, yearMax }];
  while (queue.length > 0 && rows.length < limitPerClass) {
    if (stats.retries429 > MAX_429_BUDGET) break;
    const w = queue.shift()!;
    try {
      let offset = 0;
      while (rows.length < limitPerClass) {
        if (stats.retries429 > MAX_429_BUDGET) break;
        const pageLimit = Math.min(PAGE_SIZE, limitPerClass - rows.length);
        const sparql = buildDiscoveryQuery({
          classQids,
          yearMin: w.yearMin,
          yearMax: w.yearMax,
          minSitelinks,
          limit: pageLimit,
          offset,
        });
        const t = Date.now();
        const bindings = await wdqs(sparql);
        rows.push(...bindings);
        console.log(`  [${className}] [${w.yearMin}..${w.yearMax}] page@${offset}: ${bindings.length} rows (${Date.now() - t}ms, total ${rows.length})`);
        if (bindings.length < pageLimit) break;
        offset += pageLimit;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof WdqsTimeoutError) {
        const subs = eraWindows(w.yearMin, w.yearMax);
        if (subs.length > 1) {
          stats.windowSplits += 1;
          // Newest-first: discovered classes skew modern, so the per-class
          // budget fills in a few windows instead of grinding ~30 mostly-
          // empty ancient windows at ~60-75 s each.
          queue.push(...[...subs].reverse());
          console.log(`  [${className}] timeout on [${w.yearMin}..${w.yearMax}] -> split into ${subs.length} era buckets (newest first)`);
        } else {
          console.log(`  [${className}] timeout on single-era [${w.yearMin}..${w.yearMax}] -> recorded, skipping`);
          errors.push({ ...w, error: msg });
          stats.errors += 1;
        }
      } else {
        errors.push({ ...w, error: msg });
        stats.errors += 1;
      }
    }
  }
  return { rows, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write path (--write) — NOT executed in this task. Batches of 200,
// ON CONFLICT (wikidata_qid) WHERE wikidata_qid IS NOT NULL DO NOTHING
// to match the partial unique index generation_candidates_qid_uniq.
// ─────────────────────────────────────────────────────────────────────────────

const INSERT_COLS = [
  "status", "wikidata_qid", "wd_label", "event_year", "event_date",
  "date_precision", "latitude", "longitude", "coord_source", "p31",
  "sitelinks", "real_event", "dedupe_fingerprint", "source_citations",
  "quota_bucket", "title",
] as const;

async function insertBatch(cands: MappedCandidate[]): Promise<number> {
  const params: unknown[] = [];
  const tuples = cands.map((c) => {
    const base = params.length;
    params.push(
      c.status, c.wikidata_qid, c.wd_label, c.event_year, c.event_date,
      c.date_precision, c.latitude, c.longitude, c.coord_source,
      JSON.stringify(c.p31), c.sitelinks, c.real_event, c.dedupe_fingerprint,
      JSON.stringify(c.source_citations), JSON.stringify(c.quota_bucket), c.title
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10}::jsonb,$${base + 11},$${base + 12},$${base + 13},$${base + 14}::jsonb,$${base + 15}::jsonb,$${base + 16})`;
  });
  const sql = `INSERT INTO public.generation_candidates (${INSERT_COLS.join(",")})
    VALUES ${tuples.join(",")}
    ON CONFLICT (wikidata_qid) WHERE wikidata_qid IS NOT NULL DO NOTHING`;
  const res = await dbPool.query(sql, params);
  return res.rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const f = parseFlags();
  const startedAt = Date.now();
  if (f.write && !f.outGiven) {
    console.error("FATAL: --write requires an explicit --out <path> (refusing to run)");
    process.exit(1);
  }

  const wantedClasses = f.classes;
  if (wantedClasses != null) {
    const unknown = wantedClasses.filter((c) => !CLASS_GROUPS.some((g) => g.name === c));
    if (unknown.length) {
      console.error(`FATAL: unknown class groups: ${unknown.join(", ")} — valid: ${CLASS_GROUPS.map((g) => g.name).join(", ")}`);
      process.exit(1);
    }
  }
  const groups = wantedClasses == null
    ? [...CLASS_GROUPS]
    : CLASS_GROUPS.filter((g) => wantedClasses.includes(g.name));

  console.log("=== WIKIDATA DISCOVERY — GEN-BUILD-DISCOVER-1028-001 ===");
  console.log(`mode: ${f.write ? "WRITE (inserts into generation_candidates)" : "DRY RUN — zero DB writes"}`);
  console.log(`years: ${f.yearMin}..${f.yearMax}   min-sitelinks: ${f.minSitelinks}   limit-per-class: ${f.limitPerClass}   seed: ${f.seed}`);
  console.log(`classes: ${groups.map((g) => `${g.name}(${g.qids.join("+")})`).join(", ")}`);

  // (a) raw rows per class x era bucket. Era is derived from each row's own
  // parsed year (queries are per class; era buckets are the timeout split).
  const rawByClassEra: Record<string, Record<string, number>> = {};
  const errorsByClassEra: Record<string, WindowError[]> = {};
  const allRows: Array<{ row: DiscoveryBinding; classGroup: string }> = [];
  let abortedBy429 = false;

  for (const g of groups) {
    rawByClassEra[g.name] = {};
    const out = await fetchClass(g.qids, f.yearMin, f.yearMax, f.minSitelinks, f.limitPerClass, g.name);
    for (const row of out.rows) {
      const parsed = parseWikidataTime({
        time: row.date?.value,
        precision: row.precision == null ? undefined : Number(row.precision.value),
      });
      const era = eraLabelForYear(parsed?.year ?? null);
      rawByClassEra[g.name][era] = (rawByClassEra[g.name][era] ?? 0) + 1;
      allRows.push({ row, classGroup: g.name });
    }
    if (out.errors.length) {
      (errorsByClassEra[g.name] ??= []).push(...out.errors);
    }
    if (stats.retries429 > MAX_429_BUDGET) {
      abortedBy429 = true;
      break;
    }
  }

  // (b) with/without coordinates over raw bindings + distinct qids.
  let rowsWithCoords = 0;
  let rowsWithoutCoords = 0;
  const qidSet = new Set<string>();
  const qidWithCoords = new Set<string>();
  for (const { row } of allRows) {
    const qid = /(Q\d+)$/.exec(row.item?.value ?? "")?.[1] ?? "";
    if (qid) qidSet.add(qid);
    const has = row.lat != null && row.lon != null && row.coordSource != null;
    if (has) {
      rowsWithCoords += 1;
      if (qid) qidWithCoords.add(qid);
    } else {
      rowsWithoutCoords += 1;
    }
  }

  // (c) mapper — dedupe rows per (qid) preferring a P625 row, then map.
  const byQid = new Map<string, { row: DiscoveryBinding; classGroup: string }>();
  let dupRows = 0;
  for (const entry of allRows) {
    const qid = /(Q\d+)$/.exec(entry.row.item?.value ?? "")?.[1] ?? "";
    if (!qid) {
      byQid.set(`__noqid_${dupRows++}`, entry);
      continue;
    }
    const prev = byQid.get(qid);
    if (!prev) {
      byQid.set(qid, entry);
    } else {
      dupRows += 1;
      if (prev.row.coordSource?.value !== "P625" && entry.row.coordSource?.value === "P625") {
        byQid.set(qid, entry);
      }
    }
  }

  const candidates: MappedCandidate[] = [];
  const rejects: Record<MapRejectReason, number> = {
    bad_qid: 0, missing_label: 0, null_year: 0,
    precision_below_year: 0, year_out_of_range: 0, no_coords: 0,
  };
  const rejectSamples: Record<string, string[]> = {};
  for (const { row, classGroup } of byQid.values()) {
    const m = mapBindingToCandidate(row, {
      classGroup,
      yearMin: f.yearMin,
      yearMax: f.yearMax,
    });
    if (m.ok) {
      candidates.push(m.candidate);
    } else {
      rejects[m.reason] += 1;
      (rejectSamples[m.reason] ??= []).push(m.qid ?? "-");
    }
  }

  // Dedupe candidates sharing a fingerprint (within-run collisions).
  const byFingerprint = new Map<string, MappedCandidate>();
  let fpDupes = 0;
  for (const c of candidates) {
    if (byFingerprint.has(c.dedupe_fingerprint)) fpDupes += 1;
    else byFingerprint.set(c.dedupe_fingerprint, c);
  }
  const dedupedCandidates = [...byFingerprint.values()];

  // (d) seeded sample of 25 mapped candidates.
  const rng = mulberry32(f.seed);
  const sample = shuffled(dedupedCandidates, rng).slice(0, 25);

  // (e) overlap report vs existing events (READ-ONLY SELECT via dbPool).
  type ExistingEvent = { title: string; event_year: number; latitude: number | null; longitude: number | null };
  const evRes = await dbPool.query<ExistingEvent>(
    `SELECT e.title, e.event_year, l.latitude, l.longitude
       FROM events e
       JOIN locations l ON l.event_id = e.id
      WHERE e.real_event = true`
  );
  const existingByFp = new Map<string, ExistingEvent>();
  for (const e of evRes.rows) {
    const fp = buildDedupeFingerprint({
      title: e.title, year: e.event_year, lat: e.latitude, lon: e.longitude,
    });
    if (!existingByFp.has(fp)) existingByFp.set(fp, e);
  }
  const collisions: Array<{ candidate: MappedCandidate; existing: ExistingEvent }> = [];
  for (const c of dedupedCandidates) {
    const ex = existingByFp.get(c.dedupe_fingerprint);
    if (ex) collisions.push({ candidate: c, existing: ex });
  }

  // ── Console report ──
  const totalRaw = allRows.length;
  console.log(`\n=== (a) RAW ROWS per class x era (sitelinks>=${f.minSitelinks}) ===`);
  for (const g of groups) {
    const cells = Object.entries(rawByClassEra[g.name] ?? {});
    const total = cells.reduce((n, [, c]) => n + c, 0);
    for (const [era, c] of cells) {
      if (c > 0) console.log(`  ${g.name.padEnd(14)} ${era.padEnd(7)} ${c}`);
    }
    console.log(`  ${g.name.padEnd(14)} TOTAL   ${total}`);
    for (const e of errorsByClassEra[g.name] ?? []) {
      console.log(`  ${g.name.padEnd(14)} ERR     [${e.yearMin}..${e.yearMax}] ${e.error}`);
    }
  }
  console.log(`  ${"ALL".padEnd(14)} TOTAL   ${totalRaw}  (distinct qids: ${qidSet.size}, dup rows: ${dupRows})`);

  console.log(`\n=== (b) COORDINATES (raw bindings / distinct qids) ===`);
  console.log(`  with coords:    ${rowsWithCoords} rows / ${qidWithCoords.size} qids`);
  console.log(`  without coords: ${rowsWithoutCoords} rows / ${qidSet.size - qidWithCoords.size} qids`);

  console.log(`\n=== (c) MAPPER REJECTS (of ${byQid.size} distinct-qid rows) ===`);
  for (const [reason, n] of Object.entries(rejects)) {
    const ex = (rejectSamples[reason] ?? []).slice(0, 5).join(",");
    console.log(`  ${reason.padEnd(22)} ${n}${ex ? `  e.g. ${ex}` : ""}`);
  }
  console.log(`  mapped: ${candidates.length}  fingerprint-dupes dropped: ${fpDupes}  final: ${dedupedCandidates.length}`);

  console.log(`\n=== (d) SAMPLE — 25 mapped candidates (seed ${f.seed}) ===`);
  for (const c of sample) {
    console.log(`  ${c.wikidata_qid.padEnd(10)} ${c.event_year.toString().padStart(6)} ${c.quota_bucket.era.padEnd(6)} ${c.quota_bucket.class.padEnd(14)} ${c.title} | ${c.latitude?.toFixed(2)},${c.longitude?.toFixed(2)} ${c.coord_source} sl=${c.sitelinks}`);
  }

  console.log(`\n=== (e) OVERLAP vs existing events (events JOIN locations, real_event=true) ===`);
  console.log(`  existing event fingerprints: ${existingByFp.size} (from ${evRes.rows.length} rows)`);
  console.log(`  colliding candidates: ${collisions.length}/${dedupedCandidates.length}`);
  for (const { candidate, existing } of collisions.slice(0, 10)) {
    console.log(`  DUP ${candidate.wikidata_qid} "${candidate.title}" ${candidate.event_year} ~= "${existing.title}" ${existing.event_year}`);
  }

  // Optional write path — never executed in this task.
  let written = 0;
  if (f.write) {
    for (let i = 0; i < dedupedCandidates.length; i += WRITE_BATCH) {
      written += await insertBatch(dedupedCandidates.slice(i, i + WRITE_BATCH));
    }
    console.log(`\nwrite: inserted ${written} rows into generation_candidates (${dedupedCandidates.length - written} conflicts skipped)`);
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 10) / 100;
  console.log(`\n=== RUN STATS ===`);
  console.log(`  requests: ${stats.requests}   429s: ${stats.retries429}   timeouts: ${stats.timeouts}   window splits: ${stats.windowSplits}   errors: ${stats.errors}   elapsed: ${elapsedSec}s`);
  if (abortedBy429) console.log(`  aborted: 429 budget exceeded (${stats.retries429} > ${MAX_429_BUDGET}) — partial report`);
  if (!f.write) console.log("\nDRY RUN COMPLETE — generation_candidates untouched (0 writes).");

  const outPath = resolve(f.out);
  writeFileSync(outPath, JSON.stringify({
    meta: {
      task: "GEN-BUILD-DISCOVER-1028-001",
      write: f.write,
      yearMin: f.yearMin,
      yearMax: f.yearMax,
      minSitelinks: f.minSitelinks,
      limitPerClass: f.limitPerClass,
      seed: f.seed,
      classes: groups.map((g) => g.name),
      abortedBy429,
      elapsedSec,
      stats,
    },
    rawByClassEra,
    windowErrors: errorsByClassEra,
    coords: { rowsWithCoords, rowsWithoutCoords, qidWithCoords: qidWithCoords.size, distinctQids: qidSet.size },
    rejects,
    fingerprintDupes: fpDupes,
    overlap: {
      existingFingerprints: existingByFp.size,
      collisions: collisions.length,
      examples: collisions.slice(0, 10).map((x) => ({
        qid: x.candidate.wikidata_qid,
        candidateTitle: x.candidate.title,
        existingTitle: x.existing.title,
        year: x.candidate.event_year,
      })),
    },
    sample,
    candidates: dedupedCandidates,
  }, null, 1));
  console.log(`report: ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
