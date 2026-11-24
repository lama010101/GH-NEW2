// EDQ-BUILD-REVIEWQUEUE-1124-872
// Review-queue worker CLI. Runs under `npx tsx`, binds SUPABASE_DB_CONNECTION
// in-process via dotenv (.env.local in cwd, fallback D:/GH-NEW2/.env.local),
// prints ONLY JSON on stdout — diagnostics go to stderr, secrets never print.
//
//   npx tsx scripts/factcheck/review-cli.ts claim  --worker <ID> [--n 10] [--lease-min 30]
//   npx tsx scripts/factcheck/review-cli.ts record --worker <ID> --file <result.json>
//   npx tsx scripts/factcheck/review-cli.ts status
//   npx tsx scripts/factcheck/review-cli.ts release --worker <ID>
//
// record input: a JSON array of
//   { event_id, verdict, title_ok?, year_ok?, place_ok?,
//     sources: [{url, domain, quote(<=25 words)}],
//     corrected?: {title?, year?, place?}, notes?, protocol?, run_id? }
// Reliability is ALWAYS computed by src/core/eventReliability.ts — any
// reliability value in the input is ignored.

import dotenv from "dotenv";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { Pool, type PoolClient } from "pg";
import {
  FACT_CHECK_VERDICTS,
  computeReliability,
  type FactCheckVerdict,
} from "../../src/core/eventReliability";

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

const WRONG_SET = new Set(["FALSE", "WRONG_YEAR", "WRONG_PLACE", "MISNAMED", "NOT_REAL"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

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

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
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
  protocol?: string;
  run_id?: string;
};

function validateRecord(raw: unknown, idx: number): { ok: true; rec: RecordIn } | { ok: false; error: string } {
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
  return { ok: true, rec: { ...r, sources } as RecordIn & { sources: SourceIn[] } };
}

async function cmdClaim(worker: string, n: number, leaseMin: number): Promise<void> {
  const res = await pool.query<{ event_id: string }>(
    "select event_id from public.claim_review_events($1,$2,$3)",
    [worker, n, leaseMin]
  );
  const ids = res.rows.map((r) => r.event_id);
  if (ids.length === 0) {
    process.stdout.write("[]\n");
    return;
  }
  const det = await pool.query(
    `select q.event_id as id, e.title, e.description, e.event_year, e.category,
            l.display_name as location_name, l.country, l.continent,
            l.latitude as lat, l.longitude as lng,
            er.verdict as fc_verdict, er.reliability as fc_reliability,
            er.n_sources as fc_n_sources, er.needs_recheck as fc_needs_recheck,
            er.protocol as fc_protocol, er.checked_at as fc_checked_at
       from public.event_review_queue q
       join public.events e on e.id = q.event_id
       left join public.locations l on l.event_id = e.id
       left join public.event_reliability er on er.event_id = e.id
      where q.event_id = any($1::uuid[])
      order by q.priority desc, q.event_id`,
    [ids]
  );
  const out = det.rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    event_year: r.event_year,
    category: r.category,
    location: r.location_name == null ? null : {
      name: r.location_name,
      country: r.country,
      continent: r.continent,
      lat: r.lat,
      lng: r.lng,
    },
    latest_fact_check: r.fc_verdict == null ? null : {
      verdict: r.fc_verdict,
      reliability: r.fc_reliability,
      n_sources: r.fc_n_sources,
      needs_recheck: r.fc_needs_recheck,
      protocol: r.fc_protocol,
      checked_at: r.fc_checked_at,
    },
  }));
  process.stdout.write(JSON.stringify(out) + "\n");
}

