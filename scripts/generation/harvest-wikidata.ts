// EDQ-BUILD-WDHARVEST-1122-801
// Wikidata-first candidate harvester + fact-lock gates (G1-G5) -> stratified
// candidate pool for public.generation_candidates.
//
//   npx tsx scripts/generation/harvest-wikidata.ts \
//     --env-file D:\GH-NEW2\.env.local --target 320 --seed 1122801 \
//     [--write] [--write-cap 150] [--run-id wdh-1122-801] [--out <json>] [--existing]
//     [--retry-rejected] [--resume <state-json>] [--max-minutes N] [--max-queries N]
//     [--reclassify-continents --backup D:\gh-audits\batch-1127\continent-backup-108.json]
//
// DRY-RUN by default: zero DB writes. --write writes ONLY into
// public.generation_candidates (retry rows UPDATE in place; other rows use
// ON CONFLICT wikidata_qid DO NOTHING; surplus passers carry selected=false).
// --existing is REPORT ONLY — zero writes even when --write is passed.
//
// Sources (all serial, cached, rate-limited):
//   Wikidata SPARQL  https://query.wikidata.org/sparql        >=1s gap, 60s timeout
//   Wikidata API     https://www.wikidata.org/w/api.php       >=250ms gap
//   Wikipedia leads  https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title} >=250ms
//   Nominatim reverse https://nominatim.openstreetmap.org/reverse 1 req/s hard, abort >900
// Caches live OUTSIDE the repo next to --out. No LLM, no image calls.

import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { Pool, type QueryResultRow } from "pg";
import { haversineDistanceKm } from "../../src/core/rules";
import { continentForCountryCode } from "../../src/core/continents";
import {
  ERA_BUCKETS,
  MIN_SITELINKS,
  MIN_SITELINKS_RELAXED,
  RELAXED_SITELINK_ERAS,
  SUPPORT_LANGS,
  certifyFacts,
  type FactLockResult,
} from "../../src/core/factLock";
import type { WdEntity } from "../../src/core/wikidataMatch";

// ─────────────────────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────────────────────

type Flags = {
  envFile: string;
  target: number;
  seed: number;
  write: boolean;
  writeCap: number;
  existing: boolean;
  retryRejected: boolean;
  reclassifyContinents: boolean;
  backup: string;
  resume: string;
  maxMinutes: number;
  maxQueries: number;
  out: string;
  runId: string;
};

