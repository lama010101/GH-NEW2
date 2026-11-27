// EDQ-BUILD-CORRECTIONLOOP-1126-898
// Correction-loop CLI. Runs under `npx tsx`, binds SUPABASE_DB_CONNECTION
// in-process via dotenv exactly like review-cli.ts (.env.local in cwd, fallback
// D:/GH-NEW2/.env.local), prints ONLY JSON on stdout — diagnostics to stderr,
// secrets never print.
//
//   npx tsx scripts/factcheck/corrections-cli.ts plan [--json]
//   npx tsx scripts/factcheck/corrections-cli.ts quarantine [--commit]
//   npx tsx scripts/factcheck/corrections-cli.ts enqueue [--commit]
//   npx tsx scripts/factcheck/corrections-cli.ts claim --worker <ID> [--n 8] [--lease-min 30]
//   npx tsx scripts/factcheck/corrections-cli.ts record --worker <ID> --file <result.json>
//   npx tsx scripts/factcheck/corrections-cli.ts apply --worker <ID> [--max 8] [--commit]
//   npx tsx scripts/factcheck/corrections-cli.ts revert --event <uuid> | --run <run_id> [--commit]
//   npx tsx scripts/factcheck/corrections-cli.ts report
//   npx tsx scripts/factcheck/corrections-cli.ts selftest

import dotenv from "dotenv";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { Pool, type PoolClient } from "pg";
import {
  FACT_CHECK_VERDICTS,
  RELIABILITY_PLAY_MIN,
  computeReliability,
  type FactCheckVerdict,
} from "../../src/core/eventReliability";
import {
  CORRECTION_CANDIDATE_PRIORITY_MULTI_SOURCE,
  CORRECTION_CANDIDATE_PRIORITY_SINGLE_SOURCE,
  CORRECTION_MIN_INDEPENDENT_DOMAINS,
  CORRECTION_MIN_SOURCES,
  CORRECTION_PROTOCOL,
  CORRECTION_REVIEW_PRIORITY,
  SOFT_REVIEW_VERDICTS,
  WRONG_EVENT_VERDICTS,
  applyCorrectionPatch,
  classifyCorrectionCandidate,
  correctionApplySkipReason,
  correctionValuesEqual,
  countIndependentDomains,
  effectiveCorrectionPatch,
  parseCorrectionYear,
  type ApplySkipReason,
  type CorrectionPatch,
  type StoredEventFacts,
} from "../../src/core/eventCorrections";

const ENV_CANDIDATES = [".env.local", "D:/GH-NEW2/.env.local"];
for (const p of ENV_CANDIDATES) {
  if (existsSync(resolve(p))) dotenv.config({ path: resolve(p), quiet: true });
  if (process.env.SUPABASE_DB_CONNECTION) break;
}
const CONN = process.env.SUPABASE_DB_CONNECTION;
if (!CONN) {
  console.error("SUPABASE_DB_CONNECTION not bound");
  process.exit(1);
}
const pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
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

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[]; rowCount?: number | null }>;
};

function q(client: PoolClient | Pool): Queryable {
  return client as unknown as Queryable;
}

function redactText(input: string): string {
  let out = input;
  for (const [name, value] of Object.entries(process.env)) {
    if (!SENSITIVE_NAME_RE.test(name) || typeof value !== "string" || value.length < 8) continue;
    out = out.split(value).join("[redacted]");
  }
  for (const pattern of SECRET_VALUE_RES) out = out.replace(pattern, "[redacted]");
  return out;
}

function writeJson(value: unknown): void {
  process.stdout.write(redactText(JSON.stringify(value)) + "\n");
}

function shortError(e: unknown): string {
  const first = e instanceof Error ? e.message.split("\n")[0] : "error";
  return redactText(first.slice(0, 180));
}

function parseArgs(argv: string[]): { cmd: string; flags: Map<string, string> } {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 2) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags.set(a.slice(2), argv[++i]);
      else flags.set(a.slice(2), "true");
    } else positional.push(a);
  }
  return { cmd: positional[0] ?? "", flags };
}

