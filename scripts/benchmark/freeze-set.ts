// EDQ-BUILD-BENCHWIRE-1122-816 — benchmark truth-set freeze script.
//
// Selects eligible events, allocates them across era x continent strata,
// writes a NEW ai_benchmark_sets row (draft -> items -> frozen) plus
// ai_benchmark_set_items, and appends ground_truth_versions rows ONLY for
// events whose current content hash is not already present (append-only,
// never UPDATE).
//
//   --live            perform the writes (default is dry-run: SELECT-only plan)
//   --size=N          target item count (default 150; guard requires >=120)
//   --name=<text>     set name (default bench-v2-<size>)
//   --prompt-version  set prompt_version (default bench-v1)
//   --salt=<text>     deterministic ordering salt (default bench-v2)
//
// Env via `npx tsx --env-file=<path>` (SUPABASE_DB_CONNECTION). Every console
// line passes through redact() — same SECRET-SAFETY block as
// scripts/ai-players/image-chrono-audit.ts.
//
// Eligibility (hard gates — the freeze NEVER includes non-validated or
// retired events):
//   events.status = 'validated' AND retired_at IS NULL
//   AND event_year IS NOT NULL (signed integer; era bucketing needs it)
//   AND has >=1 images row (image-only play)
//   AND has >=1 locations row with non-null lat/lng (truth answer)
//   AND fact-lock pass: NOT in ai_events_needing_review
//        OR linked generation_candidates row with status='checked'
//
// NOTE: ai_benchmark_sets_guard requires >=120 items for draft->frozen
// (migration 20261122130000). Freezing a set smaller than that raises.

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { getDbPool } from "@/server/db";

// ---------------------------------------------------------------------------
// SECRET-SAFETY redactor — identical pattern to image-chrono-audit.ts.
// ---------------------------------------------------------------------------

const SENSITIVE_NAME_RE = /KEY|SECRET|TOKEN|PASSWORD|CONNECTION|PRIVATE/i;
const SECRET_VALUE_RES: readonly RegExp[] = [
  new RegExp("-{5}BEGIN[\\s\\S]*?-{5}", "g"),
  new RegExp("eyJ[A-Za-z0-9_-]{10,}", "g"),
  new RegExp("sk-or-[A-Za-z0-9-]+", "g"),
  new RegExp("AIza[0-9A-Za-z_-]{20,}", "g"),
  new RegExp("Bearer\\s+\\S+", "g"),
  new RegExp("token" + "=[^&\\s]+", "gi"),
  new RegExp("postgres(ql)?" + "://" + "\\S+", "gi"),
];

function secretEnvValues(): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!SENSITIVE_NAME_RE.test(name)) continue;
    if (typeof value === "string" && value.length >= 8) values.push(value);
  }
  return values;
}

const SECRET_VALUES = secretEnvValues();

