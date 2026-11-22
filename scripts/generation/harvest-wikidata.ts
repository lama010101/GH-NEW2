// EDQ-BUILD-WDHARVEST-1122-801
// Wikidata-first candidate harvester + fact-lock gates (G1-G5) -> stratified
// candidate pool for public.generation_candidates.
//
//   npx tsx scripts/generation/harvest-wikidata.ts \
//     --env-file D:\GH-NEW2\.env.local --target 320 --seed 1122801 \
//     [--write] [--run-id wdh-1122-801] [--out <json>] [--existing]
//
// DRY-RUN by default: zero DB writes. --write inserts ONLY into
// public.generation_candidates (ON CONFLICT wikidata_qid DO NOTHING).
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
import { dbPool } from "../../src/server/db";
import { haversineDistanceKm } from "../../src/core/rules";
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
  existing: boolean;
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
    existing: flags.has("existing"),
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

const stats = {
  sparql: 0,
  wikidata: 0,
  wiki: 0,
  nominatim: 0,
  errors: 0,
};

const lastHit: Record<string, number> = {};
async function throttle(svc: string, gapMs: number) {
  const wait = gapMs - (Date.now() - (lastHit[svc] ?? 0));
  if (wait > 0) await sleep(wait);
  lastHit[svc] = Date.now();
}

type HttpResult = { status: number; body: unknown };

async function fetchJson(
  url: string,
  svc: keyof typeof stats & string,
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
      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxRetries) {
          stats.errors += 1;
          return { status: res.status, body: null };
        }
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
      if (attempt === maxRetries) {
        stats.errors += 1;
        return { status: 0, body: null };
      }
      await sleep(Math.min(16000, 1000 * 2 ** attempt));
    }
  }
  return null;
}

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

async function sparqlClassEra(
  era: string,
  classQids: string[],
  sitelinkFloor: number
): Promise<{ qids: string[]; truncated: boolean } | null> {
  if (!classQids.length) return { qids: [], truncated: false };
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
  const r = await fetchJson(url, "sparql", 1000, 60000, 5);
  stats.sparql += 1;
  if (!r || r.status !== 200 || !r.body) return null;
  const bindings =
    (r.body as { results?: { bindings?: Array<Record<string, { value?: string }>> } })
      ?.results?.bindings ?? [];
  const qids = bindings
    .map((b) => qidOf(b.item?.value))
    .filter((v): v is string => v != null);
  return { qids: [...new Set(qids)], truncated: bindings.length >= 500 };
}