function hasCommit(flags: Map<string, string>): boolean {
  return flags.get("commit") === "true";
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function asCorrectionPatch(value: unknown): CorrectionPatch {
  if (!isObject(value)) return {};
  const out: CorrectionPatch = {};
  if (typeof value.title === "string" && value.title.trim() !== "") out.title = value.title.trim();
  const year = parseCorrectionYear(value.year);
  if (year !== null) out.year = year;
  if (typeof value.description === "string") out.description = value.description;
  return out;
}

function eventFacts(row: Record<string, any>): StoredEventFacts {
  return {
    title: String(row.title ?? ""),
    description: row.description == null ? null : String(row.description),
    event_year: Number(row.event_year),
  };
}

function logFacts(row: Record<string, any>): Record<string, unknown> {
  return {
    title: row.title ?? null,
    description: row.description ?? null,
    event_year: row.event_year ?? null,
    status: row.status ?? null,
    retired_at: row.retired_at ?? null,
  };
}

function eventSourceHash(fields: { title: unknown; description: unknown; category: unknown; theme: unknown }): string {
  const joined = [fields.title, fields.description, fields.category, fields.theme]
    .map((v) => (v == null ? "" : String(v)))
    .join("\u241f");
  return createHash("sha256").update(joined, "utf8").digest("hex");
}

async function loadWrongLatestRows(client: PoolClient | Pool): Promise<Record<string, any>[]> {
  const res = await q(client).query(
    `with latest as (
       select distinct on (f.event_id)
              f.event_id, f.id as check_id, f.verdict, f.reliability, f.n_sources,
              f.corrected, f.checker, f.protocol, f.checked_at
         from public.event_fact_checks f
        where f.verdict = any($1::text[])
        order by f.event_id, f.checked_at desc, f.id desc
     )
     select e.id as event_id, e.title, e.description, e.event_year, e.category, e.theme,
            e.status, e.retired_at,
            loc.display_name, loc.country,
            latest.check_id, latest.verdict, latest.reliability, latest.n_sources,
            latest.corrected, latest.checker, latest.protocol, latest.checked_at
       from latest
       join public.events e on e.id = latest.event_id
       left join lateral (
         select l.display_name, l.country from public.locations l where l.event_id = e.id limit 1
       ) loc on true
      order by e.id`,
    [WRONG_EVENT_VERDICTS]
  );
  return res.rows;
}

function classifyWrongRow(row: Record<string, any>) {
  return classifyCorrectionCandidate({
    verdict: String(row.verdict),
    retired: row.retired_at != null,
    stored: eventFacts(row),
    corrected: row.corrected,
    storedPlace: { display_name: row.display_name ?? null, country: row.country ?? null },
  });
}

async function selectQuarantineRows(client: PoolClient | Pool): Promise<Record<string, any>[]> {
  const res = await q(client).query(
    `select e.id as event_id, e.status, e.retired_at, er.verdict, er.reliability, er.n_sources,
            f.id as check_id
       from public.events e
       join public.event_reliability er on er.event_id = e.id
       join lateral (
         select fc.id from public.event_fact_checks fc
          where fc.event_id = e.id
          order by fc.checked_at desc, fc.id desc limit 1
       ) f on true
      where e.status = 'validated'
        and e.retired_at is null
        and er.verdict = any($1::text[])
        and er.reliability = 0
        and er.n_sources >= $2
      order by e.id`,
    [WRONG_EVENT_VERDICTS, CORRECTION_MIN_SOURCES]
  );
  return res.rows;
}

async function selectSoftRequeueRows(client: PoolClient | Pool): Promise<Record<string, any>[]> {
  const res = await q(client).query(
    `with latest as (
       select distinct on (f.event_id) f.event_id, f.verdict
         from public.event_fact_checks f
        order by f.event_id, f.checked_at desc, f.id desc
     )
     select e.id as event_id, latest.verdict
       from public.events e
       join latest on latest.event_id = e.id
      where e.status = 'validated'
        and e.retired_at is null
        and latest.verdict = any($1::text[])
        and not exists (
          select 1 from public.event_review_queue rq
           where rq.event_id = e.id and rq.done_at is null
        )
      order by e.id`,
    [SOFT_REVIEW_VERDICTS]
  );
  return res.rows;
}

async function candidateStateCounts(client: PoolClient | Pool): Promise<Record<string, number>> {
  const res = await q(client).query(
    "select state, count(*)::int as n from public.event_correction_candidates group by state"
  );
  return Object.fromEntries(res.rows.map((r) => [String(r.state), Number(r.n)]));
}

async function cmdPlan(): Promise<void> {
  const wrongRows = await loadWrongLatestRows(pool);
  const classified = wrongRows.map((row) => ({ row, cls: classifyWrongRow(row) }));
  const open = classified.filter((x) => x.cls.state === "open");
  const skipped = classified.filter((x) => x.cls.state === "skipped");
  const quarantine = await selectQuarantineRows(pool);
  const soft = await selectSoftRequeueRows(pool);
  const softInPlay = await q(pool).query(
    `with latest as (
       select distinct on (f.event_id) f.event_id, f.verdict
         from public.event_fact_checks f order by f.event_id, f.checked_at desc, f.id desc
     )
     select count(*)::int as n,
            count(*) filter (where exists (
              select 1 from public.event_review_queue rq where rq.event_id = e.id and rq.done_at is null
            ))::int as already_open
       from public.events e join latest on latest.event_id = e.id
      where e.status='validated' and e.retired_at is null and latest.verdict = any($1::text[])`,
    [SOFT_REVIEW_VERDICTS]
  );
  const existingCandidates = await candidateStateCounts(pool).catch(() => ({}));
  writeJson({
    wrong_events_total: wrongRows.length,
    quarantine_candidates: { count: quarantine.length },
    correction_candidates: {
      open: open.length,
      skipped: skipped.length,
      by_skip_reason: countBy(skipped, (x) => x.cls.state === "skipped" ? x.cls.skip_reason : "none"),
      priority_open: countBy(open, (x) => String(Number(x.row.n_sources) >= CORRECTION_MIN_SOURCES
        ? CORRECTION_CANDIDATE_PRIORITY_MULTI_SOURCE
        : CORRECTION_CANDIDATE_PRIORITY_SINGLE_SOURCE)),
    },
    existing_correction_candidates_by_state: existingCandidates,
    soft_events: {
      in_play: Number(softInPlay.rows[0]?.n ?? 0),
      already_open_in_review_queue: Number(softInPlay.rows[0]?.already_open ?? 0),
      eligible_for_requeue: soft.length,
    },
  });
}

async function cmdQuarantine(commit: boolean): Promise<void> {
  const rows = await selectQuarantineRows(pool);
  if (!commit) {
    writeJson({
      commit: false,
      count: rows.length,
      ids: rows.map((r) => r.event_id),
      rows: rows.map((r) => ({ event_id: r.event_id, verdict: r.verdict, reliability: r.reliability, check_id: r.check_id })),
    });
    return;
  }

  const runId = "corr-quarantine-1126-898";
  const client = await pool.connect();
  const applied: Record<string, any>[] = [];
  try {
    await client.query("begin");
    for (const row of rows) {
      const upd = await q(client).query(
        `update public.events set retired_at = now()
          where id = $1 and status = 'validated' and retired_at is null
          returning id, status, retired_at`,
        [row.event_id]
      );
      if ((upd.rowCount ?? 0) === 0) continue;
      const after = upd.rows[0];
      const log = await q(client).query(
        `insert into public.event_correction_log
           (run_id, event_id, action, before, after, check_id, applied_by)
         values ($1,$2,'quarantined',$3::jsonb,$4::jsonb,$5,$6)
         returning id`,
        [
          runId,
          row.event_id,
          JSON.stringify({ status: row.status, retired_at: row.retired_at }),
          JSON.stringify({ status: after.status, retired_at: after.retired_at }),
          row.check_id,
          "corrections-cli",
        ]
      );
      applied.push({ event_id: row.event_id, log_id: log.rows[0]?.id ?? null, retired_at: after.retired_at });
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  writeJson({ commit: true, run_id: runId, count: applied.length, applied });
}

async function cmdEnqueue(commit: boolean): Promise<void> {
  const wrongRows = await loadWrongLatestRows(pool);
  const classified = wrongRows.map((row) => ({ row, cls: classifyWrongRow(row) }));
  const open = classified.filter((x) => x.cls.state === "open");
  const skipped = classified.filter((x) => x.cls.state === "skipped");
  const softRows = await selectSoftRequeueRows(pool);

  if (!commit) {
    writeJson({
      commit: false,
      wrong_events_total: wrongRows.length,
      candidates_open: open.length,
      candidates_skipped: skipped.length,
      by_skip_reason: countBy(skipped, (x) => x.cls.state === "skipped" ? x.cls.skip_reason : "none"),
      soft_events_to_requeue: softRows.length,
      open_ids: open.map((x) => x.row.event_id),
      soft_ids: softRows.map((r) => r.event_id),
    });
    return;
  }

  const client = await pool.connect();
  let candidateWrites = 0;
  let softWrites = 0;
  try {
    await client.query("begin");
    for (const item of classified) {
      const row = item.row;
      const isOpen = item.cls.state === "open";
      const proposed = isOpen ? item.cls.proposed : {};
      const priority = isOpen
        ? Number(row.n_sources) >= CORRECTION_MIN_SOURCES
          ? CORRECTION_CANDIDATE_PRIORITY_MULTI_SOURCE
          : CORRECTION_CANDIDATE_PRIORITY_SINGLE_SOURCE
        : 0;
      const skipReason = item.cls.state === "skipped" ? item.cls.skip_reason : null;
      const res = await q(client).query(
        `insert into public.event_correction_candidates
           (event_id, source_check_id, proposed, state, skip_reason, priority)
         values ($1,$2,$3::jsonb,$4,$5,$6)
         on conflict (event_id) do update
            set source_check_id = excluded.source_check_id,
                proposed = excluded.proposed,
                state = excluded.state,
                skip_reason = excluded.skip_reason,
                priority = excluded.priority,
                claimed_by = null,
                claimed_at = null,
                lease_until = null,
                updated_at = now()
          where event_correction_candidates.state in ('open','skipped')`,
        [row.event_id, row.check_id, JSON.stringify(proposed), isOpen ? "open" : "skipped", skipReason, priority]
      );
      candidateWrites += res.rowCount ?? 0;
    }
    for (const row of softRows) {
      const res = await q(client).query(
        `insert into public.event_review_queue (event_id, priority, claimed_by, claimed_at, lease_until, done_at)
         values ($1,$2,null,null,null,null)
         on conflict (event_id) do update
            set priority = excluded.priority,
                claimed_by = null,
                claimed_at = null,
                lease_until = null,
                done_at = null`,
        [row.event_id, CORRECTION_REVIEW_PRIORITY]
      );
      softWrites += res.rowCount ?? 0;
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  writeJson({
    commit: true,
    wrong_events_total: wrongRows.length,
    candidates_open: open.length,
    candidates_skipped: skipped.length,
    by_skip_reason: countBy(skipped, (x) => x.cls.state === "skipped" ? x.cls.skip_reason : "none"),
    candidate_rows_written: candidateWrites,
    soft_events_to_requeue: softRows.length,
    soft_rows_written: softWrites,
  });
}

async function cmdClaim(worker: string, n: number, leaseMin: number): Promise<void> {
  const claimed = await q(pool).query(
    "select event_id from public.claim_correction_events($1,$2,$3)",
    [worker, n, leaseMin]
  );
  const ids = claimed.rows.map((r) => r.event_id);
  if (ids.length === 0) {
    writeJson([]);
    return;
  }
  const det = await q(pool).query(
    `select c.event_id, c.proposed, e.title, e.description, e.event_year,
            loc.display_name, loc.country
       from public.event_correction_candidates c
       join public.events e on e.id = c.event_id
       left join lateral (
         select l.display_name, l.country from public.locations l where l.event_id = e.id limit 1
       ) loc on true
      where c.event_id = any($1::uuid[])
      order by c.priority desc, c.event_id`,
    [ids]
  );
  writeJson(det.rows.map((row) => ({
    event_id: row.event_id,
    stored: {
      title: row.title,
      description: row.description,
      event_year: row.event_year,
      location: row.display_name == null && row.country == null ? null : {
        display_name: row.display_name,
        country: row.country,
      },
    },
    proposed: asCorrectionPatch(row.proposed),
  })));
}

type SourceIn = { url: string; domain: string; quote: string };
type RecordIn = {
  event_id: string;
  verdict: string;
  title_ok?: boolean | null;
  year_ok?: boolean | null;
  place_ok?: boolean | null;
  sources?: unknown;
  corrected?: Record<string, unknown> | null;
  notes?: string;
};

function validateRecord(raw: unknown, idx: number): { ok: true; rec: RecordIn & { sources: SourceIn[] } } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `record[${idx}]: not an object` };
  }
  const r = raw as RecordIn;
  if (typeof r.event_id !== "string" || !UUID_RE.test(r.event_id)) {
    return { ok: false, error: `record[${idx}]: event_id missing/not uuid` };
  }
  if (typeof r.verdict !== "string" || !(FACT_CHECK_VERDICTS as readonly string[]).includes(r.verdict)) {
    return { ok: false, error: `record[${idx}]: verdict invalid` };
  }
  for (const k of ["title_ok", "year_ok", "place_ok"] as const) {
    const v = r[k];
    if (v !== undefined && v !== null && typeof v !== "boolean") {
      return { ok: false, error: `record[${idx}]: ${k} must be boolean|null` };
    }
  }
  if (!Array.isArray(r.sources)) {
    return { ok: false, error: `record[${idx}]: sources must be an array` };
  }
  const sources: SourceIn[] = [];
  for (let i = 0; i < r.sources.length; i++) {
    const s = r.sources[i] as Record<string, unknown>;
    if (s == null || typeof s !== "object") return { ok: false, error: `record[${idx}].sources[${i}]: not an object` };
    const { url, domain, quote } = s as { url?: unknown; domain?: unknown; quote?: unknown };
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: `record[${idx}].sources[${i}]: url missing/not http(s)` };
    }
    if (typeof domain !== "string" || !DOMAIN_RE.test(domain)) {
      return { ok: false, error: `record[${idx}].sources[${i}]: domain missing/invalid` };
    }
    if (typeof quote !== "string" || quote.trim() === "") {
      return { ok: false, error: `record[${idx}].sources[${i}]: quote missing` };
    }
    const words = quote.trim().split(/\s+/).length;
    if (words > 25) {
      return { ok: false, error: `record[${idx}].sources[${i}]: quote exceeds 25 words (${words})` };
    }
    sources.push({ url, domain: domain.toLowerCase(), quote: quote.trim() });
  }
  if (r.corrected !== undefined && r.corrected !== null && !isObject(r.corrected)) {
    return { ok: false, error: `record[${idx}]: corrected must be an object|null` };
  }
  return { ok: true, rec: { ...r, sources } as RecordIn & { sources: SourceIn[] } };
}