export function redact(text: string): string {
  let out = text;
  for (const value of SECRET_VALUES) {
    if (value.length > 0) out = out.split(value).join("[REDACTED]");
  }
  for (const re of SECRET_VALUE_RES) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

function log(...args: unknown[]): void {
  console.log(args.map((a) => redact(String(a))).join(" "));
}
function logError(...args: unknown[]): void {
  console.error(args.map((a) => redact(String(a))).join(" "));
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Era buckets — identical boundaries to seed_benchmark_set_v1.sql. */
export function eraBucket(eventYear: number): string {
  if (eventYear < 1500) return "pre_1500";
  if (eventYear < 1800) return "1500_1799";
  if (eventYear < 1900) return "1800_1899";
  if (eventYear < 1950) return "1900_1949";
  if (eventYear < 1990) return "1950_1989";
  return "1990_plus";
}

export type EligibleEventRow = {
  event_id: string;
  event_year: number;
  title: string | null;
  latitude: number;
  longitude: number;
  location_name: string | null;
  country: string | null;
  continent: string | null;
  difficulty: number | null;
  era: string;
  region: string;
  h: string;
};

export type SelectedItem = {
  event: EligibleEventRow;
  stratum: string;
  seq: number;
};

/**
 * Deterministic stratified allocation — port of the seed's SQL algorithm:
 * floor 3 per non-empty stratum (capped at stratum size), remaining slots
 * distributed proportionally to stratum size by largest remainder
 * (ties: md5(era|region|salt), era, region). Within a stratum events are
 * picked by (h, event_id). A top-up pass fills any shortfall from the
 * largest remaining strata so the result is exactly `target` when the pool
 * allows.
 */
export function allocateStrata(
  rows: readonly EligibleEventRow[],
  target: number,
  salt: string
): SelectedItem[] {
  // Group event ids by stratum, each stratum sorted by (h, event_id).
  const strata = new Map<string, EligibleEventRow[]>();
  for (const row of rows) {
    const key = `${row.era}|${row.region}`;
    const list = strata.get(key);
    if (list) list.push(row);
    else strata.set(key, [row]);
  }
  for (const list of strata.values()) {
    list.sort((a, b) => (a.h === b.h ? a.event_id.localeCompare(b.event_id) : a.h < b.h ? -1 : 1));
  }

  const tiny: { key: string; n: number }[] = [];
  const flex: { key: string; n: number; h: string }[] = [];
  let tinyTotal = 0;
  for (const [key, list] of strata) {
    if (list.length <= 3) {
      tiny.push({ key, n: list.length });
      tinyTotal += list.length;
    } else {
      flex.push({ key, n: list.length, h: md5Hex(`${key}|${salt}`) });
    }
  }

  const extraPool = target - tinyTotal - 3 * flex.length;
  const sumFlexN = flex.reduce((acc, f) => acc + f.n, 0);

  // quota per flex stratum: floor(r*n/sumFlexN) + largest-remainder bonus.
  const quotas = flex.map((f) => {
    const exact = sumFlexN > 0 ? (extraPool * f.n) / sumFlexN : 0;
    const qf = Math.floor(exact);
    return { ...f, qf, qrem: exact - qf };
  });
  const leftover = extraPool - quotas.reduce((acc, q) => acc + q.qf, 0);
  quotas.sort((a, b) => {
    if (b.qrem !== a.qrem) return b.qrem - a.qrem;
    if (a.h !== b.h) return a.h < b.h ? -1 : 1;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return 0;
  });
  quotas.forEach((q, i) => {
    q.qf += i < leftover ? 1 : 0;
  });

  const alloc = new Map<string, number>();
  for (const t of tiny) alloc.set(t.key, t.n);
  for (const q of quotas) {
    alloc.set(q.key, Math.min(q.n, Math.max(0, 3 + q.qf)));
  }

  // Pick alloc events per stratum (already sorted by h, event_id).
  const picked: { row: EligibleEventRow; stratum: string }[] = [];
  const pickedIds = new Set<string>();
  for (const [key, list] of strata) {
    const take = Math.min(alloc.get(key) ?? 0, list.length);
    for (let i = 0; i < take; i++) {
      picked.push({ row: list[i], stratum: key });
      pickedIds.add(list[i].event_id);
    }
  }

  // Top-up: fill shortfall deterministically from strata with remaining rows.
  if (picked.length < target) {
    const remainder = rows
      .filter((r) => !pickedIds.has(r.event_id))
      .sort((a, b) => (a.h === b.h ? a.event_id.localeCompare(b.event_id) : a.h < b.h ? -1 : 1));
    for (const row of remainder) {
      if (picked.length >= target) break;
      picked.push({ row, stratum: `${row.era}|${row.region}` });
      pickedIds.add(row.event_id);
    }
  }

  // Final order + seq: by (h, event_id) — same as seed's final row_number.
  picked.sort((a, b) =>
    a.row.h === b.row.h ? a.row.event_id.localeCompare(b.row.event_id) : a.row.h < b.row.h ? -1 : 1
  );
  return picked.slice(0, target).map((p, i) => ({
    event: p.row,
    stratum: p.stratum,
    seq: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// ground_truth_versions helpers — byte-equivalent to
// generate-answers-v3.ts resolveGroundTruthVersion (sha256 of
// stableStringify(content)). That file self-runs main() on import, so the
// helpers are replicated here; the content SHAPE must stay identical or the
// "already present" check breaks.
// ---------------------------------------------------------------------------

export type GroundTruthFields = {
  event_year: number;
  latitude: number;
  longitude: number;
  location_name: string | null;
  title: string | null;
  country: string | null;
  continent: string | null;
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function md5Hex(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

/** Content + hash exactly as resolveGroundTruthVersion computes them. */
export function groundTruthContentAndHash(event: EligibleEventRow): {
  content: GroundTruthFields;
  contentHash: string;
} {
  const content: GroundTruthFields = {
    event_year: event.event_year,
    latitude: event.latitude,
    longitude: event.longitude,
    location_name: event.location_name,
    title: event.title,
    country: event.country,
    continent: event.continent,
  };
  return { content, contentHash: sha256Hex(stableStringify(content)) };
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

export function parseArgs(argv: readonly string[]): {
  live: boolean;
  size: number;
  name: string;
  promptVersion: string;
  salt: string;
} {
  const opt = (name: string): string | null =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1] ?? null;
  const rawSize = opt("size");
  const size = rawSize === null ? 150 : Number(rawSize);
  if (!Number.isInteger(size) || size < 120) {
    logError(`Invalid --size=${rawSize} (expected integer >= 120; freeze guard minimum)`);
    process.exit(1);
  }
  const sizeNum = size as number;
  return {
    live: argv.includes("--live"),
    size: sizeNum,
    name: opt("name") ?? `bench-v2-${sizeNum}`,
    promptVersion: opt("prompt-version") ?? "bench-v1",
    salt: opt("salt") ?? "bench-v2",
  };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * Eligible pool: validated + not retired + year + image + coord location +
 * fact-lock pass (no needing_review flag OR a linked 'checked' candidate).
 * Representative location = first non-null-coords row by (created_at, id) —
 * deterministic, same fields the GT content hash consumes.
 */
const ELIGIBLE_SQL = `
WITH loc AS (
  SELECT DISTINCT ON (l.event_id)
    l.event_id, l.latitude, l.longitude, l.display_name, l.country, l.continent
  FROM public.locations l
  WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
  ORDER BY l.event_id, l.id ASC
),
eligible AS (
  SELECT
    e.id AS event_id,
    e.event_year,
    e.title,
    loc.latitude,
    loc.longitude,
    loc.display_name AS location_name,
    loc.country,
    loc.continent,
    d.avg_difficulty_score AS difficulty,
    COALESCE(loc.continent, 'unknown') AS region,
    md5(e.id::text || '|' || $2) AS h
  FROM public.events e
  JOIN loc ON loc.event_id = e.id
  LEFT JOIN public.ai_event_ai_difficulty d ON d.event_id = e.id
  WHERE e.status = 'validated'
    AND e.retired_at IS NULL
    AND e.event_year IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.images i WHERE i.event_id = e.id)
    AND (
      NOT EXISTS (SELECT 1 FROM public.ai_events_needing_review r WHERE r.event_id = e.id)
      OR EXISTS (
        SELECT 1 FROM public.generation_candidates gc
        WHERE gc.event_id = e.id AND gc.status = 'checked'
      )
    )
)`;

// era is computed in TS by eraBucket() (single source — no SQL/TS drift).
// region = locations.continent of the representative location.

const ELIGIBLE_QUERY = `${ELIGIBLE_SQL}
SELECT event_id, event_year, title, latitude, longitude, location_name,
       country, continent, difficulty, region, h
FROM eligible
ORDER BY h, event_id`;

const GT_PRESENT_SQL = `SELECT event_id, content_hash FROM public.ground_truth_versions
  WHERE event_id = ANY($1::uuid[])`;

const GT_MAX_VERSION_SQL = `SELECT event_id, MAX(version) AS max_version
  FROM public.ground_truth_versions WHERE event_id = ANY($1::uuid[])
  GROUP BY event_id`;

const GT_INSERT_SQL = `INSERT INTO public.ground_truth_versions (event_id, version, content_hash, content)
  VALUES ($1, $2, $3, $4) RETURNING id`;

const SET_VERSION_SQL = `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM public.ai_benchmark_sets`;

const SET_INSERT_SQL = `INSERT INTO public.ai_benchmark_sets (version, name, status, prompt_version)
  VALUES ($1, $2, 'draft', $3) RETURNING id`;

const ITEMS_INSERT_SQL = `INSERT INTO public.ai_benchmark_set_items
  (set_id, event_id, stratum, era, region, difficulty, seq)
  VALUES ($1, $2, $3, $4, $5, $6, $7)`;

const SET_FREEZE_SQL = `UPDATE public.ai_benchmark_sets
  SET status = 'frozen', frozen_at = now()
  WHERE id = $1 AND status = 'draft'`;

// ---------------------------------------------------------------------------
// GT version insert — append-only, never UPDATE. Mirrors the worker's
// check-then-insert with a bounded 23505 retry.
// ---------------------------------------------------------------------------

async function ensureGroundTruthVersions(
  pool: Pool,
  items: readonly SelectedItem[]
): Promise<{ present: number; inserted: number }> {
  const eventIds = items.map((i) => i.event.event_id);
  const hashes = items.map((i) => groundTruthContentAndHash(i.event));

  const presentRows = await pool.query<{ event_id: string; content_hash: string }>(GT_PRESENT_SQL, [
    eventIds,
  ]);
  const presentSet = new Set(presentRows.rows.map((r) => `${r.event_id}|${r.content_hash}`));

  const maxVerRows = await pool.query<{ event_id: string; max_version: number }>(GT_MAX_VERSION_SQL, [
    eventIds,
  ]);
  const nextVersion = new Map(maxVerRows.rows.map((r) => [r.event_id, (r.max_version ?? 0) + 1]));

  let present = 0;
  let inserted = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { content, contentHash } = hashes[i];
    const key = `${item.event.event_id}|${contentHash}`;
    if (presentSet.has(key)) {
      present++;
      continue;
    }
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const version = nextVersion.get(item.event.event_id) ?? 1;
      try {
        await pool.query(GT_INSERT_SQL, [
          item.event.event_id,
          version,
          contentHash,
          JSON.stringify(content),
        ]);
        nextVersion.set(item.event.event_id, version + 1);
        presentSet.add(key);
        inserted++;
        done = true;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "23505") {
          // Either the hash appeared concurrently (present) or the version
          // collided — re-check the hash, then retry with version+1.
          const recheck = await pool.query<{ id: string }>(
            "SELECT id FROM public.ground_truth_versions WHERE event_id = $1 AND content_hash = $2 LIMIT 1",
            [item.event.event_id, contentHash]
          );
          if (recheck.rows.length > 0) {
            presentSet.add(key);
            present++;
            done = true;
          } else {
            nextVersion.set(item.event.event_id, version + 1);
          }
        } else {
          throw err;
        }
      }
    }
    if (!done) {
      throw new Error(`ground_truth_versions insert failed for event ${item.event.event_id}`);
    }
  }
  return { present, inserted };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

type EligibleDbRow = Omit<EligibleEventRow, "era">;

async function main(): Promise<void> {
  const { live, size, name, promptVersion, salt } = parseArgs(process.argv.slice(2));

  const pool = getDbPool();

  const eligibleResult = await pool.query<EligibleDbRow>(ELIGIBLE_QUERY, [size, salt]);
  const eligible: EligibleEventRow[] = eligibleResult.rows.map((r) => ({
    ...r,
    era: eraBucket(r.event_year),
  }));
  log(`[FREEZE] Eligible events: ${eligible.length} (target ${size})`);
  if (eligible.length < 120) {
    logError(`[FREEZE] Only ${eligible.length} eligible events (< 120 freeze minimum) — aborting`);
    await pool.end();
    process.exit(1);
    return;
  }

  const items = allocateStrata(eligible, size, salt);
  log(`[FREEZE] Selected ${items.length} items across ${new Set(items.map((i) => i.stratum)).size} strata`);

  // Stratification report era x continent.
  const strataReport = new Map<string, number>();
  for (const item of items) {
    const [era, region] = item.stratum.split("|");
    const key = `${era} x ${region}`;
    strataReport.set(key, (strataReport.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...strataReport.entries()].sort()) {
    log(`[STRATUM] ${key}: ${n}`);
  }

  // GT reconciliation: which selected events already have a v-current hash.
  const hashes = items.map((i) => ({ item: i, ...groundTruthContentAndHash(i.event) }));
  const eventIds = items.map((i) => i.event.event_id);
  const existing = await pool.query<{ event_id: string; content_hash: string }>(GT_PRESENT_SQL, [
    eventIds,
  ]);
  const existingSet = new Set(existing.rows.map((r) => `${r.event_id}|${r.content_hash}`));
  let gtPresent = 0;
  const reconciliation: string[] = [];
  for (const h of hashes) {
    const has = existingSet.has(`${h.item.event.event_id}|${h.contentHash}`);
    if (has) gtPresent++;
    reconciliation.push(
      `  seq=${h.item.seq} event=${h.item.event.event_id} year=${h.item.event.event_year} gt=${has ? "present" : "NEW"}`
    );
  }
  log(`[RECONCILE] ground_truth_versions rows already present for current hash: ${gtPresent}/${items.length}; to insert: ${items.length - gtPresent}`);
  if (!live) {
    for (const line of reconciliation) log(line);
  }

  const nextVersionResult = await pool.query<{ next_version: number }>(SET_VERSION_SQL);
  const nextVersion = nextVersionResult.rows[0].next_version;
  log(`[FREEZE] Plan: new set version=${nextVersion} name='${name}' prompt_version='${promptVersion}' items=${items.length} status draft->frozen`);

  if (!live) {
    log("[FREEZE] Dry-run: SELECT-only plan printed; pass --live to write.");
    await pool.end();
    return;
  }

  // Live write — single transaction: set(draft) -> items -> GT versions -> freeze.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const setResult = await client.query<{ id: string }>(SET_INSERT_SQL, [
      nextVersion,
      name,
      promptVersion,
    ]);
    const setId = setResult.rows[0].id;
    log(`[FREEZE] Created set ${setId} (version ${nextVersion}, draft)`);

    for (const item of items) {
      const [era, region] = item.stratum.split("|");
      await client.query(ITEMS_INSERT_SQL, [
        setId,
        item.event.event_id,
        item.stratum,
        era,
        region,
        item.event.difficulty,
        item.seq,
      ]);
    }
    log(`[FREEZE] Inserted ${items.length} set items`);

    const gt = await ensureGroundTruthVersions(client as unknown as Pool, items);
    log(`[FREEZE] ground_truth_versions: ${gt.present} already present, ${gt.inserted} inserted`);

    const freezeResult = await client.query(SET_FREEZE_SQL, [setId]);
    if (freezeResult.rowCount !== 1) {
      throw new Error(`freeze UPDATE affected ${freezeResult.rowCount} rows (expected 1)`);
    }
    await client.query("COMMIT");
    log(`[FREEZE] Set ${setId} frozen (version ${nextVersion}, ${items.length} items)`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    logError("Unexpected error:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