function parseFlags(): Flags {
  const flags = new Map<string, string | true>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 2) flags.set(a.slice(2, eq), a.slice(eq + 1));
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--"))
      flags.set(a.slice(2), argv[++i]);
    else flags.set(a.slice(2), true);
  }
  const runId = String(flags.get("run-id") ?? "wdh-1122-801");
  return {
    envFile: String(flags.get("env-file") ?? ""),
    target: flags.has("target") ? Number(flags.get("target")) : 320,
    seed: flags.has("seed") ? Number(flags.get("seed")) : 1122801,
    write: flags.has("write"),
    writeCap: flags.has("write-cap") ? Number(flags.get("write-cap")) : 150,
    existing: flags.has("existing"),
    retryRejected: flags.has("retry-rejected"),
    reclassifyContinents: flags.has("reclassify-continents"),
    backup: String(flags.get("backup") ?? ""),
    resume: String(flags.get("resume") ?? ""),
    maxMinutes: flags.has("max-minutes") ? Number(flags.get("max-minutes")) : 0,
    maxQueries: flags.has("max-queries") ? Number(flags.get("max-queries")) : 0,
    out: String(
      flags.get("out") ?? resolve(process.cwd(), "..", `wdharvest-${runId}-report.json`)
    ),
    runId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic seeded RNG (mulberry32) + shuffle — same as wikidata-verify.
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
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
// HTTP layer — serial per service, gap enforcement, 429/5xx retry honoring
// Retry-After (max 5). Identifying User-Agent on every request.
// ─────────────────────────────────────────────────────────────────────────────

const UA =
  "GuessHistoryBot/1.0 (https://www.guess-history.com; Wikidata-first event harvester EDQ-BUILD-WDHARVEST-1122-801)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Service = "sparql" | "wikidata" | "wiki" | "nominatim";

const stats = {
  sparql: 0,
  wikidata: 0,
  wiki: 0,
  nominatim: 0,
  errors: 0,
  retries: 0,
  status: {} as Record<string, number>,
};

function countStatus(status: number) {
  const key = String(status);
  stats.status[key] = (stats.status[key] ?? 0) + 1;
}

let runStartedAt = Date.now();
const sparqlTimings: Array<{ scope: string; status: number; seconds: number; detail: string }> = [];
function heartbeat(scope: string, detail = "") {
  const elapsedSec = Math.round((Date.now() - runStartedAt) / 100) / 10;
  const status = Object.entries(stats.status)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}:${n}`)
    .join(",");
  console.log(
    `[hb] ${scope} elapsed=${elapsedSec}s sparql=${stats.sparql} wikidata=${stats.wikidata} wiki=${stats.wiki} nominatim=${stats.nominatim} retries=${stats.retries} errors=${stats.errors} status={${status}}${detail ? ` ${detail}` : ""}`
  );
}

const operProgress = { phase: "startup", processed: 0, total: 0 };

function operProgressDetail(): string {
  const elapsedSec = Math.max(1, (Date.now() - runStartedAt) / 1000);
  const ratePerMin = operProgress.processed / (elapsedSec / 60);
  const remaining = Math.max(0, operProgress.total - operProgress.processed);
  const eta = ratePerMin > 0 ? `${Math.ceil(remaining / ratePerMin)}min` : "unknown";
  return `phase=${operProgress.phase} processed=${operProgress.processed}/total=${operProgress.total} rate=${ratePerMin.toFixed(2)}/min eta=${eta}`;
}

function startOperHeartbeat(onTick: () => void): NodeJS.Timeout {
  const timer = setInterval(() => {
    onTick();
    heartbeat("progress", operProgressDetail());
  }, 30_000);
  timer.unref();
  return timer;
}

const lastHit: Record<string, number> = {};
async function throttle(svc: string, gapMs: number) {
  const wait = gapMs - (Date.now() - (lastHit[svc] ?? 0));
  if (wait > 0) await sleep(wait);
  lastHit[svc] = Date.now();
}

type HttpResult = { status: number; body: unknown };

async function fetchJson(
  url: string,
  svc: Service,
  gapMs: number,
  timeoutMs: number,
  maxRetries: number
): Promise<HttpResult | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttle(svc, gapMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      countStatus(res.status);
      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxRetries) {
          stats.errors += 1;
          return { status: res.status, body: null };
        }
        stats.retries += 1;
        const ra = Number(res.headers.get("retry-after"));
        await sleep(
          Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(16000, 1000 * 2 ** attempt)
        );
        continue;
      }
      if (!res.ok) {
        stats.errors += 1;
        return { status: res.status, body: null };
      }
      const body = (await res.json().catch(() => null)) as unknown;
      return { status: res.status, body };
    } catch {
      clearTimeout(timer);
      countStatus(0);
      if (attempt === maxRetries) {
        stats.errors += 1;
        return { status: 0, body: null };
      }
      stats.retries += 1;
      await sleep(Math.min(16000, 1000 * 2 ** attempt));
    }
  }
  return null;
}

// Harvester-local pool lifecycle: the DB is connected for short read/write
// phases only, never held open across long Wikidata/Wikipedia/Nominatim phases.
class HarvestDb {
  private pool: Pool | null = null;

  private ensurePool(): Pool {
    if (this.pool) return this.pool;
    const connectionString = process.env.SUPABASE_DB_CONNECTION;
    if (!connectionString) throw new Error("SUPABASE_DB_CONNECTION missing");
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 2,
      min: 0,
      connectionTimeoutMillis: 20000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
      keepAlive: true,
    });
    pool.on("error", (err) => {
      const code = (err as { code?: unknown }).code;
      console.error(`[DB][POOL] idle error code=${typeof code === "string" ? code : "unknown"} message=${err.message.split("\n")[0]}`);
    });
    pool.on("connect", () => console.log("[DB][POOL] connect"));
    pool.on("remove", () => console.log("[DB][POOL] remove"));
    this.pool = pool;
    return pool;
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        return await this.ensurePool().query<T>(text, params);
      } catch (err) {
        const e = err as Error & { code?: string };
        const transient =
          e.code === "ECONNRESET" ||
          e.code === "57P01" ||
          /ECONNRESET|terminating connection|server closed the connection/i.test(e.message);
        lastErr = e;
        if (!transient || attempt === 3) throw e;
        console.error(`[DB][RETRY] code=${e.code ?? "network"} attempt=${attempt + 1}/3`);
        await this.end();
        await sleep(Math.min(8000, 500 * 2 ** attempt));
      }
    }
    throw lastErr ?? new Error("db_query_failed");
  }

  async end(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    if (pool) await pool.end().catch(() => undefined);
  }
}

const harvestDb = new HarvestDb();

// ─────────────────────────────────────────────────────────────────────────────
// Wikidata Action API (wbgetentities) — entity cache shared by both modes.
// ─────────────────────────────────────────────────────────────────────────────

const entityCache: Record<string, WdEntity> = {};

async function ensureEntities(ids: string[], props: string): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !(id in entityCache));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    if (!batch.length) continue;
    const url =
      "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({
        action: "wbgetentities",
        ids: batch.join("|"),
        props,
        languages: "en",
        format: "json",
      });
    const r = await fetchJson(url, "wikidata", 250, 60000, 5);
    stats.wikidata += 1;
    const entities =
      (r?.body as { entities?: Record<string, WdEntity> } | null)?.entities ?? {};
    for (const [qid, e] of Object.entries(entities)) {
      if (e && typeof e === "object") entityCache[qid] = e;
    }
  }
}

type Snak = {
  rank?: unknown;
  mainsnak?: { datavalue?: { value?: unknown } };
};
function snaksOf(e: WdEntity | undefined, prop: string): Snak[] {
  return ((e?.claims?.[prop] ?? []) as unknown as Snak[]) ?? [];
}
function claimItemIds(e: WdEntity | undefined, prop: string): string[] {
  const out: string[] = [];
  for (const s of snaksOf(e, prop)) {
    if (s.rank === "deprecated") continue;
    const v = s.mainsnak?.datavalue?.value;
    const id = v != null && typeof v === "object" ? (v as { id?: unknown }).id : undefined;
    if (typeof id === "string" && id) out.push(id);
  }
  return out;
}

/**
 * Fetch a candidate set plus the full lookup closure: P17 countries (P297,
 * P576/P582), P276 places (P625/P17/P131), P131 admins and their P17 countries.
 * Iterates to a fixpoint (bounded) because P131->P17 and P276->P131->P17 chains
 * need second/third hops. Candidates get claims|labels|sitelinks; related
 * entities claims|labels only.
 */
async function fetchClosure(candidateQids: string[]): Promise<void> {
  const candSet = new Set(candidateQids);
  await ensureEntities(candidateQids, "claims|labels|sitelinks");
  for (let round = 0; round < 6; round++) {
    const needed = new Set<string>();
    for (const [qid, e] of Object.entries(entityCache)) {
      const isCand = candSet.has(qid);
      const props = isCand ? ["P17", "P276", "P131"] : ["P17", "P131"];
      for (const p of props) for (const id of claimItemIds(e, p)) needed.add(id);
    }
    const fresh = [...needed].filter((id) => !(id in entityCache));
    if (!fresh.length) break;
    await ensureEntities(fresh, "claims|labels");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SPARQL — one query per era bucket AND per class (never one giant query).
// ─────────────────────────────────────────────────────────────────────────────

const SPARQL_URL = "https://query.wikidata.org/sparql";

/** WDQS bindings carry full entity URIs; reduce to the bare QID. */
function qidOf(uri: string | undefined): string | null {
  if (!uri) return null;
  const m = /\/(Q\d+)$/.exec(uri);
  return m ? m[1] : null;
}

function eraFilter(era: string): string {
  switch (era) {
    case "BCE":
      return "FILTER(YEAR(?when) < 0)";
    case "0-999":
      return "FILTER(YEAR(?when) >= 0 && YEAR(?when) <= 999)";
    case "1000-1499":
      return "FILTER(YEAR(?when) >= 1000 && YEAR(?when) <= 1499)";
    case "1500-1799":
      return "FILTER(YEAR(?when) >= 1500 && YEAR(?when) <= 1799)";
    case "1800-1899":
      return "FILTER(YEAR(?when) >= 1800 && YEAR(?when) <= 1899)";
    case "1900-1949":
      return "FILTER(YEAR(?when) >= 1900 && YEAR(?when) <= 1949)";
    default:
      return "FILTER(YEAR(?when) >= 1950)";
  }
}

type SparqlClassEraResult = {
  qids: string[];
  truncated: boolean;
  status: number;
  error: string | null;
};

async function sparqlClassEra(
  era: string,
  classQids: string[],
  sitelinkFloor: number
): Promise<SparqlClassEraResult> {
  if (!classQids.length) return { qids: [], truncated: false, status: 200, error: null };
  const values = classQids.map((q) => `wd:${q}`).join(" ");
  const query = `
SELECT DISTINCT ?item ?sitelinks WHERE {
  ?item wdt:P31 ?class .
  VALUES ?class { ${values} }
  { ?item p:P625 ?coord } UNION { ?item p:P276 ?loc }
  { ?item p:P585/ps:P585 ?when } UNION { ?item p:P580/ps:P580 ?when }
  ?item wikibase:sitelinks ?sitelinks .
  ${eraFilter(era)}
  FILTER(?sitelinks >= ${sitelinkFloor})
}
LIMIT 500`;
  const url = SPARQL_URL + "?" + new URLSearchParams({ query, format: "json" });
  const queryStarted = Date.now();
  const r = await fetchJson(url, "sparql", 1000, 60000, 5);
  stats.sparql += 1;
  const elapsedSec = Math.round((Date.now() - queryStarted) / 100) / 10;
  if (!r || r.status !== 200 || !r.body) {
    const status = r?.status ?? 0;
    sparqlTimings.push({ scope: "class-era", status, seconds: elapsedSec, detail: `${era}/${sitelinkFloor}` });
    heartbeat("sparql", `era=${era} floor=${sitelinkFloor} status=${status} qtime=${elapsedSec}s error=1`);
    return { qids: [], truncated: false, status, error: `http_${status}` };
  }
  const bindings =
    (r.body as { results?: { bindings?: Array<Record<string, { value?: string }>> } })
      ?.results?.bindings ?? [];
  const qids = bindings
    .map((b) => qidOf(b.item?.value))
    .filter((v): v is string => v != null);
  sparqlTimings.push({ scope: "class-era", status: 200, seconds: elapsedSec, detail: `${era}/${sitelinkFloor}` });
  heartbeat("sparql", `era=${era} floor=${sitelinkFloor} status=200 qids=${qids.length} qtime=${elapsedSec}s`);
  return { qids: [...new Set(qids)], truncated: bindings.length >= 500, status: 200, error: null };
}

// Subclass expansion roots (CTO spec): Q1190554 occurrence, Q13418847 historical event.
// The expansion is split by root and paged in small batches; labels are resolved
// later through wbgetentities so WDQS never has to run the label service here.
async function fetchSubclassClasses(roots: string[], limit = 2000) {
  const byQid = new Map<string, { qid: string; label: string }>();
  const errors: Array<{ root: string; offset: number; status: number }> = [];
  const batchSize = 250;
  for (const root of roots) {
    for (let offset = 0; offset < limit; offset += batchSize) {
      const query = `
SELECT DISTINCT ?class WHERE {
  ?class wdt:P279* wd:${root} .
}
ORDER BY ?class
LIMIT ${batchSize}
OFFSET ${offset}`;
      const url = SPARQL_URL + "?" + new URLSearchParams({ query, format: "json" });
      const queryStarted = Date.now();
      const r = await fetchJson(url, "sparql", 1000, 60000, 5);
      stats.sparql += 1;
      const elapsedSec = Math.round((Date.now() - queryStarted) / 100) / 10;
      if (!r || r.status !== 200 || !r.body) {
        const status = r?.status ?? 0;
        errors.push({ root, offset, status });
        sparqlTimings.push({ scope: "subclass", status, seconds: elapsedSec, detail: `${root}@${offset}` });
        heartbeat("sparql-subclass", `root=${root} offset=${offset} status=${status} qtime=${elapsedSec}s error=1`);
        break;
      }
      const bindings =
        (r.body as { results?: { bindings?: Array<Record<string, { value?: string }>> } })
          ?.results?.bindings ?? [];
      for (const b of bindings) {
        const qid = qidOf(b.class?.value);
        if (qid && /^Q\d+$/.test(qid)) byQid.set(qid, { qid, label: "" });
      }
      sparqlTimings.push({ scope: "subclass", status: 200, seconds: elapsedSec, detail: `${root}@${offset}` });
      heartbeat("sparql-subclass", `root=${root} offset=${offset} status=200 rows=${bindings.length} qtime=${elapsedSec}s`);
      if (bindings.length < batchSize) break;
    }
  }
  return { classes: [...byQid.values()].slice(0, limit), errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Class verification — every class QID is checked by label via wbgetentities.
// ─────────────────────────────────────────────────────────────────────────────

const HINT_CLASS_QIDS = [
  "Q178561", // battle
  "Q131569", // treaty
  "Q8065", // natural disaster
  "Q7944", // earthquake
  "Q124757", // riot
  "Q3839081", // disaster
  "Q40231", // public election
  "Q198", // war
];

const FICTIONAL_CANDIDATE_QIDS = [
  "Q15632617", // fictional human
  "Q65924737", // character in a fictitious work
  "Q14514600", // group of fictional characters
  "Q100708514", // fictional character in a musical work
  "Q4271324", // mythical character
  "Q2239243", // mythical creature
  "Q105091982", // Mythological Figure
  "Q3895768", // fictional location
];

const EVENT_LABEL_RE =
  /\b(battle|war|siege|treaty|pact|accord|armistice|truce|ceasefire|revolution|revolt|rebellion|uprising|insurgency|coups?\b|putsch|mutiny|riot|protest|demonstration|strike|boycott|massacre|genocide|holocaust|pogrom|famine|plague|epidemic|pandemic|outbreak|disaster|catastrophe|crisis|earthquake|hurricane|cyclone|typhoon|tornado|flood|drought|eruption|volcano|tsunami|avalanche|landslide|blizzard|election|referendum|plebiscite|inauguration|coronation|wedding|funeral|execution|assassination|trial|inquisition|crusade|jihad|reformation|schism|council|synod|conclave|conference|summit|convention|congress|olympic|championship|tournament|marathon|expedition|migration|pilgrimage|founding|establishment|independence|unification|partition|annexation|invasion|occupation|liberation|surrender|defeat|victory|discovery|invention|landing|launch|incident|occurrence|event|commemoration|anniversary|centenar|bicentennial|millenar|jubilee|festival|olympiad|world cup|super bowl|civil war|world war|cold war|arms race|space race|intifada|july|coup|uprising|rebellion|mutiny|riot|protest|strike|boycott|massacre|genocide|famine|plague|epidemic|pandemic|disaster|catastrophe|crisis|earthquake|hurricane|cyclone|typhoon|tornado|flood|drought|eruption|volcano|tsunami|avalanche|landslide|blizzard|election|referendum|inauguration|coronation|funeral|execution|assassination|trial|crusade|jihad|reformation|schism|council|synod|conclave|conference|summit|convention|congress|olympic|championship|tournament|marathon|expedition|migration|pilgrimage|founding|independence|unification|partition|annexation|invasion|occupation|liberation|surrender|defeat|victory|discovery|invention|landing|launch|incident|occurrence|commemoration|anniversary|festival|olympiad)\b/i;

const FICTION_LABEL_RE = /fiction|myth|legend|imaginary|fabulous/i;

type ClassEntry = { qid: string; label: string | null; kept: boolean; reason: string };

function entityLabel(e: WdEntity | undefined): string | null {
  return e?.labels?.en?.value ?? null;
}

/** Direct-P279 subclass check against the two event roots. */
function isDirectEventSubclass(e: WdEntity | undefined): boolean {
  return ["Q1190554", "Q13418847"].some((root) =>
    snaksOf(e, "P279").some((s) => {
      if (s.rank === "deprecated") return false;
      const v = s.mainsnak?.datavalue?.value;
      const id = v != null && typeof v === "object" ? (v as { id?: unknown }).id : undefined;
      return id === root;
    })
  );
}

async function verifyClassQids(
  qids: string[],
  isEvent: (label: string | null, e: WdEntity | undefined) => { ok: boolean; reason: string }
): Promise<ClassEntry[]> {
  const out: ClassEntry[] = [];
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    await ensureEntities(batch, "claims|labels");
    for (const qid of batch) {
      const e = entityCache[qid];
      const label = entityLabel(e);
      const verdict = isEvent(label, e);
      out.push({ qid, label, kept: verdict.ok, reason: verdict.reason });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wikipedia lead extracts — REST summary per language via the item's own
// sitelink title (never the en title on foreign wikis). Cached JSON outside repo.
// ─────────────────────────────────────────────────────────────────────────────

type ReverseGeo = {
  countryCode: string | null;
  displayName: string | null;
  regionCode?: string | null;
  zoom?: number;
};

let wikiCache: Record<string, string | null> = {};
let geoCache: Record<string, ReverseGeo | null> = {};
let wikiCachePath = "";
let geoCachePath = "";
let nominatimCalls = 0;
const NOMINATIM_LIMIT = 900;

function loadCaches(dir: string) {
  wikiCachePath = resolve(dir, "wiki-extracts.cache.json");
  geoCachePath = resolve(dir, "nominatim.cache.json");
  if (existsSync(wikiCachePath)) {
    try {
      wikiCache = JSON.parse(readFileSync(wikiCachePath, "utf8")) as typeof wikiCache;
    } catch {
      wikiCache = {};
    }
  }
  if (existsSync(geoCachePath)) {
    try {
      geoCache = JSON.parse(readFileSync(geoCachePath, "utf8")) as typeof geoCache;
    } catch {
      geoCache = {};
    }
  }
}
let cacheDirty = false;
function flushCaches() {
  if (!cacheDirty) return;
  try {
    writeFileSync(wikiCachePath, JSON.stringify(wikiCache));
    writeFileSync(geoCachePath, JSON.stringify(geoCache));
    cacheDirty = false;
  } catch {
    /* cache flush is best-effort */
  }
}

async function wikiExtract(lang: string, title: string): Promise<string | null> {
  const key = `${lang}:${title}`;
  if (key in wikiCache) return wikiCache[key];
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetchJson(url, "wiki", 250, 30000, 3);
  stats.wiki += 1;
  let extract: string | null = null;
  if (r && r.status === 200 && r.body && typeof r.body === "object") {
    const e = (r.body as { extract?: unknown }).extract;
    if (typeof e === "string" && e.trim()) extract = e;
  }
  wikiCache[key] = extract;
  cacheDirty = true;
  return extract;
}

/** extracts map for certifyFacts: en + SUPPORT_LANGS that have a sitelink. */
async function fetchExtracts(entity: WdEntity): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const langs = ["en", ...SUPPORT_LANGS];
  for (const lang of langs) {
    const site = entity.sitelinks?.[`${lang}wiki`] as { title?: unknown } | undefined;
    const title = typeof site?.title === "string" ? site.title : null;
    out[lang] = title ? await wikiExtract(lang, title) : null;
  }
  return out;
}

async function reverseGeocode(
  coords: { lat: number; lon: number }
): Promise<ReverseGeo | null> {
  const key = `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`;
  if (key in geoCache) {
    const cached = geoCache[key];
    if (cached === null || cached.zoom === 5) return cached;
  }
  if (nominatimCalls >= NOMINATIM_LIMIT) {
    throw new Error(`nominatim_budget_exceeded:${NOMINATIM_LIMIT}`);
  }
  nominatimCalls += 1;
  const url =
    "https://nominatim.openstreetmap.org/reverse?" +
    new URLSearchParams({
      format: "jsonv2",
      lat: String(coords.lat),
      lon: String(coords.lon),
      zoom: "5",
    });
  const r = await fetchJson(url, "nominatim", 1000, 30000, 3);
  stats.nominatim += 1;
  let out: ReverseGeo | null = null;
  if (r && r.status === 200 && r.body && typeof r.body === "object") {
    const b = r.body as {
      address?: { country_code?: unknown; ["ISO3166-2-lvl4"]?: unknown };
      display_name?: unknown;
    };
    const cc = b.address?.country_code;
    const region = b.address?.["ISO3166-2-lvl4"];
    out = {
      countryCode: typeof cc === "string" && cc ? cc.toUpperCase() : null,
      displayName: typeof b.display_name === "string" ? b.display_name : null,
      regionCode: typeof region === "string" && region ? region.toUpperCase() : null,
      zoom: 5,
    };
  }
  geoCache[key] = out;
  cacheDirty = true;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate evaluation with network cascade: pure gates (G1,G2,G4) first; G3 only
// when they pass; G5 only when G3 passes. Unreached gates are marked skipped.
// ─────────────────────────────────────────────────────────────────────────────

type EvalOutcome = {
  result: FactLockResult;
  extracts: Record<string, string | null>;
  reverseGeocode: ReverseGeo | null;
};

async function evaluateCandidate(
  qid: string,
  queryEra: string,
  eventClasses: ReadonlySet<string>,
  fictionalClasses: ReadonlySet<string>
): Promise<EvalOutcome> {
  const entity = entityCache[qid];
  const base = {
    entity,
    related: entityCache,
    eventClasses,
    fictionalClasses,
    era: queryEra,
  };
  let extracts: Record<string, string | null> = {};
  let geo: ReverseGeo | null = null;
  let evaluatedG3 = false;
  let evaluatedG5 = false;

  const r1 = certifyFacts({ ...base, extracts: {}, reverseGeocode: null });
  let result = r1;
  const pureOk = r1.gates.G1.ok && r1.gates.G2.ok && r1.gates.G4.ok;
  if (pureOk) {
    extracts = await fetchExtracts(entity);
    evaluatedG3 = true;
    result = certifyFacts({ ...base, extracts, reverseGeocode: null });
    if (result.gates.G3.ok && result.coords) {
      geo = await reverseGeocode(result.coords);
      evaluatedG5 = true;
      result = certifyFacts({ ...base, extracts, reverseGeocode: geo });
    }
  }
  // Mark gates that were never reached — honest skipped verdicts.
  const gates = { ...result.gates };
  if (!evaluatedG3) gates.G3 = { ok: false, reason: "skipped:upstream_gate_failed" };
  if (!evaluatedG5) {
    gates.G5 = result.coords
      ? { ok: false, reason: "skipped:upstream_gate_failed" }
      : { ok: false, reason: "no_coords_from_G4" };
  }
  const finalResult: FactLockResult = { ...result, gates, pass: false };
  if (gates.G1.ok && gates.G2.ok && gates.G3.ok && gates.G4.ok && gates.G5.ok) {
    finalResult.pass = true;
  }
  return { result: finalResult, extracts, reverseGeocode: geo };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers (reads in dry-run; writes only under --write in harvest mode).
// The harvester owns pool connect/release phases through harvestDb so no DB
// connection is held while slow external network phases run.
// ─────────────────────────────────────────────────────────────────────────────

async function loadExistingQids(): Promise<Set<string>> {
  const out = new Set<string>();
  const a = await harvestDb.query<{ wikidata_qid: string }>(
    "SELECT wikidata_qid FROM public.generation_candidates WHERE wikidata_qid IS NOT NULL"
  );
  for (const r of a.rows) out.add(r.wikidata_qid);
  const b = await harvestDb.query<{ wikidata_qid: string }>(
    "SELECT wikidata_qid FROM public.event_wikidata_verification WHERE wikidata_qid IS NOT NULL"
  );
  for (const r of b.rows) out.add(r.wikidata_qid);
  return out;
}

async function loadExistingFingerprints(): Promise<Set<string>> {
  const r = await harvestDb.query<{ dedupe_fingerprint: string }>(
    "SELECT dedupe_fingerprint FROM public.generation_candidates WHERE dedupe_fingerprint IS NOT NULL"
  );
  return new Set(r.rows.map((x) => x.dedupe_fingerprint));
}

type RetryRejectedRow = {
  wikidata_qid: string;
  event_year: number | null;
  dedupe_fingerprint: string | null;
  g3_reason: string | null;
  g5_reason: string | null;
};

/** Rows whose rejection reasons belong to the fixed harvester/date/network bug classes. */
async function loadRetryRejectedRows(): Promise<Map<string, RetryRejectedRow>> {
  const r = await harvestDb.query<RetryRejectedRow>(
    `WITH reasons AS (
       SELECT wikidata_qid, event_year, dedupe_fingerprint,
              checks->'gates'->'G3'->>'reason' AS g3_reason,
              checks->'gates'->'G5'->>'reason' AS g5_reason
         FROM public.generation_candidates
        WHERE status = 'rejected' AND wikidata_qid IS NOT NULL
     )
     SELECT * FROM reasons
      WHERE g3_reason IN ('support_lang_agreement_0_below_2','missing_en_extract')
         OR g5_reason = 'reverse_geocode_unavailable'
         OR (g3_reason = 'en_extract_lacks_year' AND event_year < 0)`
  );
  return new Map(r.rows.map((x) => [x.wikidata_qid, x]));
}

function fingerprintOf(label: string | null, year: number | null): string | null {
  if (!label || year == null) return null;
  return `${label.trim().toLowerCase()}::${year}`;
}

function wdLabelOf(entity: WdEntity | undefined, qid: string): string | null {
  const en = entity?.labels?.en?.value;
  if (typeof en === "string" && en.trim()) return en;
  const site = entity?.sitelinks?.enwiki as { title?: unknown } | undefined;
  if (typeof site?.title === "string" && site.title.trim()) return site.title;
  return qid;
}

function countryLabelOf(qid: string): string | null {
  const e = entityCache[qid];
  const en = e?.labels?.en?.value;
  return typeof en === "string" && en.trim() ? en : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate record
// ─────────────────────────────────────────────────────────────────────────────

type CandidateRow = {
  qid: string;
  wd_label: string | null;
  query_eras: string[];
  result: FactLockResult;
  extracts: Record<string, string | null>;
  reverse_geocode: ReverseGeo | null;
  continent: string | null;
  country: string | null;
  cell_era: string | null;
  cell_continent: string | null;
  fingerprint: string | null;
  dedupe_skip: "qid" | "fingerprint" | null;
  selected: boolean;
  retryOfRejected: boolean;
  originalFingerprint: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Report helpers
// ─────────────────────────────────────────────────────────────────────────────

function gateTable(rows: CandidateRow[]): Record<string, { pass: number; fail: number }> {
  const out: Record<string, { pass: number; fail: number }> = {};
  for (const g of ["G1", "G2", "G3", "G4", "G5"]) out[g] = { pass: 0, fail: 0 };
  for (const r of rows) {
    for (const g of ["G1", "G2", "G3", "G4", "G5"] as const) {
      if (r.result.gates[g].ok) out[g].pass += 1;
      else out[g].fail += 1;
    }
  }
  return out;
}

function gridOf(rows: CandidateRow[]): {
  grid: Record<string, Record<string, number>>;
  emptyCells: string[];
} {
  const passers = rows.filter((r) => r.result.pass && !r.dedupe_skip);
  const grid: Record<string, Record<string, number>> = {};
  const emptyCells: string[] = [];
  for (const era of ERA_BUCKETS) {
    grid[era] = {};
    for (const cont of ["Africa", "Asia", "Europe", "North America", "South America", "Oceania", "unknown"]) {
      const n = passers.filter((r) => r.cell_era === era && r.cell_continent === cont).length;
      grid[era][cont] = n;
      if (n === 0) emptyCells.push(`${era} x ${cont}`);
    }
  }
  return { grid, emptyCells };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECLASSIFY MODE — status='new' rows only; writes continent and
// quota_bucket.continent only. Backup is written before any DB mutation.
// ─────────────────────────────────────────────────────────────────────────────

type ReclassifyRow = {
  id: string;
  title: string | null;
  country: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  reverse_country_code: string | null;
  reverse_region_code: string | null;
  citation_region_code: string | null;
  quota_bucket: Record<string, unknown> | null;
};

function continentCounts(rows: Array<{ continent: string | null }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = r.continent ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function runReclassifyContinents(flags: Flags) {
  console.log("=== WD-HARVEST --reclassify-continents — DRY RUN unless --write ===");
  if (!flags.backup) throw new Error("--backup <json> is required for --reclassify-continents");

  const res = await harvestDb.query<ReclassifyRow>(
    `SELECT id, COALESCE(wd_label, title, wikidata_qid) AS title, country, continent,
            latitude, longitude,
            checks->>'reverse_country_code' AS reverse_country_code,
            checks->>'reverse_region_code' AS reverse_region_code,
            source_citations->'reverse_geocode'->>'region_code' AS citation_region_code,
            quota_bucket
       FROM public.generation_candidates
      WHERE status='new'
      ORDER BY created_at, id`
  );
  await harvestDb.end();

  const backupPath = resolve(flags.backup);
  mkdirSync(dirname(backupPath), { recursive: true });
  const backup = {
    created_at: new Date().toISOString(),
    source: "public.generation_candidates status=new",
    rows: res.rows.map((r) => ({
      id: r.id,
      old_continent: r.continent,
      old_quota_bucket: r.quota_bucket,
    })),
  };
  writeFileSync(backupPath, JSON.stringify(backup, null, 1));
  console.log(`backup written: ${backupPath} rows=${backup.rows.length}`);

  const beforeCounts = continentCounts(res.rows);
  const updates: Array<{
    id: string;
    title: string | null;
    country: string | null;
    oldContinent: string | null;
    newContinent: string;
    oldQuotaContinent: unknown;
    reverseCountryCode: string | null;
    reverseRegionCode: string | null;
  }> = [];
  const evaluated: Array<ReclassifyRow & { newContinent: string }> = [];

  for (const row of res.rows) {
    let countryCode = row.reverse_country_code?.toUpperCase() ?? null;
    let regionCode = row.reverse_region_code ?? row.citation_region_code ?? null;
    if (countryCode === "US" && !regionCode && row.latitude != null && row.longitude != null) {
      const geo = await reverseGeocode({ lat: row.latitude, lon: row.longitude });
      countryCode = geo?.countryCode ?? countryCode;
      regionCode = geo?.regionCode ?? regionCode;
    }
    const newContinent = row.latitude != null && row.longitude != null
      ? continentForCountryCode(countryCode, row.latitude, row.longitude, regionCode)
      : "unknown";
    evaluated.push({ ...row, newContinent });
    const oldQuotaContinent = row.quota_bucket?.continent;
    if (row.continent !== newContinent || oldQuotaContinent !== newContinent) {
      updates.push({
        id: row.id,
        title: row.title,
        country: row.country,
        oldContinent: row.continent,
        newContinent,
        oldQuotaContinent,
        reverseCountryCode: countryCode,
        reverseRegionCode: regionCode,
      });
    }
  }

  console.log(`reclassify evaluated=${res.rows.length} changed=${updates.length}`);
  console.log(`before continent counts: ${JSON.stringify(beforeCounts)}`);
  for (const u of updates) {
    console.log(`changed: ${u.title ?? u.id} | country=${u.country ?? "-"} | ${u.oldContinent ?? "unknown"} -> ${u.newContinent}`);
  }

  let writeError: string | null = null;
  let updatedRows = 0;
  let afterCounts: Record<string, number> | null = null;
  if (flags.write && updates.length) {
    try {
      await harvestDb.query("BEGIN");
      for (const u of updates) {
        const upd = await harvestDb.query(
          `UPDATE public.generation_candidates
              SET continent=$2,
                  quota_bucket=jsonb_set(coalesce(quota_bucket,'{}'::jsonb),'{continent}',to_jsonb($2::text),true)
            WHERE id=$1 AND status='new'`,
          [u.id, u.newContinent]
        );
        updatedRows += upd.rowCount ?? 0;
      }
      await harvestDb.query("COMMIT");
      const after = await harvestDb.query<{ continent: string | null }>(
        "SELECT continent FROM public.generation_candidates WHERE status='new'"
      );
      afterCounts = continentCounts(after.rows);
      console.log(`after continent counts: ${JSON.stringify(afterCounts)}`);
      console.log(`reclassify write result: updated_rows=${updatedRows} changed_plan=${updates.length}`);
    } catch (err) {
      await harvestDb.query("ROLLBACK").catch(() => undefined);
      const e = err as Error & { code?: string };
      writeError = `${e.code ?? "db_error"}:${e.message.split("\n")[0]}`;
      console.error(`reclassify write failed soft; no commit. ${writeError}`);
    } finally {
      await harvestDb.end();
    }
  } else if (!flags.write) {
    console.log("DRY RUN COMPLETE — generation_candidates untouched (0 writes).");
  }

  flushCaches();
  const rollbackScript = backupPath.replace(/\.json$/i, ".rollback.mjs");
  const report = {
    meta: {
      task: "EDQ-FIX-HARVESTER-OPS-1126-904",
      mode: "reclassify-continents",
      write: flags.write,
      backupPath,
      rollbackScript,
      writeError,
    },
    beforeCounts,
    afterCounts,
    evaluated: evaluated.map((r) => ({
      id: r.id,
      title: r.title,
      country: r.country,
      oldContinent: r.continent,
      newContinent: r.newContinent,
      reverseCountryCode: r.reverse_country_code,
    })),
    updates,
    updatedRows: flags.write && !writeError ? updatedRows : 0,
  };
  const outPath = resolve(flags.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 1));
  console.log(`report: ${outPath}`);
  console.log(`rollback script path: ${rollbackScript}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HARVEST MODE
// ─────────────────────────────────────────────────────────────────────────────

type HarvestCtx = {
  flags: Flags;
  eventClasses: Set<string>;
  fictionalClasses: Set<string>;
  classReport: ClassEntry[];
  existingQids: Set<string>;
  existingFingerprints: Set<string>;
  retryRejected: Map<string, RetryRejectedRow>;
  rows: CandidateRow[];
  evaluatedQids: Set<string>;
  completedRounds: Set<string>;
  harvestLog: Array<Record<string, unknown>>;
  startedAt: number;
  stopReason: string | null;
};

type HarvestState = {
  version: 1;
  runId: string;
  target: number;
  seed: number;
  rows: CandidateRow[];
  evaluatedQids: string[];
  completedRounds: string[];
  harvestLog: Array<Record<string, unknown>>;
  classReport: ClassEntry[];
  eventClasses: string[];
  fictionalClasses: string[];
  retryRejectedQids: string[];
  stopReason: string | null;
};

function harvestStatePath(flags: Flags): string {
  return flags.resume || `${resolve(flags.out)}.state.json`;
}

function saveHarvestState(ctx: HarvestCtx): void {
  const state: HarvestState = {
    version: 1,
    runId: ctx.flags.runId,
    target: ctx.flags.target,
    seed: ctx.flags.seed,
    rows: ctx.rows,
    evaluatedQids: [...ctx.evaluatedQids],
    completedRounds: [...ctx.completedRounds],
    harvestLog: ctx.harvestLog,
    classReport: ctx.classReport,
    eventClasses: [...ctx.eventClasses],
    fictionalClasses: [...ctx.fictionalClasses],
    retryRejectedQids: [...ctx.retryRejected.keys()],
    stopReason: ctx.stopReason,
  };
  try {
    writeFileSync(harvestStatePath(ctx.flags), JSON.stringify(state));
  } catch {
    /* resumable-state writes are best-effort; the report remains authoritative */
  }
}

function loadHarvestState(flags: Flags): HarvestState | null {
  if (!flags.resume || !existsSync(flags.resume)) return null;
  try {
    const parsed = JSON.parse(readFileSync(flags.resume, "utf8")) as HarvestState;
    if (parsed.version !== 1 || parsed.runId !== flags.runId || parsed.seed !== flags.seed || parsed.target !== flags.target) {
      console.log(`resume state ignored: identity mismatch in ${flags.resume}`);
      return null;
    }
    return parsed;
  } catch {
    console.log(`resume state ignored: unreadable ${flags.resume}`);
    return null;
  }
}

function stopHarvest(ctx: HarvestCtx, reason: string): void {
  if (!ctx.stopReason) {
    ctx.stopReason = reason;
    console.log(`STOP-EARLY: ${reason}; writing resumable state and partial report`);
  }
}

function checkHarvestLimits(ctx: HarvestCtx): boolean {
  if (ctx.stopReason) return true;
  if (ctx.flags.maxMinutes > 0 && Date.now() - ctx.startedAt >= ctx.flags.maxMinutes * 60_000) {
    stopHarvest(ctx, `max_minutes_${ctx.flags.maxMinutes}_reached`);
    return true;
  }
  if (ctx.flags.maxQueries > 0 && stats.sparql >= ctx.flags.maxQueries) {
    stopHarvest(ctx, `max_queries_${ctx.flags.maxQueries}_reached`);
    return true;
  }
  return false;
}

function continentOfEvaluation(ev: EvalOutcome): string | null {
  if (!ev.result.coords) return null;
  return continentForCountryCode(
    ev.reverseGeocode?.countryCode ?? ev.result.reverse_country_code,
    ev.result.coords.lat,
    ev.result.coords.lon,
    ev.reverseGeocode?.regionCode ?? null
  );
}

const CANDIDATE_FLUSH_N = 25;

function buildCandidateRow(
  ctx: HarvestCtx,
  qid: string,
  era: string,
  ev: EvalOutcome,
  retryRow: RetryRejectedRow | null
): CandidateRow {
  const entity = entityCache[qid];
  const label = wdLabelOf(entity, qid);
  const fp = fingerprintOf(label, ev.result.year);
  let dedupe: CandidateRow["dedupe_skip"] = null;
  if (!retryRow && ctx.existingQids.has(qid)) dedupe = "qid";
  else if (
    fp &&
    ctx.existingFingerprints.has(fp) &&
    fp !== retryRow?.dedupe_fingerprint
  ) {
    dedupe = "fingerprint";
  }
  const continent = continentOfEvaluation(ev);
  const p17 = claimItemIds(entity, "P17")[0];
  const country = p17 ? (countryLabelOf(p17) ?? ev.result.stated_country_isos[0] ?? null) : null;
  return {
    qid,
    wd_label: label,
    query_eras: era ? [era] : [],
    result: ev.result,
    extracts: ev.extracts,
    reverse_geocode: ev.reverseGeocode,
    continent,
    country,
    cell_era: ev.result.era,
    cell_continent: continent,
    fingerprint: fp,
    dedupe_skip: dedupe,
    selected: false,
    retryOfRejected: retryRow != null,
    originalFingerprint: retryRow?.dedupe_fingerprint ?? null,
  };
}

function incrementalFlush(ctx: HarvestCtx): void {
  flushCaches();
  saveHarvestState(ctx);
  writeHarvestReport(ctx, null, false);
}

async function evaluateAndStoreCandidate(
  ctx: HarvestCtx,
  qid: string,
  era: string,
  roundName: string,
  retryRow: RetryRejectedRow | null
): Promise<void> {
  ctx.evaluatedQids.add(qid);
  operProgress.processed = ctx.evaluatedQids.size;
  try {
    const ev = await evaluateCandidate(qid, era, ctx.eventClasses, ctx.fictionalClasses);
    const row = buildCandidateRow(ctx, qid, era, ev, retryRow);
    ctx.rows.push(row);
    if (row.fingerprint) ctx.existingFingerprints.add(row.fingerprint); // within-run dedupe: first wins
    if (ctx.rows.length % CANDIDATE_FLUSH_N === 0) {
      heartbeat("candidates", `rows=${ctx.rows.length} evaluated=${ctx.evaluatedQids.size} pass=${ctx.rows.filter((r) => r.result.pass).length}`);
      incrementalFlush(ctx);
    }
  } catch (err) {
    stats.errors += 1;
    ctx.harvestLog.push({ round: roundName, era, qid, error: err instanceof Error ? err.message : String(err) });
  }
}

async function evaluateRetryRejectedRows(ctx: HarvestCtx): Promise<number> {
  const roundKey = "retry-rejected";
  if (ctx.completedRounds.has(roundKey) || !ctx.retryRejected.size) return 0;
  const qids = [...ctx.retryRejected.keys()].filter((q) => !ctx.evaluatedQids.has(q));
  if (!qids.length) {
    ctx.completedRounds.add(roundKey);
    return 0;
  }
  console.log(`retry-rejected: re-evaluating ${qids.length} bug-class rejected rows in place`);
  operProgress.total += qids.length;
  await fetchClosure(qids);
  let done = 0;
  for (const qid of qids) {
    if (checkHarvestLimits(ctx)) break;
    await evaluateAndStoreCandidate(ctx, qid, "", "retry-rejected", ctx.retryRejected.get(qid) ?? null);
    done += 1;
  }
  if (!ctx.stopReason) ctx.completedRounds.add(roundKey);
  saveHarvestState(ctx);
  return done;
}

async function harvestRound(
  ctx: HarvestCtx,
  era: string,
  classQids: string[],
  floor: number,
  roundName: string
): Promise<number> {
  const roundKey = `${roundName}|${era}|${floor}|${classQids.join("+")}`;
  if (ctx.completedRounds.has(roundKey)) return 0;
  if (checkHarvestLimits(ctx)) return 0;
  const res = await sparqlClassEra(era, classQids, floor);
  ctx.harvestLog.push({
    round: roundName,
    era,
    classes: classQids.length,
    floor,
    qids: res.qids.length,
    truncated: res.truncated,
    status: res.status,
    error: res.error,
  });
  if (res.error) {
    saveHarvestState(ctx);
    return 0;
  }
  const fresh = res.qids.filter(
    (q) => !ctx.evaluatedQids.has(q) && !ctx.existingQids.has(q)
  );
  operProgress.total += fresh.length;
  if (fresh.length) await fetchClosure(fresh);
  for (const qid of fresh) {
    if (checkHarvestLimits(ctx)) break;
    await evaluateAndStoreCandidate(ctx, qid, era, roundName, ctx.retryRejected.get(qid) ?? null);
  }
  if (!ctx.stopReason) ctx.completedRounds.add(roundKey);
  saveHarvestState(ctx);
  return fresh.length;
}

function quotaPerCell(target: number): number {
  return Math.max(1, Math.ceil(target / 42));
}

/** Select up to quota passers per (era x continent) cell; seeded shuffle. */
function selectQuota(rows: CandidateRow[], target: number, seed: number) {
  const cap = quotaPerCell(target);
  const rng = mulberry32(seed);
  const cells = new Map<string, CandidateRow[]>();
  for (const r of rows) r.selected = false;
  for (const r of rows) {
    if (!r.result.pass || r.dedupe_skip) continue;
    const key = `${r.cell_era}::${r.cell_continent}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(r);
  }
  const selected: CandidateRow[] = [];
  const surplus: CandidateRow[] = [];
  for (const [, cellRows] of cells) {
    const shuffledRows = shuffled(cellRows, rng);
    for (let i = 0; i < shuffledRows.length; i++) {
      if (i < cap) {
        shuffledRows[i].selected = true;
        selected.push(shuffledRows[i]);
      } else {
        surplus.push(shuffledRows[i]);
      }
    }
  }
  return { selected, surplus, cap };
}

function shortCells(rows: CandidateRow[], target: number): Set<string> {
  const cap = quotaPerCell(target);
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.result.pass || r.dedupe_skip) continue;
    const key = `${r.cell_era}::${r.cell_continent}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const short = new Set<string>();
  for (const [k, n] of counts) if (n < cap) short.add(k);
  // cells with zero passers are also short
  for (const era of ERA_BUCKETS) {
    for (const cont of ["Africa", "Asia", "Europe", "North America", "South America", "Oceania", "unknown"]) {
      const k = `${era}::${cont}`;
      if (!counts.has(k)) short.add(k);
    }
  }
  return short;
}

type CandidateWriteStats = {
  new: number;
  rejected: number;
  updated: number;
  skippedConflict: number;
};

function candidateDbPayload(r: CandidateRow, flags: Flags) {
  const status = r.result.pass ? "new" : "rejected";
  const label = r.wd_label ?? r.qid;
  const p31json = JSON.stringify(r.result.p31);
  const citations = JSON.stringify({
    statement_excerpt: r.result.date_prop
      ? `${r.result.date_prop} ${r.result.date_time ?? ""} precision=${r.result.date_precision ?? "?"}`
      : null,
    extracts: Object.fromEntries(
      Object.entries(r.extracts).map(([k, v]) => [k, v ? v.slice(0, 600) : null])
    ),
    reverse_geocode: r.reverse_geocode
      ? {
          country_code: r.reverse_geocode.countryCode,
          display_name: r.reverse_geocode.displayName,
          region_code: r.reverse_geocode.regionCode ?? null,
        }
      : null,
  });
  const quotaBucket = {
    era: r.cell_era,
    continent: r.cell_continent,
    run_id: flags.runId,
    selected: r.selected,
  };
  const checks = JSON.stringify({
    gates: r.result.gates,
    year: r.result.year,
    coord_source: r.result.coord_source,
    era: r.result.era,
    continent: r.cell_continent,
    langs_agreed: r.result.langsAgreed,
    date_prop: r.result.date_prop,
    date_time: r.result.date_time,
    date_precision: r.result.date_precision,
    span_years: r.result.span_years,
    stated_country_isos: r.result.stated_country_isos,
    place_country_isos: r.result.place_country_isos,
    reverse_country_code: r.result.reverse_country_code,
    reverse_region_code: r.reverse_geocode?.regionCode ?? null,
    quota_bucket: quotaBucket,
  });
  return {
    status,
    label,
    p31json,
    citations,
    checks,
    quota: JSON.stringify(quotaBucket),
    fp: r.fingerprint,
    country: r.country,
  };
}

type WriteOutcome = "inserted" | "updated" | "conflict";

async function writeCandidateRow(r: CandidateRow, flags: Flags): Promise<WriteOutcome> {
  const p = candidateDbPayload(r, flags);
  const params = [
    p.status, r.qid, p.label, r.result.year, r.result.date_time, r.result.date_precision,
    r.result.coords?.lat ?? null, r.result.coords?.lon ?? null, r.result.coord_source,
    p.country, r.cell_continent, r.result.sitelinks, p.p31json, p.citations, p.checks,
    p.quota, p.fp, true,
  ];
  if (r.retryOfRejected) {
    const upd = await harvestDb.query<{ status: string }>(
      `UPDATE public.generation_candidates SET
         status=$1, wd_label=$3, event_year=$4, event_date=$5, date_precision=$6,
         latitude=$7, longitude=$8, coord_source=$9, country=$10, continent=$11,
         sitelinks=$12, p31=$13, source_citations=$14, checks=$15, quota_bucket=$16,
         dedupe_fingerprint=$17, real_event=$18
       WHERE wikidata_qid=$2
       RETURNING status`,
      params
    );
    if (upd.rows.length) return "updated";
  }
  const ins = await harvestDb.query<{ status: string }>(
    `INSERT INTO public.generation_candidates
      (status, wikidata_qid, wd_label, event_year, event_date, date_precision,
       latitude, longitude, coord_source, country, continent, sitelinks, p31,
       source_citations, checks, quota_bucket, dedupe_fingerprint, real_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (wikidata_qid) WHERE wikidata_qid IS NOT NULL DO NOTHING
     RETURNING status`,
    params
  );
  return ins.rows.length ? "inserted" : "conflict";
}

function writeHarvestReport(
  ctx: HarvestCtx,
  writeStats: CandidateWriteStats | null,
  final: boolean
) {
  const { selected, surplus, cap } = selectQuota(ctx.rows, ctx.flags.target, ctx.flags.seed);
  const { grid, emptyCells } = gridOf(ctx.rows);
  const gates = gateTable(ctx.rows);
  const passCount = ctx.rows.filter((r) => r.result.pass && !r.dedupe_skip).length;
  const deduped = ctx.rows.filter((r) => r.dedupe_skip).length;
  const elapsedSec = Math.round((Date.now() - ctx.startedAt) / 100) / 10;
  const outPath = resolve(ctx.flags.out);
  const report = {
    meta: {
      task: "EDQ-FIX-HARVESTER-OPS-1126-904",
      runId: ctx.flags.runId,
      target: ctx.flags.target,
      seed: ctx.flags.seed,
      write: ctx.flags.write,
      final,
      stopReason: ctx.stopReason,
      elapsedSec,
      stats,
      nominatimCalls,
      quotaPerCell: cap,
      stateFile: harvestStatePath(ctx.flags),
      rollback: `DELETE FROM public.generation_candidates WHERE quota_bucket->>'run_id' = '${ctx.flags.runId}';`,
    },
    classes: {
      event: ctx.classReport.filter((c) => HINT_CLASS_QIDS.includes(c.qid)),
      fictional: ctx.classReport.filter((c) => FICTIONAL_CANDIDATE_QIDS.includes(c.qid)),
      expansion: ctx.classReport.filter((c) => !HINT_CLASS_QIDS.includes(c.qid) && !FICTIONAL_CANDIDATE_QIDS.includes(c.qid)),
    },
    harvestLog: ctx.harvestLog,
    sparqlTimings,
    gateTable: gates,
    passCount,
    deduped,
    selected: selected.length,
    surplus: surplus.length,
    writeStats: ctx.flags.write ? writeStats : null,
    grid,
    emptyCells,
    evidence: {
      passers: selected.slice(0, 5).map((r) => ({
        qid: r.qid, label: r.wd_label, year: r.result.year, coords: r.result.coords,
        coord_source: r.result.coord_source, era: r.result.era, continent: r.cell_continent,
        gates: r.result.gates, langs_agreed: r.result.langsAgreed,
      })),
      failures: ctx.rows.filter((r) => !r.result.pass && !r.dedupe_skip).slice(0, 5).map((r) => ({
        qid: r.qid, label: r.wd_label, year: r.result.year,
        failed_gates: Object.entries(r.result.gates).filter(([, g]) => !g.ok).map(([k, g]) => ({ gate: k, reason: g.reason })),
      })),
    },
    rows: ctx.rows.map((r) => ({
      qid: r.qid,
      wd_label: r.wd_label,
      pass: r.result.pass,
      selected: r.selected,
      retryOfRejected: r.retryOfRejected,
      dedupe_skip: r.dedupe_skip,
      year: r.result.year,
      coords: r.result.coords,
      coord_source: r.result.coord_source,
      era: r.result.era,
      continent: r.cell_continent,
      country: r.country,
      gates: r.result.gates,
      langs_agreed: r.result.langsAgreed,
      fingerprint: r.fingerprint,
    })),
  };
  writeFileSync(outPath, JSON.stringify(report, null, 1));
  return { selected, surplus, cap, grid, emptyCells, gates, passCount, deduped, elapsedSec, outPath };
}

async function runHarvest(flags: Flags) {
  const startedAt = Date.now();
  runStartedAt = startedAt;
  console.log("=== WD-HARVEST — DRY RUN unless --write ===");
  console.log(`run_id: ${flags.runId}  target: ${flags.target}  seed: ${flags.seed}  mode: ${flags.write ? "WRITE" : "DRY-RUN"} max_minutes=${flags.maxMinutes || "off"} max_queries=${flags.maxQueries || "off"} retry_rejected=${flags.retryRejected}`);

  // 1. Verify event classes by label; drop non-event classes.
  const hintReport = await verifyClassQids(HINT_CLASS_QIDS, (label, e) => {
    if (label && EVENT_LABEL_RE.test(label)) return { ok: true, reason: "event_label" };
    if (isDirectEventSubclass(e)) return { ok: true, reason: "subclass_of_event_root" };
    return { ok: false, reason: `not_event_class:${label ?? "no_label"}` };
  });
  const verifiedHints = hintReport.filter((c) => c.kept).map((c) => c.qid);
  const eventClasses = new Set(verifiedHints);
  console.log("verified event classes:");
  for (const c of hintReport) console.log(`  ${c.kept ? "KEEP" : "DROP"} ${c.qid} "${c.label ?? "-"}" (${c.reason})`);

  const ficReport = await verifyClassQids(FICTIONAL_CANDIDATE_QIDS, (label) =>
    label && FICTION_LABEL_RE.test(label)
      ? { ok: true, reason: "fiction_label" }
      : { ok: false, reason: `not_fiction_class:${label ?? "no_label"}` }
  );
  const fictionalClasses = new Set(ficReport.filter((c) => c.kept).map((c) => c.qid));
  console.log("fictional classes kept:", [...fictionalClasses].join(", ") || "none");

  // 2. Dedupe sets and retry candidates from DB (reads only), then release the DB.
  const existingQids = await loadExistingQids();
  const existingFingerprints = await loadExistingFingerprints();
  const retryRejected = flags.retryRejected ? await loadRetryRejectedRows() : new Map<string, RetryRejectedRow>();
  for (const qid of retryRejected.keys()) existingQids.delete(qid);
  await harvestDb.end();
  console.log(`dedupe: ${existingQids.size} existing qids, ${existingFingerprints.size} fingerprints; retry-rejected candidates=${retryRejected.size}; DB released before network harvest`);

  const ctx: HarvestCtx = {
    flags,
    eventClasses,
    fictionalClasses,
    classReport: [...hintReport, ...ficReport],
    existingQids,
    existingFingerprints,
    retryRejected,
    rows: [],
    evaluatedQids: new Set(),
    completedRounds: new Set(),
    harvestLog: [],
    startedAt,
    stopReason: null,
  };

  const resumed = loadHarvestState(flags);
  if (resumed) {
    ctx.rows = resumed.rows;
    ctx.evaluatedQids = new Set(resumed.evaluatedQids);
    ctx.completedRounds = new Set(resumed.completedRounds);
    ctx.harvestLog = resumed.harvestLog;
    ctx.stopReason = null;
    for (const row of ctx.rows) {
      if (row.fingerprint) ctx.existingFingerprints.add(row.fingerprint);
    }
    console.log(`resume: rows=${ctx.rows.length} evaluated=${ctx.evaluatedQids.size} completed_rounds=${ctx.completedRounds.size}`);
  }

  operProgress.phase = "harvest";
  operProgress.processed = ctx.evaluatedQids.size;
  operProgress.total = ctx.evaluatedQids.size;
  const operTimer = startOperHeartbeat(() => incrementalFlush(ctx));

  if (flags.retryRejected) await evaluateRetryRejectedRows(ctx);

  // 3. Pass 1: strict sitelink floor (MIN_SITELINKS) for every era x class.
  const pass1Classes = verifiedHints;
  for (const era of ERA_BUCKETS) {
    for (const cls of pass1Classes) {
      // per-class queries keep each request small; era loop is outer for readability
      await harvestRound(ctx, era, [cls], MIN_SITELINKS, "strict");
    }
  }
  console.log(`pass1 evaluated candidates: ${ctx.rows.length}`);

  // 4. Relaxation round: relaxed eras whose cells are short re-query at
  //    MIN_SITELINKS_RELAXED (BCE / 0-999 / 1000-1499 only).
  let short = shortCells(ctx.rows, flags.target);
  const shortRelaxedEras = [...new Set([...short].map((k) => k.split("::")[0]))].filter(
    (e) => RELAXED_SITELINK_ERAS.has(e)
  );
  if (shortRelaxedEras.length) {
    console.log(`relaxation round for eras: ${shortRelaxedEras.join(", ")}`);
    for (const era of shortRelaxedEras) {
      for (const cls of pass1Classes) {
        await harvestRound(ctx, era, [cls], MIN_SITELINKS_RELAXED, "relaxed");
      }
    }
  }

  // 5. Expansion round: if still short, add verified subclasses of
  //    Q1190554 / Q13418847 and re-query the deficient eras.
  short = shortCells(ctx.rows, flags.target);
  const shortEras = [...new Set([...short].map((k) => k.split("::")[0]))];
  if (!ctx.stopReason && shortEras.length && ctx.rows.filter((r) => r.result.pass).length < flags.target) {
    console.log(`expansion round for eras: ${shortEras.join(", ")} (passers ${ctx.rows.filter((r) => r.result.pass).length} < ${flags.target})`);
    const subCandidates = await fetchSubclassClasses(["Q1190554", "Q13418847"]);
    if (subCandidates.errors.length) {
      console.log(`expansion SPARQL errors: ${subCandidates.errors.map((e) => `${e.root}@${e.offset}=HTTP${e.status}`).join(", ")}`);
      ctx.harvestLog.push({ round: "expanded", error: "subclass_query_http", details: subCandidates.errors });
    }
    const subQids = subCandidates.classes.map((c) => c.qid).filter((q) => !eventClasses.has(q));
    const subReport = await verifyClassQids(subQids.slice(0, 400), (label, e) => {
      if (label && EVENT_LABEL_RE.test(label)) return { ok: true, reason: "event_label" };
      if (isDirectEventSubclass(e)) return { ok: true, reason: "subclass_of_event_root" };
      return { ok: false, reason: `not_event_class:${label ?? "no_label"}` };
    });
    const newClasses = subReport.filter((c) => c.kept).map((c) => c.qid).slice(0, 60);
    console.log(`expansion classes verified: ${newClasses.length} (of ${subQids.length} subclass candidates)`);
    for (const q of newClasses) eventClasses.add(q);
    ctx.classReport.push(...subReport.filter((c) => c.kept));
    for (const era of shortEras) {
      for (const cls of newClasses) {
        await harvestRound(ctx, era, [cls], MIN_SITELINKS, "expanded");
      }
    }
  }

  // 6. Aggregates + quota selection. Selection is deterministic and surplus
  // passers remain first-class rows so they can be persisted with selected=false.
  const aggregate = writeHarvestReport(ctx, null, false);

  console.log(`\n=== GATE TABLE (n=${ctx.rows.length}) ===`);
  for (const [g, c] of Object.entries(aggregate.gates)) {
    console.log(`  ${g}: pass=${c.pass} fail=${c.fail}`);
  }
  console.log(`passers: ${aggregate.passCount}  dedupe-skipped: ${aggregate.deduped}  selected(new): ${aggregate.selected.length}  surplus: ${aggregate.surplus.length}  quota/cell: ${aggregate.cap}`);
  console.log("\n=== ERA x CONTINENT GRID (pass counts) ===");
  for (const era of ERA_BUCKETS) {
    const cells = Object.entries(aggregate.grid[era]).map(([c, n]) => `${c}=${n}`).join("  ");
    console.log(`  ${era}: ${cells}`);
  }
  console.log(`empty cells: ${aggregate.emptyCells.length}`);
  for (const c of aggregate.emptyCells) console.log(`  EMPTY ${c}`);

  // 7. Optional write — generation_candidates ONLY. Retry-rejected rows UPDATE
  // their existing row by wikidata_qid; all other inserts use ON CONFLICT DO NOTHING.
  const writeStats: CandidateWriteStats = { new: 0, rejected: 0, updated: 0, skippedConflict: 0 };
  if (flags.write) {
    const writeCap = Math.max(0, Math.floor(flags.writeCap));
    const writableRows = ctx.rows.filter((r) => !r.dedupe_skip);
    const toWrite = writableRows.slice(0, writeCap);
    const rejectedCount = toWrite.filter((r) => !r.result.pass).length;
    console.log(`\nWRITE: candidate rows=${toWrite.length}/${writableRows.length} cap=${writeCap} (passers=${toWrite.filter((r) => r.result.pass).length}, selected=${aggregate.selected.length}, surplus=${aggregate.surplus.length}, rejected=${rejectedCount})`);
    operProgress.phase = "write";
    operProgress.processed = 0;
    operProgress.total = toWrite.length;
    let writeFailure: string | null = null;
    for (const r of toWrite) {
      try {
        const outcome = await writeCandidateRow(r, flags);
        if (outcome === "updated") writeStats.updated += 1;
        else if (outcome === "conflict") writeStats.skippedConflict += 1;
        else if (r.result.pass) writeStats.new += 1;
        else writeStats.rejected += 1;
      } catch (err) {
        const e = err as Error & { code?: string };
        writeFailure = `${e.code ?? "db_error"}:${e.message.split("\n")[0]}`;
        stopHarvest(ctx, "db_write_failed_checkpoint_saved");
        incrementalFlush(ctx);
        break;
      }
      const written = writeStats.new + writeStats.rejected + writeStats.updated + writeStats.skippedConflict;
      operProgress.processed = written;
      if (written % CANDIDATE_FLUSH_N === 0) {
        heartbeat("write", `written=${written}/${toWrite.length}`);
        incrementalFlush(ctx);
      }
    }
    await harvestDb.end();
    console.log(`write result: new=${writeStats.new} rejected=${writeStats.rejected} updated=${writeStats.updated} conflicts=${writeStats.skippedConflict}${writeFailure ? ` db_failure=${writeFailure}` : ""}`);
  }

  operProgress.phase = "complete";
  clearInterval(operTimer);
  heartbeat("progress", operProgressDetail());

  saveHarvestState(ctx);
  const finalReport = writeHarvestReport(ctx, flags.write ? writeStats : null, true);
  console.log(`\nreport: ${finalReport.outPath}`);
  console.log(`stats: sparql=${stats.sparql} wikidata=${stats.wikidata} wiki=${stats.wiki} nominatim=${stats.nominatim} retries=${stats.retries} errors=${stats.errors} elapsed=${finalReport.elapsedSec}s`);
  console.log(`ROLLBACK: DELETE FROM public.generation_candidates WHERE quota_bucket->>'run_id' = '${flags.runId}';`);
  if (ctx.stopReason) console.log(`STOPPED EARLY CLEANLY: ${ctx.stopReason}; resume with --resume ${harvestStatePath(flags)}`);
  if (!flags.write) console.log("DRY RUN COMPLETE — generation_candidates untouched (0 writes).");
  flushCaches();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING MODE — report only, zero writes even with --write.
// ─────────────────────────────────────────────────────────────────────────────

type ExistingRow = {
  event_id: string;
  title: string;
  event_year: number;
  qid: string;
  vstatus: string;
  lat: number | null;
  lon: number | null;
};

type ExistingVerdict = {
  event_id?: string;
  title?: string;
  qid?: string;
  stored_year?: number;
  stored_lat?: number | null;
  stored_lon?: number | null;
  wd_label?: string | null;
  verification_status?: string;
  gates_pass?: boolean;
  gates?: FactLockResult["gates"];
  wd_year?: number | null;
  wd_coords?: { lat: number; lon: number } | null;
  coord_source?: string | null;
  year_delta?: number | null;
  year_match?: boolean;
  distance_km?: number | null;
  geo_match?: boolean;
  verdict?: string;
  reasons?: string[];
  error?: string;
};

async function runExisting(flags: Flags) {
  const startedAt = Date.now();
  console.log("=== WD-HARVEST --existing — REPORT ONLY (zero writes) ===");

  const hintReport = await verifyClassQids(HINT_CLASS_QIDS, (label, e) => {
    if (label && EVENT_LABEL_RE.test(label)) return { ok: true, reason: "event_label" };
    if (isDirectEventSubclass(e)) return { ok: true, reason: "subclass_of_event_root" };
    return { ok: false, reason: `not_event_class:${label ?? "no_label"}` };
  });
  const eventClasses = new Set(hintReport.filter((c) => c.kept).map((c) => c.qid));
  const ficReport = await verifyClassQids(FICTIONAL_CANDIDATE_QIDS, (label) =>
    label && FICTION_LABEL_RE.test(label)
      ? { ok: true, reason: "fiction_label" }
      : { ok: false, reason: `not_fiction_class:${label ?? "no_label"}` }
  );
  const fictionalClasses = new Set(ficReport.filter((c) => c.kept).map((c) => c.qid));

  const res = await harvestDb.query<ExistingRow>(
    `SELECT v.event_id, e.title, e.event_year, v.wikidata_qid AS qid, v.status AS vstatus,
            l.latitude AS lat, l.longitude AS lon
       FROM public.event_wikidata_verification v
       JOIN public.events e ON e.id = v.event_id
       LEFT JOIN public.locations l ON l.event_id = e.id
      WHERE v.status IN ('verified','ambiguous','review')
        AND v.wikidata_qid IS NOT NULL`
  );
  console.log(`existing validated events: ${res.rows.length}`);
  await harvestDb.end();

  const qids = [...new Set(res.rows.map((r) => r.qid))];
  await fetchClosure(qids);

  const verdicts: ExistingVerdict[] = [];
  let passGates = 0;
  let matchBoth = 0;
  for (const row of res.rows) {
    const entity = entityCache[row.qid];
    if (!entity) {
      verdicts.push({ event_id: row.event_id, qid: row.qid, error: "entity_not_fetched" });
      continue;
    }
    try {
      const ev = await evaluateCandidate(row.qid, "", eventClasses, fictionalClasses);
      const r = ev.result;
      const yearDelta =
        r.year != null ? Math.abs(r.year - row.event_year) : null;
      const yearMatch = yearDelta != null && yearDelta <= 1;
      const distKm =
        r.coords && row.lat != null && row.lon != null
          ? Math.round(
              haversineDistanceKm(
                { lat: row.lat, lng: row.lon },
                { lat: r.coords.lat, lng: r.coords.lon }
              ) * 1000
            ) / 1000
          : null;
      const geoMatch = distKm != null && distKm <= 50;
      const gatesPass = r.pass;
      if (gatesPass) passGates += 1;
      if (gatesPass && yearMatch && geoMatch) matchBoth += 1;
      const reasons: string[] = [];
      for (const [g, v] of Object.entries(r.gates)) {
        if (!v.ok) reasons.push(`${g}:${v.reason}`);
      }
      if (yearDelta != null && !yearMatch) reasons.push(`year_delta_${yearDelta}`);
      if (distKm == null) reasons.push("geo_unverifiable");
      else if (!geoMatch) reasons.push(`distance_${distKm}km>50`);
      verdicts.push({
        event_id: row.event_id,
        title: row.title,
        stored_year: row.event_year,
        stored_lat: row.lat,
        stored_lon: row.lon,
        qid: row.qid,
        wd_label: wdLabelOf(entity, row.qid),
        verification_status: row.vstatus,
        gates_pass: gatesPass,
        gates: r.gates,
        wd_year: r.year,
        wd_coords: r.coords,
        coord_source: r.coord_source,
        year_delta: yearDelta,
        year_match: yearMatch,
        distance_km: distKm,
        geo_match: geoMatch,
        verdict: gatesPass && yearMatch && geoMatch ? "pass_match" : "fail",
        reasons,
      });
    } catch (err) {
      verdicts.push({
        event_id: row.event_id,
        qid: row.qid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
  const outPath = resolve(flags.out);
  const report = {
    meta: {
      task: "EDQ-BUILD-WDHARVEST-1122-801",
      mode: "existing",
      runId: flags.runId,
      elapsedSec,
      stats,
      nominatimCalls,
      total: res.rows.length,
      gatesPass: passGates,
      passAndMatch: matchBoth,
      writes: 0,
    },
    classes: { event: hintReport, fictional: ficReport },
    verdicts,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 1));
  console.log(`\n=== EXISTING VERDICTS ===`);
  console.log(`total=${res.rows.length} gates_pass=${passGates} pass_and_match=${matchBoth}`);
  for (const v of verdicts.slice(0, 30)) {
    console.log(
      `  ${v.title ?? v.event_id} | qid=${v.qid} | wd_year=${v.wd_year ?? "-"} stored=${v.stored_year} | yd=${v.year_delta ?? "-"} km=${v.distance_km ?? "-"} | ${v.verdict} | ${(v.reasons as string[] | undefined)?.join("; ") ?? v.error ?? ""}`
    );
  }
  console.log(`report: ${outPath}`);
  console.log(`stats: sparql=${stats.sparql} wikidata=${stats.wikidata} wiki=${stats.wiki} nominatim=${stats.nominatim} errors=${stats.errors} elapsed=${elapsedSec}s`);
  console.log("EXISTING REPORT COMPLETE — zero writes.");
  flushCaches();
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseFlags();
  if (!flags.envFile || !existsSync(flags.envFile)) {
    console.error("FATAL: --env-file <path> is required and must exist (read in place; never copied).");
    process.exit(1);
  }
  // Read DB env IN PLACE from the given path — never copy/create/edit .env*.
  dotenv.config({ path: flags.envFile });
  if (!process.env.SUPABASE_DB_CONNECTION) {
    console.error("FATAL: SUPABASE_DB_CONNECTION not set after --env-file load (name only, value never printed).");
    process.exit(1);
  }
  if (!Number.isFinite(flags.writeCap) || flags.writeCap < 0) {
    console.error("FATAL: --write-cap must be a non-negative number.");
    process.exit(1);
  }
  const outDir = dirname(resolve(flags.out));
  mkdirSync(outDir, { recursive: true });
  loadCaches(outDir);
  try {
    if (flags.reclassifyContinents) await runReclassifyContinents(flags);
    else if (flags.existing) await runExisting(flags);
    else await runHarvest(flags);
  } catch (err) {
    flushCaches();
    await harvestDb.end();
    console.error("FATAL:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  await harvestDb.end();
  process.exit(0);
}

main();
