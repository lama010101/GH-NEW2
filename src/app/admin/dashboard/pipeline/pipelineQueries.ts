import { eraForYear, ERA_BUCKETS } from "@/core/factLock";
import { getDbPool } from "@/server/db";

// OPS-BUILD-PIPELINEPAGE-1126-915 — read-only live KPI queries for the admin
// pipeline pages. Every data query is parameterized or parameter-free SELECT;
// each KPI runs inside its own short read-only transaction and fails soft.

export type PipelineKpiState = "ok" | "not_built" | "error";

export type PipelineKpiResult = {
  key: string;
  value: unknown | null;
  state: PipelineKpiState;
  note: string;
};

export type PipelineQueryClient = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ): Promise<{ rows: T[] }>;
  release(): void;
};

export type PipelineQueryable = {
  connect(): Promise<PipelineQueryClient>;
};

type RunnerResult =
  | { kind: "ok"; value: unknown }
  | { kind: "not_built"; note: string };

type Runner = (client: PipelineQueryClient) => Promise<RunnerResult>;

const STATEMENT_TIMEOUT_MS = 8000;

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function tableExists(client: PipelineQueryClient, name: string): Promise<boolean> {
  const res = await client.query<{ present: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS present",
    [name]
  );
  return res.rows[0]?.present === true;
}

async function missingTables(
  client: PipelineQueryClient,
  names: readonly string[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const name of names) {
    if (!(await tableExists(client, name))) missing.push(name);
  }
  return missing;
}

function notBuilt(names: readonly string[]): RunnerResult {
  return {
    kind: "not_built",
    note: `not built yet: missing ${names.join(", ")}`,
  };
}

function ok(value: unknown): RunnerResult {
  return { kind: "ok", value };
}

async function eventsInPlay(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.events"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.events WHERE retired_at IS NULL"
  );
  return ok({ count: num(res.rows[0]?.count) });
}

async function eventsChecked(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.events", "public.event_fact_checks"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{
    fact_check_rows: number;
    distinct_events: number;
    checked_in_play: number;
    events_in_play: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.event_fact_checks) AS fact_check_rows,
       (SELECT count(DISTINCT event_id)::int FROM public.event_fact_checks) AS distinct_events,
       (SELECT count(DISTINCT f.event_id)::int
          FROM public.event_fact_checks f
          JOIN public.events e ON e.id = f.event_id
         WHERE e.retired_at IS NULL) AS checked_in_play,
       (SELECT count(*)::int FROM public.events WHERE retired_at IS NULL) AS events_in_play`
  );
  const row = res.rows[0];
  return ok({
    factCheckRows: num(row?.fact_check_rows),
    distinctEvents: num(row?.distinct_events),
    checkedInPlay: num(row?.checked_in_play),
    eventsInPlay: num(row?.events_in_play),
  });
}

async function verdictMix(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.events", "public.event_fact_checks", "public.event_reliability"]);
  if (missing.length > 0) return notBuilt(missing);
  const verdictRes = await client.query<{ verdict: string; count: number }>(
    "SELECT verdict, count(*)::int AS count FROM public.event_reliability GROUP BY verdict ORDER BY verdict"
  );
  const totalsRes = await client.query<{
    checked_total: number;
    events_in_play: number;
    checked_in_play: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.event_reliability) AS checked_total,
       (SELECT count(*)::int FROM public.events WHERE retired_at IS NULL) AS events_in_play,
       (SELECT count(DISTINCT f.event_id)::int
          FROM public.event_fact_checks f
          JOIN public.events e ON e.id = f.event_id
         WHERE e.retired_at IS NULL) AS checked_in_play`
  );
  const totals = totalsRes.rows[0];
  const checkedTotal = num(totals?.checked_total);
  const eventsInPlayCount = num(totals?.events_in_play);
  const checkedInPlay = num(totals?.checked_in_play);
  return ok({
    verdicts: verdictRes.rows.map((row) => ({
      verdict: row.verdict,
      count: num(row.count),
      percentOfChecked: checkedTotal > 0 ? (num(row.count) / checkedTotal) * 100 : 0,
    })),
    checkedTotal,
    eventsInPlay: eventsInPlayCount,
    checkedInPlay,
    uncheckedInPlay: Math.max(0, eventsInPlayCount - checkedInPlay),
  });
}