// Subclass expansion roots (CTO spec): Q1190554 occurrence, Q13418847 historical event.
async function fetchSubclassClasses(roots: string[], limit = 2000) {
  const values = roots.map((q) => `wd:${q}`).join(" ");
  const query = `
SELECT DISTINCT ?class ?classLabel WHERE {
  ?class wdt:P279* ?root .
  VALUES ?root { ${values} }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT ${limit}`;
  const url = SPARQL_URL + "?" + new URLSearchParams({ query, format: "json" });
  const r = await fetchJson(url, "sparql", 1000, 60000, 5);
  stats.sparql += 1;
  const bindings =
    (r?.body as { results?: { bindings?: Array<Record<string, { value?: string }>> } } | null)
      ?.results?.bindings ?? [];
  return bindings
    .map((b) => ({ qid: qidOf(b.class?.value) ?? "", label: b.classLabel?.value ?? "" }))
    .filter((c) => /^Q\d+$/.test(c.qid));
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

let wikiCache: Record<string, string | null> = {};
let geoCache: Record<string, { countryCode: string | null; displayName: string | null } | null> = {};
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
): Promise<{ countryCode: string | null; displayName: string | null } | null> {
  const key = `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`;
  if (key in geoCache) return geoCache[key];
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
      zoom: "3",
    });
  const r = await fetchJson(url, "nominatim", 1000, 30000, 3);
  stats.nominatim += 1;
  let out: { countryCode: string | null; displayName: string | null } | null = null;
  if (r && r.status === 200 && r.body && typeof r.body === "object") {
    const b = r.body as { address?: { country_code?: unknown }; display_name?: unknown };
    const cc = b.address?.country_code;
    out = {
      countryCode: typeof cc === "string" && cc ? cc.toUpperCase() : null,
      displayName: typeof b.display_name === "string" ? b.display_name : null,
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
  reverseGeocode: { countryCode: string | null; displayName: string | null } | null;
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
  let geo: { countryCode: string | null; displayName: string | null } | null = null;
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
// Continent from coordinates — documented static bounding table (coarse).
// Boxes are evaluated in array order; first match wins. "Oceania" is allowed.
// ─────────────────────────────────────────────────────────────────────────────

type Box = { name: string; latMin: number; latMax: number; lonMin: number; lonMax: number };
const CONTINENT_BOXES: Box[] = [
  // Oceania first: Pacific islands must not fall into Asia/NorthAmerica.
  { name: "Oceania", latMin: -55, latMax: -5, lonMin: 110, lonMax: 180 }, // Australia, NZ, S.Pacific
  { name: "Oceania", latMin: -55, latMax: 30, lonMin: -180, lonMax: -125 }, // Hawaii + far Pacific
  { name: "Oceania", latMin: -12, latMax: 0, lonMin: 130, lonMax: 155 }, // PNG northern sliver
  { name: "Africa", latMin: -35, latMax: 37, lonMin: -18, lonMax: 52 },
  { name: "Europe", latMin: 36, latMax: 71, lonMin: -25, lonMax: 45 },
  { name: "Asia", latMin: -12, latMax: 78, lonMin: 45, lonMax: 180 }, // incl. SE-Asia islands, Indonesia
  { name: "South America", latMin: -56, latMax: 13, lonMin: -82, lonMax: -34 }, // before NorthAmerica so Colombia/Venezuela stay SA
  { name: "North America", latMin: 5, latMax: 72, lonMin: -170, lonMax: -52 },
];

function continentForCoords(lat: number, lon: number): string {
  for (const b of CONTINENT_BOXES) {
    if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) {
      return b.name;
    }
  }
  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers (reads in dry-run; writes only under --write in harvest mode).
// ─────────────────────────────────────────────────────────────────────────────

async function loadExistingQids(): Promise<Set<string>> {
  const out = new Set<string>();
  const a = await dbPool.query<{ wikidata_qid: string }>(
    "SELECT wikidata_qid FROM public.generation_candidates WHERE wikidata_qid IS NOT NULL"
  );
  for (const r of a.rows) out.add(r.wikidata_qid);
  const b = await dbPool.query<{ wikidata_qid: string }>(
    "SELECT wikidata_qid FROM public.event_wikidata_verification WHERE wikidata_qid IS NOT NULL"
  );
  for (const r of b.rows) out.add(r.wikidata_qid);
  return out;
}

async function loadExistingFingerprints(): Promise<Set<string>> {
  const r = await dbPool.query<{ dedupe_fingerprint: string }>(
    "SELECT dedupe_fingerprint FROM public.generation_candidates WHERE dedupe_fingerprint IS NOT NULL"
  );
  return new Set(r.rows.map((x) => x.dedupe_fingerprint));
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
  reverse_geocode: { countryCode: string | null; displayName: string | null } | null;
  continent: string | null;
  cell_era: string | null;
  cell_continent: string | null;
  fingerprint: string | null;
  dedupe_skip: "qid" | "fingerprint" | null;
  selected: boolean;
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
// HARVEST MODE
// ─────────────────────────────────────────────────────────────────────────────

type HarvestCtx = {
  flags: Flags;
  eventClasses: Set<string>;
  fictionalClasses: Set<string>;
  classReport: ClassEntry[];
  existingQids: Set<string>;
  existingFingerprints: Set<string>;
  rows: CandidateRow[];
  evaluatedQids: Set<string>;
  harvestLog: Array<Record<string, unknown>>;
};

async function harvestRound(
  ctx: HarvestCtx,
  era: string,
  classQids: string[],
  floor: number,
  roundName: string
): Promise<number> {
  const res = await sparqlClassEra(era, classQids, floor);
  ctx.harvestLog.push({
    round: roundName,
    era,
    classes: classQids.length,
    floor,
    qids: res?.qids.length ?? null,
    truncated: res?.truncated ?? null,
    error: res === null,
  });
  if (!res) return 0;
  const fresh = res.qids.filter(
    (q) => !ctx.evaluatedQids.has(q) && !ctx.existingQids.has(q)
  );
  if (!fresh.length) return 0;
  await fetchClosure(fresh);
  for (const qid of fresh) {
    ctx.evaluatedQids.add(qid);
    try {
      const ev = await evaluateCandidate(qid, era, ctx.eventClasses, ctx.fictionalClasses);
      const entity = entityCache[qid];
      const label = wdLabelOf(entity, qid);
      const fp = fingerprintOf(label, ev.result.year);
      let dedupe: CandidateRow["dedupe_skip"] = null;
      if (ctx.existingQids.has(qid)) dedupe = "qid";
      else if (fp && ctx.existingFingerprints.has(fp)) dedupe = "fingerprint";
      const continent =
        ev.result.coords != null ? continentForCoords(ev.result.coords.lat, ev.result.coords.lon) : null;
      ctx.rows.push({
        qid,
        wd_label: label,
        query_eras: [era],
        result: ev.result,
        extracts: ev.extracts,
        reverse_geocode: ev.reverseGeocode,
        continent,
        cell_era: ev.result.era,
        cell_continent: continent,
        fingerprint: fp,
        dedupe_skip: dedupe,
        selected: false,
      });
      if (fp) ctx.existingFingerprints.add(fp); // within-run dedupe: first wins
    } catch (err) {
      stats.errors += 1;
      ctx.harvestLog.push({ round: roundName, era, qid, error: String(err) });
    }
  }
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

async function runHarvest(flags: Flags) {
  const startedAt = Date.now();
  console.log("=== WD-HARVEST — DRY RUN unless --write ===");
  console.log(`run_id: ${flags.runId}  target: ${flags.target}  seed: ${flags.seed}  mode: ${flags.write ? "WRITE" : "DRY-RUN"}`);

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

  // 2. Dedupe sets from DB (reads only).
  const existingQids = await loadExistingQids();
  const existingFingerprints = await loadExistingFingerprints();
  console.log(`dedupe: ${existingQids.size} existing qids, ${existingFingerprints.size} fingerprints`);

  const ctx: HarvestCtx = {
    flags,
    eventClasses,
    fictionalClasses,
    classReport: [...hintReport, ...ficReport],
    existingQids,
    existingFingerprints,
    rows: [],
    evaluatedQids: new Set(),
    harvestLog: [],
  };

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
  if (shortEras.length && ctx.rows.filter((r) => r.result.pass).length < flags.target) {
    console.log(`expansion round for eras: ${shortEras.join(", ")} (passers ${ctx.rows.filter((r) => r.result.pass).length} < ${flags.target})`);
    const subCandidates = await fetchSubclassClasses(["Q1190554", "Q13418847"]);
    const subQids = subCandidates.map((c) => c.qid).filter((q) => !eventClasses.has(q));
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

  // 6. Aggregates + quota selection.
  const { selected, surplus, cap } = selectQuota(ctx.rows, flags.target, flags.seed);
  const { grid, emptyCells } = gridOf(ctx.rows);
  const gates = gateTable(ctx.rows);
  const passCount = ctx.rows.filter((r) => r.result.pass && !r.dedupe_skip).length;
  const deduped = ctx.rows.filter((r) => r.dedupe_skip).length;

  console.log(`\n=== GATE TABLE (n=${ctx.rows.length}) ===`);
  for (const [g, c] of Object.entries(gates)) {
    console.log(`  ${g}: pass=${c.pass} fail=${c.fail}`);
  }
  console.log(`passers: ${passCount}  dedupe-skipped: ${deduped}  selected(new): ${selected.length}  surplus: ${surplus.length}  quota/cell: ${cap}`);
  console.log("\n=== ERA x CONTINENT GRID (pass counts) ===");
  for (const era of ERA_BUCKETS) {
    const cells = Object.entries(grid[era]).map(([c, n]) => `${c}=${n}`).join("  ");
    console.log(`  ${era}: ${cells}`);
  }
  console.log(`empty cells: ${emptyCells.length}`);
  for (const c of emptyCells) console.log(`  EMPTY ${c}`);

  // 7. Optional write — generation_candidates ONLY.
  let writeStats = { new: 0, rejected: 0, skippedConflict: 0 };
  if (flags.write) {
    const toWrite = ctx.rows.filter(
      (r) => !r.dedupe_skip && (r.selected || !r.result.pass)
    );
    console.log(`\nWRITE: inserting ${toWrite.length} rows (new=${selected.length}, rejected=${ctx.rows.filter((r) => !r.dedupe_skip && !r.result.pass).length})`);
    for (const r of toWrite) {
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
            }
          : null,
      });
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
        quota_bucket: { era: r.cell_era, continent: r.cell_continent, run_id: flags.runId },
      });
      const quota = JSON.stringify({ era: r.cell_era, continent: r.cell_continent, run_id: flags.runId });
      const fp = r.fingerprint;
      const country = (() => {
        const p17 = claimItemIds(entityCache[r.qid], "P17")[0];
        return p17 ? (countryLabelOf(p17) ?? r.result.stated_country_isos[0] ?? null) : null;
      })();
      const res = await dbPool.query(
        `INSERT INTO public.generation_candidates
          (status, wikidata_qid, wd_label, event_year, event_date, date_precision,
           latitude, longitude, coord_source, country, continent, sitelinks, p31,
           source_citations, checks, quota_bucket, dedupe_fingerprint, real_event)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (wikidata_qid) WHERE wikidata_qid IS NOT NULL DO NOTHING
         RETURNING status`,
        [
          status, r.qid, label, r.result.year, r.result.date_time, r.result.date_precision,
          r.result.coords?.lat ?? null, r.result.coords?.lon ?? null, r.result.coord_source,
          country, r.cell_continent, r.result.sitelinks, p31json, citations, checks,
          quota, fp, true,
        ]
      );
      if (res.rows.length) {
        if (status === "new") writeStats.new += 1;
        else writeStats.rejected += 1;
      } else writeStats.skippedConflict += 1;
    }
    console.log(`write result: new=${writeStats.new} rejected=${writeStats.rejected} conflicts=${writeStats.skippedConflict}`);
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
  const outPath = resolve(flags.out);
  const report = {
    meta: {
      task: "EDQ-BUILD-WDHARVEST-1122-801",
      runId: flags.runId,
      target: flags.target,
      seed: flags.seed,
      write: flags.write,
      elapsedSec,
      stats,
      nominatimCalls,
      quotaPerCell: cap,
      rollback: `DELETE FROM public.generation_candidates WHERE quota_bucket->>'run_id' = '${flags.runId}';`,
    },
    classes: {
      event: hintReport,
      fictional: ficReport,
      expansion: ctx.classReport.filter((c) => !HINT_CLASS_QIDS.includes(c.qid) && !FICTIONAL_CANDIDATE_QIDS.includes(c.qid)),
    },
    harvestLog: ctx.harvestLog,
    gateTable: gates,
    passCount,
    deduped,
    selected: selected.length,
    surplus: surplus.length,
    writeStats: flags.write ? writeStats : null,
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
      dedupe_skip: r.dedupe_skip,
      year: r.result.year,
      coords: r.result.coords,
      coord_source: r.result.coord_source,
      era: r.result.era,
      continent: r.cell_continent,
      gates: r.result.gates,
      langs_agreed: r.result.langsAgreed,
      fingerprint: r.fingerprint,
    })),
  };
  writeFileSync(outPath, JSON.stringify(report, null, 1));
  console.log(`\nreport: ${outPath}`);
  console.log(`stats: sparql=${stats.sparql} wikidata=${stats.wikidata} wiki=${stats.wiki} nominatim=${stats.nominatim} errors=${stats.errors} elapsed=${elapsedSec}s`);
  console.log(`ROLLBACK: DELETE FROM public.generation_candidates WHERE quota_bucket->>'run_id' = '${flags.runId}';`);
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

  const res = await dbPool.query<ExistingRow>(
    `SELECT v.event_id, e.title, e.event_year, v.wikidata_qid AS qid, v.status AS vstatus,
            l.latitude AS lat, l.longitude AS lon
       FROM public.event_wikidata_verification v
       JOIN public.events e ON e.id = v.event_id
       LEFT JOIN public.locations l ON l.event_id = e.id
      WHERE v.status IN ('verified','ambiguous','review')
        AND v.wikidata_qid IS NOT NULL`
  );
  console.log(`existing validated events: ${res.rows.length}`);

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
  const outDir = dirname(resolve(flags.out));
  mkdirSync(outDir, { recursive: true });
  loadCaches(outDir);
  try {
    if (flags.existing) await runExisting(flags);
    else await runHarvest(flags);
  } catch (err) {
    flushCaches();
    console.error("FATAL:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  process.exit(0);
}

main();