function domainsFromSources(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  return sources.map((s) => {
    if (!isObject(s)) return "";
    if (typeof s.domain === "string") return s.domain.toLowerCase();
    if (typeof s.url === "string") return domainOf(s.url);
    return "";
  }).filter((d) => d !== "");
}

async function recordOne(client: PoolClient, worker: string, rec: RecordIn & { sources: SourceIn[] }): Promise<Record<string, unknown>> {
  const candRes = await q(client).query(
    "select * from public.event_correction_candidates where event_id=$1 for update",
    [rec.event_id]
  );
  if (candRes.rows.length === 0) return { event_id: rec.event_id, ok: false, error: "no correction candidate" };
  const cand = candRes.rows[0];
  if (cand.state !== "claimed" || cand.claimed_by !== worker) {
    return { event_id: rec.event_id, ok: false, error: "candidate is not claimed by this worker" };
  }
  const dup = await q(client).query(
    "select 1 from public.event_fact_checks where event_id=$1 and checker=$2 and protocol=$3 limit 1",
    [rec.event_id, worker, CORRECTION_PROTOCOL]
  );
  if (dup.rows.length > 0) {
    return { event_id: rec.event_id, ok: false, error: "duplicate: same worker+event+protocol already recorded" };
  }

  const verdict = rec.verdict as FactCheckVerdict;
  const domains = domainsFromSources(rec.sources);
  const rel = computeReliability({
    verdict,
    title_ok: rec.title_ok ?? null,
    year_ok: rec.year_ok ?? null,
    place_ok: rec.place_ok ?? null,
    n_sources: rec.sources.length,
    independentDomains: countIndependentDomains(domains),
  });
  const corrected = rec.corrected && isObject(rec.corrected) ? rec.corrected : null;
  await q(client).query(
    `insert into public.event_fact_checks
       (event_id, run_id, protocol, verdict, title_ok, year_ok, place_ok,
        n_sources, sources, corrected, needs_recheck, reliability, checker)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`,
    [
      rec.event_id,
      `corr-v1-${worker}`,
      CORRECTION_PROTOCOL,
      rel.verdict,
      rec.title_ok ?? null,
      rec.year_ok ?? null,
      rec.place_ok ?? null,
      rec.sources.length,
      JSON.stringify(rec.sources),
      corrected == null ? null : JSON.stringify(corrected),
      rel.needs_recheck,
      rel.reliability,
      worker,
    ]
  );

  const proposed = asCorrectionPatch(cand.proposed);
  const matches = correctionValuesEqual(proposed, corrected);
  const state = rel.verdict === "TRUE" && matches ? "verified" : "disputed";
  await q(client).query(
    `update public.event_correction_candidates
        set state=$2, claimed_by=null, claimed_at=null, lease_until=null, updated_at=now()
      where event_id=$1`,
    [rec.event_id, state]
  );
  return {
    event_id: rec.event_id,
    ok: true,
    verdict: rel.verdict,
    reliability: rel.reliability,
    corrected_matches_proposed: matches,
    candidate_state: state,
  };
}