async function pool95(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.events", "public.event_reliability"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ numerator: number; denominator: number }>(
    `SELECT
       count(*) FILTER (WHERE r.reliability >= 95)::int AS numerator,
       count(*)::int AS denominator
     FROM public.events e
     LEFT JOIN public.event_reliability r ON r.event_id = e.id
     WHERE e.retired_at IS NULL`
  );
  return ok({
    numerator: num(res.rows[0]?.numerator),
    denominator: num(res.rows[0]?.denominator),
  });
}

async function needsRecheck(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.events", "public.event_reliability"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ count: number; denominator: number }>(
    `SELECT
       count(*) FILTER (WHERE r.needs_recheck)::int AS count,
       count(*)::int AS denominator
     FROM public.events e
     LEFT JOIN public.event_reliability r ON r.event_id = e.id
     WHERE e.retired_at IS NULL`
  );
  return ok({ count: num(res.rows[0]?.count), denominator: num(res.rows[0]?.denominator) });
}

async function reviewQueueState(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.event_review_queue"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ pending: number; claimed: number; done: number }>(
    `SELECT
       count(*) FILTER (WHERE done_at IS NULL AND (lease_until IS NULL OR lease_until < now()))::int AS pending,
       count(*) FILTER (WHERE done_at IS NULL AND lease_until >= now())::int AS claimed,
       count(*) FILTER (WHERE done_at IS NOT NULL)::int AS done
     FROM public.event_review_queue`
  );
  const row = res.rows[0];
  return ok({ pending: num(row?.pending), claimed: num(row?.claimed), done: num(row?.done) });
}

async function candidatesByStatus(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.generation_candidates"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ status: string; count: number }>(
    "SELECT status, count(*)::int AS count FROM public.generation_candidates GROUP BY status ORDER BY status"
  );
  return ok({
    total: res.rows.reduce((sum, row) => sum + num(row.count), 0),
    buckets: res.rows.map((row) => ({ status: row.status, count: num(row.count) })),
  });
}