async function recordOne(client: PoolClient, worker: string, rec: RecordIn & { sources: SourceIn[] }): Promise<Record<string, unknown>> {
  const verdict = rec.verdict as FactCheckVerdict;
  const domains = new Set(rec.sources.map((s) => s.domain));
  const nSources = rec.sources.length;
  const independentDomains = domains.size;
  const rel = computeReliability({
    verdict,
    title_ok: rec.title_ok ?? null,
    year_ok: rec.year_ok ?? null,
    place_ok: rec.place_ok ?? null,
    n_sources: nSources,
    independentDomains,
  });
  const protocol = typeof rec.protocol === "string" && rec.protocol.trim() !== "" ? rec.protocol.trim() : "worker-review-v1";
  const runId = typeof rec.run_id === "string" && rec.run_id.trim() !== "" ? rec.run_id.trim() : `cli-${worker}`;
  const corrected = rec.corrected && typeof rec.corrected === "object" ? rec.corrected : null;

  const dup = await client.query(
    "select 1 from public.event_fact_checks where event_id=$1 and checker=$2 and protocol=$3 limit 1",
    [rec.event_id, worker, protocol]
  );
  if (dup.rows.length > 0) {
    return { event_id: rec.event_id, ok: false, error: "duplicate: same worker+event+protocol already recorded" };
  }

  await client.query(
    `insert into public.event_fact_checks
       (event_id, run_id, protocol, verdict, title_ok, year_ok, place_ok,
        n_sources, sources, corrected, needs_recheck, reliability, checker)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`,
    [
      rec.event_id, runId, protocol, rel.verdict,
      rec.title_ok ?? null, rec.year_ok ?? null, rec.place_ok ?? null,
      nSources, JSON.stringify(rec.sources),
      corrected == null ? null : JSON.stringify(corrected),
      rel.needs_recheck, rel.reliability, worker,
    ]
  );

  if (rel.needs_recheck) {
    await client.query(
      `update public.event_review_queue
          set priority = priority + 10, claimed_by = null, claimed_at = null, lease_until = null
        where event_id = $1 and done_at is null`,
      [rec.event_id]
    );
  } else {
    await client.query(
      "update public.event_review_queue set done_at = now() where event_id = $1",
      [rec.event_id]
    );
  }

  let quarantined = false;
  if (WRONG_SET.has(rel.verdict) && nSources >= 2 && independentDomains >= 2) {
    const q = await client.query(
      `update public.events set retired_at=now()
        where id=$1 and status='validated' and retired_at is null`,
      [rec.event_id]
    );
    quarantined = (q.rowCount ?? 0) > 0;
  }

  return {
    event_id: rec.event_id,
    ok: true,
    verdict: rel.verdict,
    reliability: rel.reliability,
    needs_recheck: rel.needs_recheck,
    quarantined,
  };
}

async function cmdRecord(worker: string, file: string): Promise<void> {
  const raw = JSON.parse(readFileSync(resolve(file), "utf8"));
  const items: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as { results?: unknown[] })?.results) ? (raw as { results: unknown[] }).results : [];
  if (items.length === 0) {
    process.stdout.write(JSON.stringify([{ ok: false, error: "input file is not a non-empty JSON array of records" }]) + "\n");
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
      const r = await recordOne(client, worker, v.rec as RecordIn & { sources: SourceIn[] });
      await client.query("commit");
      results.push(r);
    } catch (e) {
      await client.query("rollback").catch(() => {});
      results.push({ event_id: (items[i] as RecordIn)?.event_id ?? null, ok: false, error: e instanceof Error ? e.message : "error" });
    } finally {
      client.release();
    }
  }
  process.stdout.write(JSON.stringify(results) + "\n");
  if (results.some((r) => r.ok !== true)) process.exitCode = 1;
}

async function cmdStatus(): Promise<void> {
  const queue = await pool.query(
    `select
       count(*) filter (where done_at is null and (lease_until is null or lease_until < now()))::int as open,
       count(*) filter (where done_at is null and lease_until >= now())::int as leased,
       count(*) filter (where done_at is not null)::int as done
     from public.event_review_queue`
  );
  const byPrio = await pool.query(
    `select priority, count(*) filter (where done_at is null and (lease_until is null or lease_until < now()))::int as open,
            count(*) filter (where done_at is null and lease_until >= now())::int as leased,
            count(*) filter (where done_at is not null)::int as done
       from public.event_review_queue group by priority order by priority desc`
  );
  const byVerdict = await pool.query(
    "select verdict, count(*)::int as n from public.event_fact_checks group by verdict order by verdict"
  );
  const rel95 = await pool.query("select count(*)::int as n from public.event_reliability where reliability >= 95");
  const quar = await pool.query("select count(*)::int as n from public.events where retired_at is not null");
  process.stdout.write(JSON.stringify({
    queue: queue.rows[0],
    queue_by_priority: byPrio.rows,
    fact_checks_by_verdict: byVerdict.rows,
    reliability_ge_95: rel95.rows[0].n,
    quarantined: quar.rows[0].n,
  }) + "\n");
}

async function cmdRelease(worker: string): Promise<void> {
  const r = await pool.query(
    `update public.event_review_queue
        set claimed_by=null, claimed_at=null, lease_until=null
      where claimed_by=$1 and done_at is null`,
    [worker]
  );
  process.stdout.write(JSON.stringify({ released: r.rowCount ?? 0 }) + "\n");
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  try {
    if (cmd === "claim") {
      const worker = flags.get("worker");
      if (!worker) throw new Error("claim requires --worker");
      await cmdClaim(worker, Number(flags.get("n") ?? 10), Number(flags.get("lease-min") ?? 30));
    } else if (cmd === "record") {
      const worker = flags.get("worker");
      const file = flags.get("file");
      if (!worker || !file) throw new Error("record requires --worker and --file");
      await cmdRecord(worker, file);
    } else if (cmd === "status") {
      await cmdStatus();
    } else if (cmd === "release") {
      const worker = flags.get("worker");
      if (!worker) throw new Error("release requires --worker");
      await cmdRelease(worker);
    } else {
      console.error("usage: review-cli.ts claim|record|status|release ...");
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : "error");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