async function cmdRecord(worker: string, file: string): Promise<void> {
  const raw = JSON.parse(readFileSync(resolve(file), "utf8"));
  const items: unknown[] = Array.isArray(raw) ? raw : [];
  if (items.length === 0) {
    writeJson([{ ok: false, error: "input file is not a non-empty JSON array of records" }]);
    process.exitCode = 1;
    return;
  }
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i++) {
    const v = validateRecord(items[i], i);
    if (!v.ok) {
      results.push({ ok: false, error: v.error });
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      const r = await recordOne(client, worker, v.rec);
      if (r.ok === true) await client.query("commit");
      else await client.query("rollback");
      results.push(r);
    } catch (e) {
      await client.query("rollback").catch(() => {});
      results.push({ event_id: (items[i] as RecordIn)?.event_id ?? null, ok: false, error: shortError(e) });
    } finally {
      client.release();
    }
  }
  writeJson(results);
  if (results.some((r) => r.ok !== true)) process.exitCode = 1;
}

async function evaluateCandidate(client: PoolClient | Pool, eventId: string): Promise<Record<string, any>> {
  const res = await q(client).query(
    `select c.event_id, c.proposed, c.source_check_id, c.state,
            e.title, e.description, e.event_year, e.category, e.theme, e.status, e.retired_at,
            loc.display_name, loc.country,
            src.verdict as source_verdict, src.corrected as source_corrected, src.checker as source_checker,
            latest.id as latest_check_id, latest.protocol as latest_protocol, latest.verdict as latest_verdict,
            latest.reliability as latest_reliability, latest.n_sources as latest_n_sources,
            latest.sources as latest_sources, latest.corrected as latest_corrected, latest.checker as latest_checker
       from public.event_correction_candidates c
       join public.events e on e.id = c.event_id
       join public.event_fact_checks src on src.id = c.source_check_id
       join lateral (
         select f.* from public.event_fact_checks f
          where f.event_id = c.event_id
          order by f.checked_at desc, f.id desc limit 1
       ) latest on true
       left join lateral (
         select l.display_name, l.country from public.locations l where l.event_id = e.id limit 1
       ) loc on true
      where c.event_id = $1`,
    [eventId]
  );
  if (res.rows.length === 0) return { event_id: eventId, eligible: false, reason: "candidate_missing" };
  const row = res.rows[0];
  const proposed = asCorrectionPatch(row.proposed);
  const latestCorrected = isObject(row.latest_corrected) ? row.latest_corrected : null;
  const effectivePatch = effectiveCorrectionPatch(proposed, latestCorrected);
  const before = eventFacts(row);
  const after = applyCorrectionPatch(before, effectivePatch);
  const hints = await q(client).query(
    "select content from public.hints where event_id=$1",
    [eventId]
  );
  const hintContents = hints.rows.map((h) => String(h.content ?? ""));
  const independentDomains = countIndependentDomains(domainsFromSources(row.latest_sources));

  const failures: string[] = [];
  if (row.state !== "verified") failures.push("candidate_not_verified");
  if (row.latest_protocol !== CORRECTION_PROTOCOL) failures.push("latest_not_corr_v1");
  if (row.latest_verdict !== "TRUE") failures.push("latest_not_true");
  if (Number(row.latest_reliability) < RELIABILITY_PLAY_MIN) failures.push("reliability_below_play_min");
  if (Number(row.latest_n_sources) < CORRECTION_MIN_SOURCES) failures.push("fewer_than_two_sources");
  if (independentDomains < CORRECTION_MIN_INDEPENDENT_DOMAINS) failures.push("fewer_than_two_independent_domains");
  if (row.latest_checker === row.source_checker) failures.push("checker_not_independent");
  if (!correctionValuesEqual(proposed, latestCorrected)) failures.push("corrected_differs_from_proposed");

  const correctedDescriptionSupplied = typeof latestCorrected?.description === "string" && latestCorrected.description.trim() !== "";
  const skipReason = correctionApplySkipReason({
    before,
    after,
    proposed: isObject(row.proposed) ? row.proposed : {},
    sourceCorrected: row.source_corrected,
    sourceVerdict: String(row.source_verdict),
    storedPlace: { display_name: row.display_name ?? null, country: row.country ?? null },
    hintContents,
    correctedDescriptionSupplied,
  });

  return {
    event_id: eventId,
    row,
    proposed,
    before,
    after,
    independent_domains: independentDomains,
    failures,
    skip_reason: skipReason,
    eligible: failures.length === 0,
  };
}