async function candidatesByContinentAndEra(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.generation_candidates"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ continent: string | null; event_year: number | null }>(
    "SELECT continent, event_year FROM public.generation_candidates"
  );
  const counts = new Map<string, number>();
  for (const row of res.rows) {
    const era = typeof row.event_year === "number" ? eraForYear(row.event_year) : "unknown-era";
    const continent = row.continent ?? "not declared";
    const key = `${continent}|${era}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets = [...counts.entries()]
    .map(([key, count]) => {
      const [continent, era] = key.split("|");
      return { continent, era, count };
    })
    .sort((a, b) =>
      a.continent === b.continent
        ? ERA_BUCKETS.indexOf(a.era as (typeof ERA_BUCKETS)[number]) -
          ERA_BUCKETS.indexOf(b.era as (typeof ERA_BUCKETS)[number])
        : a.continent.localeCompare(b.continent)
    );
  return ok({ total: res.rows.length, buckets });
}

async function hintsComplete(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.events", "public.hints"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ numerator: number; denominator: number }>(
    `SELECT
       count(*) FILTER (WHERE hint_rows = 10)::int AS numerator,
       count(*)::int AS denominator
     FROM (
       SELECT e.id, count(h.id)::int AS hint_rows
       FROM public.events e
       LEFT JOIN public.hints h ON h.event_id = e.id
       WHERE e.retired_at IS NULL
       GROUP BY e.id
     ) counts`
  );
  return ok({ numerator: num(res.rows[0]?.numerator), denominator: num(res.rows[0]?.denominator) });
}

async function translationCoverage(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.events", "public.event_translations"]);
  if (missing.length > 0) return notBuilt(missing);
  const langRes = await client.query<{ language_code: string; events: number }>(
    `SELECT et.language_code, count(DISTINCT et.event_id)::int AS events
     FROM public.event_translations et
     JOIN public.events e ON e.id = et.event_id
     WHERE e.retired_at IS NULL
     GROUP BY et.language_code
     ORDER BY et.language_code`
  );
  const totalRes = await client.query<{ events_in_play: number }>(
    "SELECT count(*)::int AS events_in_play FROM public.events WHERE retired_at IS NULL"
  );
  return ok({
    eventsInPlay: num(totalRes.rows[0]?.events_in_play),
    languages: langRes.rows.map((row) => ({
      languageCode: row.language_code,
      events: num(row.events),
    })),
  });
}

async function imagesTotal(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.images"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.images"
  );
  return ok({ count: num(res.rows[0]?.count) });
}

async function chronoFlags(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.ai_image_chrono_flags"]);
  if (missing.length > 0) return notBuilt(missing);
  const res = await client.query<{ rows: number; flagged: number }>(
    `SELECT count(*)::int AS rows,
            count(*) FILTER (WHERE flagged)::int AS flagged
     FROM public.ai_image_chrono_flags`
  );
  return ok({ rows: num(res.rows[0]?.rows), flagged: num(res.rows[0]?.flagged) });
}

async function verifySpendUsd(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.verify_spend"]);
  if (missing.length > 0) return notBuilt(missing);
  return {
    kind: "not_built",
    note: "not built yet: verify spend schema mapping is pending EDQ-BUILD-VERIFYENGINE-1126-902",
  };
}

async function verifyRunsLast24h(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.verify_runs"]);
  if (missing.length > 0) return notBuilt(missing);
  return {
    kind: "not_built",
    note: "not built yet: verify runs schema mapping is pending EDQ-BUILD-VERIFYENGINE-1126-902",
  };
}

async function verifyHalted(client: PipelineQueryClient): Promise<RunnerResult> {
  const missing = await missingTables(client, ["public.verify_settings"]);
  if (missing.length > 0) return notBuilt(missing);
  return {
    kind: "not_built",
    note: "not built yet: verify settings schema mapping is pending EDQ-BUILD-VERIFYENGINE-1126-902",
  };
}

export const PIPELINE_QUERY_RUNNERS: Readonly<Record<string, Runner>> = Object.freeze({
  events_in_play: eventsInPlay,
  events_checked: eventsChecked,
  verdict_mix: verdictMix,
  pool_95: pool95,
  needs_recheck: needsRecheck,
  review_queue_state: reviewQueueState,
  candidates_by_status: candidatesByStatus,
  candidates_by_continent_and_era: candidatesByContinentAndEra,
  hints_complete: hintsComplete,
  translation_coverage: translationCoverage,
  images_total: imagesTotal,
  chrono_flags: chronoFlags,
  verify_spend_usd: verifySpendUsd,
  verify_runs_last_24h: verifyRunsLast24h,
  verify_halted: verifyHalted,
});

function shortError(err: unknown): string {
  const message = err instanceof Error ? err.message : "query failed";
  return message.replace(/\s+/g, " ").slice(0, 140);
}

async function runOne(
  pool: PipelineQueryable,
  key: string,
  runner: Runner
): Promise<PipelineKpiResult> {
  let client: PipelineQueryClient | null = null;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    begun = true;
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await runner(client);
    await client.query("ROLLBACK");
    begun = false;
    if (result.kind === "not_built") {
      return { key, value: null, state: "not_built", note: result.note };
    }
    return { key, value: result.value, state: "ok", note: "live database read" };
  } catch (err) {
    if (client && begun) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Release still runs below; the rollback failure is not more useful than the first error.
      }
    }
    return { key, value: null, state: "error", note: shortError(err) };
  } finally {
    client?.release();
  }
}

export async function collectPipelineKpis(
  pool: PipelineQueryable,
  keys?: readonly string[]
): Promise<Record<string, PipelineKpiResult>> {
  const selected = keys ?? Object.keys(PIPELINE_QUERY_RUNNERS);
  const pairs = await Promise.all(
    selected.map(async (key) => {
      const runner = PIPELINE_QUERY_RUNNERS[key];
      if (!runner) {
        return [key, { key, value: null, state: "error", note: "unknown KPI key" }] as const;
      }
      return [key, await runOne(pool, key, runner)] as const;
    })
  );
  return Object.fromEntries(pairs);
}

export async function collectLivePipelineKpis(): Promise<Record<string, PipelineKpiResult>> {
  return collectPipelineKpis(getDbPool() as unknown as PipelineQueryable);
}

export function formatPercent(
  numerator: number,
  denominator: number,
  denominatorText: string
): string {
  const pct = denominator > 0 ? (numerator / denominator) * 100 : 0;
  const pctText = Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1);
  return `${pctText}% of ${denominator.toLocaleString()} ${denominatorText}`;
}

export function formatRatio(
  numerator: number,
  denominator: number,
  denominatorText: string
): string {
  return `${numerator.toLocaleString()} of ${denominator.toLocaleString()} ${denominatorText}`;
}

function objectValue(result: PipelineKpiResult | undefined): Record<string, unknown> {
  return result?.value != null && typeof result.value === "object" && !Array.isArray(result.value)
    ? (result.value as Record<string, unknown>)
    : {};
}

export function formatKpiValue(result: PipelineKpiResult | undefined): string {
  if (!result) return "not measured";
  if (result.state === "not_built") return "not built yet";
  if (result.state === "error") return `error: ${result.note}`;
  const v = objectValue(result);
  switch (result.key) {
    case "events_in_play":
    case "images_total":
      return num(v.count).toLocaleString();
    case "events_checked": {
      const distinct = num(v.distinctEvents);
      const coverage = formatPercent(num(v.checkedInPlay), num(v.eventsInPlay), "events in play");
      return `${distinct.toLocaleString()} distinct; ${coverage}`;
    }
    case "verdict_mix": {
      const verdicts = Array.isArray(v.verdicts) ? (v.verdicts as Array<Record<string, unknown>>) : [];
      const trueRow = verdicts.find((row) => row.verdict === "TRUE");
      const trueText = formatPercent(num(trueRow?.count), num(v.checkedTotal), "checked events");
      const uncheckedText = formatPercent(num(v.uncheckedInPlay), num(v.eventsInPlay), "events in play");
      return `TRUE ${trueText}; unchecked ${uncheckedText}`;
    }
    case "pool_95":
    case "hints_complete":
      return `${formatPercent(num(v.numerator), num(v.denominator), "events in play")} (${num(v.numerator).toLocaleString()} events)`;
    case "needs_recheck":
      return `${num(v.count).toLocaleString()} of ${num(v.denominator).toLocaleString()} events in play`;
    case "review_queue_state":
      return `${num(v.pending).toLocaleString()} pending · ${num(v.claimed).toLocaleString()} claimed · ${num(v.done).toLocaleString()} done`;
    case "candidates_by_status": {
      const buckets = Array.isArray(v.buckets) ? (v.buckets as Array<Record<string, unknown>>) : [];
      const text = buckets.map((row) => `${num(row.count).toLocaleString()} ${String(row.status)}`).join(" · ");
      return text || "0";
    }
    case "candidates_by_continent_and_era": {
      const buckets = Array.isArray(v.buckets) ? v.buckets : [];
      return `${num(v.total).toLocaleString()} candidates across ${buckets.length.toLocaleString()} continent/era buckets`;
    }
    case "translation_coverage": {
      const languages = Array.isArray(v.languages) ? (v.languages as Array<Record<string, unknown>>) : [];
      if (languages.length === 0) return `0 languages covered of ${num(v.eventsInPlay).toLocaleString()} events in play`;
      return languages
        .map((row) => `${String(row.languageCode)} ${formatPercent(num(row.events), num(v.eventsInPlay), "events in play")}`)
        .join("; ");
    }
    case "chrono_flags":
      return `${num(v.rows).toLocaleString()} rows · ${num(v.flagged).toLocaleString()} flagged`;
    case "verify_spend_usd":
    case "verify_runs_last_24h":
    case "verify_halted":
      return "not built yet";
    default:
      return "measured";
  }
}