async function countTranslationsBecameStale(
  client: PoolClient,
  eventId: string,
  beforeRow: Record<string, any>,
  after: StoredEventFacts
): Promise<number> {
  const oldHash = eventSourceHash(beforeRow);
  const newHash = eventSourceHash({
    title: after.title,
    description: after.description,
    category: beforeRow.category,
    theme: beforeRow.theme,
  });
  if (oldHash === newHash) return 0;
  const res = await q(client).query(
    "select count(*)::int as n from public.event_translations where event_id=$1 and source_hash=$2 and source_hash<>$3",
    [eventId, oldHash, newHash]
  );
  return Number(res.rows[0]?.n ?? 0);
}

async function applyEvaluation(
  client: PoolClient,
  evaluation: Record<string, any>,
  worker: string,
  runId: string
): Promise<Record<string, any>> {
  const row = evaluation.row;
  const beforeLog = logFacts(row);
  const upd = await q(client).query(
    `update public.events
        set title=$2, event_year=$3, description=$4, retired_at=null, status='validated'
      where id=$1
      returning id, title, description, event_year, status, retired_at`,
    [evaluation.event_id, evaluation.after.title, evaluation.after.event_year, evaluation.after.description]
  );
  if ((upd.rowCount ?? 0) === 0) throw new Error("event update affected zero rows");
  const afterRow = upd.rows[0];
  const staleTranslations = await countTranslationsBecameStale(client, evaluation.event_id, row, evaluation.after);
  const log = await q(client).query(
    `insert into public.event_correction_log
       (run_id, event_id, action, before, after, check_id, applied_by)
     values ($1,$2,'applied',$3::jsonb,$4::jsonb,$5,$6)
     returning id`,
    [
      runId,
      evaluation.event_id,
      JSON.stringify(beforeLog),
      JSON.stringify(logFacts(afterRow)),
      row.latest_check_id,
      worker,
    ]
  );
  await q(client).query(
    "update public.event_correction_candidates set state='applied', skip_reason=null, claimed_by=null, claimed_at=null, lease_until=null, updated_at=now() where event_id=$1",
    [evaluation.event_id]
  );
  return {
    event_id: evaluation.event_id,
    log_id: log.rows[0]?.id ?? null,
    before: beforeLog,
    after: logFacts(afterRow),
    translation_rows_became_stale: staleTranslations,
  };
}

async function cmdApply(worker: string, max: number, commit: boolean): Promise<void> {
  const idsRes = await q(pool).query(
    `select event_id from public.event_correction_candidates
      where state='verified'
      order by priority desc, event_id
      limit $1`,
    [max]
  );
  const ids = idsRes.rows.map((r) => r.event_id);
  const runId = `corr-apply-${worker}-${Date.now()}`;
  const applied: Record<string, any>[] = [];
  const skipped: Record<string, any>[] = [];
  const ineligible: Record<string, any>[] = [];

  for (const eventId of ids) {
    if (!commit) {
      const evaluation = await evaluateCandidate(pool, eventId);
      if (!evaluation.eligible) {
        ineligible.push({ event_id: eventId, failures: evaluation.failures });
      } else if (evaluation.skip_reason) {
        skipped.push({ event_id: eventId, skip_reason: evaluation.skip_reason, would_skip: true });
      } else {
        applied.push({
          event_id: eventId,
          would_apply: true,
          before: logFacts(evaluation.row),
          after: { ...evaluation.after, status: "validated", retired_at: null },
        });
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const evaluation = await evaluateCandidate(client, eventId);
      if (!evaluation.eligible) {
        ineligible.push({ event_id: eventId, failures: evaluation.failures });
      } else if (evaluation.skip_reason) {
        await q(client).query(
          "update public.event_correction_candidates set state='skipped', skip_reason=$2, claimed_by=null, claimed_at=null, lease_until=null, updated_at=now() where event_id=$1",
          [eventId, evaluation.skip_reason]
        );
        skipped.push({ event_id: eventId, skip_reason: evaluation.skip_reason });
      } else {
        applied.push(await applyEvaluation(client, evaluation, worker, runId));
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      ineligible.push({ event_id: eventId, failures: ["transaction_error"], error: shortError(e) });
    } finally {
      client.release();
    }
  }

  writeJson({ commit, run_id: commit ? runId : null, evaluated: ids.length, applied, skipped, ineligible });
}

async function selectRevertRows(eventId: string | null, runId: string | null): Promise<Record<string, any>[]> {
  if (eventId) {
    const res = await q(pool).query(
      `select * from public.event_correction_log
        where event_id=$1 and action='applied' and reverted_by_log_id is null
        order by created_at desc, id desc limit 1`,
      [eventId]
    );
    return res.rows;
  }
  const res = await q(pool).query(
    `select * from public.event_correction_log
      where run_id=$1 and action='applied' and reverted_by_log_id is null
      order by event_id, created_at desc, id desc`,
    [runId]
  );
  return res.rows;
}

async function revertRowsInClient(client: PoolClient, rows: Record<string, any>[], runId: string): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  for (const row of rows) {
    const originalBefore = isObject(row.before) ? row.before : null;
    if (!originalBefore) throw new Error("applied log row has invalid before payload");
    const cur = await q(client).query(
      "select id,title,description,event_year,status,retired_at from public.events where id=$1 for update",
      [row.event_id]
    );
    if (cur.rows.length === 0) throw new Error("event missing during revert");
    const current = cur.rows[0];
    const upd = await q(client).query(
      `update public.events
          set title=$2, description=$3, event_year=$4, status=$5, retired_at=$6
        where id=$1
        returning id,title,description,event_year,status,retired_at`,
      [
        row.event_id,
        originalBefore.title ?? null,
        originalBefore.description ?? null,
        originalBefore.event_year ?? null,
        originalBefore.status ?? null,
        originalBefore.retired_at ?? null,
      ]
    );
    const restored = upd.rows[0];
    const ins = await q(client).query(
      `insert into public.event_correction_log
         (run_id,event_id,action,before,after,check_id,applied_by)
       values ($1,$2,'reverted',$3::jsonb,$4::jsonb,$5,$6)
       returning id`,
      [
        runId,
        row.event_id,
        JSON.stringify(logFacts(current)),
        JSON.stringify(logFacts(restored)),
        row.check_id ?? null,
        "corrections-cli",
      ]
    );
    const revertLogId = ins.rows[0]?.id ?? null;
    await q(client).query(
      "update public.event_correction_log set reverted_by_log_id=$2 where id=$1",
      [row.id, revertLogId]
    );
    await q(client).query(
      "update public.event_correction_candidates set state='reverted', claimed_by=null, claimed_at=null, lease_until=null, updated_at=now() where event_id=$1",
      [row.event_id]
    );
    out.push({ event_id: row.event_id, applied_log_id: row.id, revert_log_id: revertLogId, restored: logFacts(restored) });
  }
  return out;
}

async function cmdRevert(eventId: string | null, runId: string | null, commit: boolean): Promise<void> {
  const rows = await selectRevertRows(eventId, runId);
  if (!commit) {
    writeJson({
      commit: false,
      count: rows.length,
      rows: rows.map((r) => ({ event_id: r.event_id, applied_log_id: r.id, before: r.before })),
    });
    return;
  }
  if (rows.length === 0) {
    writeJson({ commit: true, count: 0, reverted: [] });
    return;
  }
  const revertRunId = `corr-revert-${Date.now()}`;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const reverted = await revertRowsInClient(client, rows, revertRunId);
    await client.query("commit");
    writeJson({ commit: true, run_id: revertRunId, count: reverted.length, reverted });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function cmdReport(): Promise<void> {
  const byState = await q(pool).query(
    "select state, count(*)::int as n from public.event_correction_candidates group by state order by state"
  );
  const bySkip = await q(pool).query(
    "select skip_reason, count(*)::int as n from public.event_correction_candidates where skip_reason is not null group by skip_reason order by skip_reason"
  );
  const logs = await q(pool).query(
    "select action, count(*)::int as n from public.event_correction_log group by action order by action"
  );
  const softRequeued = await q(pool).query(
    `with latest as (
       select distinct on (f.event_id) f.event_id, f.verdict
         from public.event_fact_checks f order by f.event_id, f.checked_at desc, f.id desc
     )
     select count(*)::int as n
       from public.event_review_queue rq
       join public.events e on e.id=rq.event_id
       join latest on latest.event_id=e.id
      where rq.priority=$1 and rq.done_at is null and e.status='validated' and e.retired_at is null
        and latest.verdict = any($2::text[])`,
    [CORRECTION_REVIEW_PRIORITY, SOFT_REVIEW_VERDICTS]
  );
  const exhausted = await q(pool).query(
    `with soft_checks as (
       select event_id, checker from public.event_fact_checks
        where verdict = any($1::text[]) group by event_id, checker
     ), agg as (
       select event_id, count(*)::int as checker_count from soft_checks group by event_id
     )
     select count(*)::int as n
       from agg
       join public.events e on e.id=agg.event_id
       join public.event_reliability er on er.event_id=e.id
      where agg.checker_count >= 2 and e.status='validated' and e.retired_at is null
        and er.verdict = any($1::text[])`,
    [SOFT_REVIEW_VERDICTS]
  );
  const pool95 = await q(pool).query(
    `select count(*)::int as n
       from public.events e join public.event_reliability er on er.event_id=e.id
      where e.status='validated' and e.retired_at is null and er.reliability >= $1`,
    [RELIABILITY_PLAY_MIN]
  );
  const activeApplied95 = await q(pool).query(
    `select count(distinct l.event_id)::int as n
       from public.event_correction_log l
       join public.events e on e.id=l.event_id
       join public.event_reliability er on er.event_id=e.id
      where l.action='applied' and l.reverted_by_log_id is null
        and e.status='validated' and e.retired_at is null and er.reliability >= $1`,
    [RELIABILITY_PLAY_MIN]
  );
  const inPlay = await q(pool).query(
    "select count(*)::int as n from public.events where status='validated' and retired_at is null"
  );
  const now = Number(pool95.rows[0]?.n ?? 0);
  const appliedActive = Number(activeApplied95.rows[0]?.n ?? 0);
  writeJson({
    candidates_by_state: byState.rows,
    candidates_by_skip_reason: bySkip.rows,
    correction_log_by_action: logs.rows,
    soft_events_requeued_open: Number(softRequeued.rows[0]?.n ?? 0),
    soft_events_exhausted: Number(exhausted.rows[0]?.n ?? 0),
    pool95_before_corrections: now - appliedActive,
    pool95_now: now,
    in_play_count: Number(inPlay.rows[0]?.n ?? 0),
  });
}

async function cmdSelftest(): Promise<void> {
  const assertions: { name: string; result: "PASS" | "FAIL"; detail?: string }[] = [];
  const assert = (name: string, ok: boolean, detail?: string) => {
    assertions.push({ name, result: ok ? "PASS" : "FAIL", ...(detail ? { detail } : {}) });
  };
  const client = await pool.connect();
  try {
    await client.query("begin");
    const picked = await q(client).query(
      `select e.id,e.title,e.description,e.event_year,e.category,e.theme,e.status,e.retired_at
         from public.events e
        where e.status='validated' and e.retired_at is null
          and not exists (select 1 from public.event_correction_candidates c where c.event_id=e.id)
        order by e.id limit 1`
    );
    assert("picked_in_play_event_without_candidate", picked.rows.length === 1);
    if (picked.rows.length !== 1) throw new Error("selftest could not pick an event");
    const original = picked.rows[0];
    const proposed = { description: `${original.description ?? ""} [selftest-correction]` };
    const sourceInsert = await q(client).query(
      `insert into public.event_fact_checks
         (event_id,run_id,protocol,verdict,title_ok,year_ok,place_ok,n_sources,sources,corrected,needs_recheck,reliability,checker)
       values ($1,'selftest-run','corr-selftest-source','FALSE',false,true,true,2,$2::jsonb,$3::jsonb,false,0,'selftest-a')
       returning id`,
      [
        original.id,
        JSON.stringify([
          { url: "https://source-a.example", domain: "source-a.example", quote: "selftest source a" },
          { url: "https://source-b.example", domain: "source-b.example", quote: "selftest source b" },
        ]),
        JSON.stringify(proposed),
      ]
    );
    await q(client).query(
      `insert into public.event_fact_checks
         (event_id,run_id,protocol,verdict,title_ok,year_ok,place_ok,n_sources,sources,corrected,needs_recheck,reliability,checker)
       values ($1,'selftest-run',$2,'TRUE',true,true,true,2,$3::jsonb,$4::jsonb,false,95,'selftest-b')`,
      [
        original.id,
        CORRECTION_PROTOCOL,
        JSON.stringify([
          { url: "https://verify-a.example", domain: "verify-a.example", quote: "selftest verify a" },
          { url: "https://verify-b.example", domain: "verify-b.example", quote: "selftest verify b" },
        ]),
        JSON.stringify(proposed),
      ]
    );
    await q(client).query(
      `insert into public.event_correction_candidates
         (event_id,source_check_id,proposed,state,priority)
       values ($1,$2,$3::jsonb,'verified',1)`,
      [original.id, sourceInsert.rows[0].id, JSON.stringify(proposed)]
    );

    const evaluation = await evaluateCandidate(client, original.id);
    assert("apply_evaluation_eligible", evaluation.eligible === true && evaluation.skip_reason == null,
      evaluation.eligible === true ? undefined : evaluation.failures?.join(","));
    const applied = await applyEvaluation(client, evaluation, "selftest-b", "selftest-apply-run");
    const changed = await q(client).query(
      "select title,description,event_year,status,retired_at from public.events where id=$1",
      [original.id]
    );
    assert(
      "apply_changed_event",
      changed.rows[0]?.description === proposed.description &&
        changed.rows[0]?.title === original.title &&
        changed.rows[0]?.event_year === original.event_year
    );

    const appliedLogs = await q(client).query(
      "select * from public.event_correction_log where id=$1",
      [applied.log_id]
    );
    await revertRowsInClient(client, appliedLogs.rows, "selftest-revert-run");
    const restored = await q(client).query(
      "select title,description,event_year,status,retired_at from public.events where id=$1",
      [original.id]
    );
    assert(
      "revert_restored_original_event",
      restored.rows[0]?.title === original.title &&
        restored.rows[0]?.description === original.description &&
        restored.rows[0]?.event_year === original.event_year &&
        restored.rows[0]?.status === original.status &&
        String(restored.rows[0]?.retired_at ?? null) === String(original.retired_at ?? null)
    );
    await client.query("rollback");
    assert("transaction_rolled_back", true);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    if (!assertions.some((a) => a.result === "FAIL")) assert("selftest_completed_without_error", false, shortError(e));
  } finally {
    client.release();
  }
  const residue = await q(pool).query(
    "select count(*)::int as n from public.event_fact_checks where checker like 'selftest-%'"
  );
  assert("zero_selftest_residue", Number(residue.rows[0]?.n ?? 0) === 0, `count=${Number(residue.rows[0]?.n ?? 0)}`);
  const overall = assertions.every((a) => a.result === "PASS") ? "PASS" : "FAIL";
  writeJson({ overall, assertions });
  if (overall !== "PASS") process.exitCode = 1;
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  try {
    if (cmd === "plan") {
      await cmdPlan();
    } else if (cmd === "quarantine") {
      await cmdQuarantine(hasCommit(flags));
    } else if (cmd === "enqueue") {
      await cmdEnqueue(hasCommit(flags));
    } else if (cmd === "claim") {
      const worker = flags.get("worker");
      if (!worker) throw new Error("claim requires --worker");
      await cmdClaim(worker, Number(flags.get("n") ?? 8), Number(flags.get("lease-min") ?? 30));
    } else if (cmd === "record") {
      const worker = flags.get("worker");
      const file = flags.get("file");
      if (!worker || !file) throw new Error("record requires --worker and --file");
      await cmdRecord(worker, file);
    } else if (cmd === "apply") {
      const worker = flags.get("worker");
      if (!worker) throw new Error("apply requires --worker");
      await cmdApply(worker, Number(flags.get("max") ?? 8), hasCommit(flags));
    } else if (cmd === "revert") {
      const eventId = flags.get("event") ?? null;
      const runId = flags.get("run") ?? null;
      if ((!eventId && !runId) || (eventId && runId)) throw new Error("revert requires exactly one of --event or --run");
      if (eventId && !UUID_RE.test(eventId)) throw new Error("revert --event is not a uuid");
      await cmdRevert(eventId, runId, hasCommit(flags));
    } else if (cmd === "report") {
      await cmdReport();
    } else if (cmd === "selftest") {
      await cmdSelftest();
    } else {
      console.error("usage: corrections-cli.ts plan|quarantine|enqueue|claim|record|apply|revert|report|selftest ...");
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(shortError(e));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
