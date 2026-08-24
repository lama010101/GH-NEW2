import { redirect } from "next/navigation";
import Link from "next/link";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";
import { ModeToggle } from "./ModeToggle";
import { ResultsModal } from "./ResultsModal";
import { ModelFilter } from "./ModelFilter";
import { AddModelModal } from "./models/AddModelModal";
import { ModelRowActions } from "./models/ModelRowActions";
import { updateDailyCostCap } from "./models/actions";
import { fetchCostTrend, fetchLeaderboard, fetchErrorBuckets, type CostTrendRow, type LeaderboardRow, type ErrorRow, type ErrorBucket } from "./queries";
import { getAccuracyColor } from "@/core/accuracyColor";
import { CallDebugModal } from "./CallDebugModal";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = { [key: string]: string | string[] | undefined };

type ModelSummaryRow = {
  id: string;
  name: string;
  model_id: string;
  is_active: boolean;
  is_active_practice: boolean;
  is_active_daily: boolean;
  daily_cost_cap_usd: string | number | null;
  total_calls: number;
  error_count: number;
  total_cost: string | number | null;
  total_tokens: number;
  last_call_at: string | null;
  final_error_total: number;
  rate_limit_count: number;
  not_found_count: number;
  parse_count: number;
};

type ActivityRow = {
  id: string;
  model_name: string;
  model_id: string;
  event_title: string;
  mode: string;
  round_accuracy: number | null;
  location_accuracy: number | null;
  year_accuracy: number | null;
  cost: string | number | null;
  error: string | null;
  created_at: string;
  total_count: number;
};

function getParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCost(value: number): string {
  if (value === 0) return "0.000000";
  return value.toFixed(6);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatAccuracy(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

function errorBreakdown(row: ModelSummaryRow): string {
  const other = Math.max(
    0,
    row.final_error_total -
      row.rate_limit_count -
      row.not_found_count -
      row.parse_count
  );
  const parts: string[] = [];
  if (row.rate_limit_count > 0)
    parts.push(`rate-limit: ${row.rate_limit_count}`);
  if (row.not_found_count > 0) parts.push(`404: ${row.not_found_count}`);
  if (row.parse_count > 0) parts.push(`parse: ${row.parse_count}`);
  if (other > 0) parts.push(`other: ${other}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function shortError(error: string | null | undefined): string {
  if (!error) return "—";
  return error.length > 80 ? `${error.slice(0, 80)}…` : error;
}

function defaultDir(column: string): "asc" | "desc" {
  return column === "name" ||
    column === "event_title" ||
    column === "error" ||
    column === "mode"
    ? "asc"
    : "desc";
}

function modelSortExpression(
  column: string,
  direction: "asc" | "desc"
): string {
  const dir = direction.toUpperCase();
  const nulls = direction === "asc" ? "NULLS FIRST" : "NULLS LAST";
  switch (column) {
    case "name":
      return `p.name ${dir}`;
    case "total_calls":
      return `COALESCE(mc.total_calls, 0) ${dir} ${nulls}`;
    case "error_count":
      return `COALESCE(mc.error_count, 0) ${dir} ${nulls}`;
    case "final_errors":
      return `COALESCE(mae.final_error_total, 0) ${dir} ${nulls}`;
    case "total_cost":
      return `COALESCE(mc.total_cost, 0) ${dir} ${nulls}`;
    case "total_tokens":
      return `COALESCE(mc.total_tokens, 0) ${dir} ${nulls}`;
    case "last_call_at":
      return `mc.last_call_at ${dir} ${nulls}`;
    default:
      return `COALESCE(mc.total_cost, 0) DESC NULLS LAST`;
  }
}

function activitySortExpression(
  column: string,
  direction: "asc" | "desc"
): string {
  const dir = direction.toUpperCase();
  const nulls = direction === "asc" ? "NULLS FIRST" : "NULLS LAST";
  switch (column) {
    case "created_at":
      return `ab.created_at ${dir} ${nulls}`;
    case "model_name":
      return `p.name ${dir}`;
    case "event_title":
      return `e.title ${dir}`;
    case "mode":
      return `(CASE WHEN dc.date IS NOT NULL THEN 0 ELSE 1 END) ${dir}`;
    case "round_accuracy":
      return `ab.round_accuracy ${dir} ${nulls}`;
    case "location_accuracy":
      return `ab.location_accuracy ${dir} ${nulls}`;
    case "year_accuracy":
      return `ab.year_accuracy ${dir} ${nulls}`;
    case "cost":
      return `COALESCE(ac.cost, 0) ${dir} ${nulls}`;
    case "error":
      return `ab.error ${dir} ${nulls}`;
    default:
      return `ab.created_at DESC NULLS LAST`;
  }
}

function sortIndicator(
  column: string,
  current: string,
  direction: "asc" | "desc"
): string {
  if (column !== current) return "";
  return direction === "asc" ? " ↑" : " ↓";
}

function SortHeader({
  href,
  label,
  column,
  sort,
  dir,
}: {
  href: string;
  label: string;
  column: string;
  sort: string;
  dir: "asc" | "desc";
}) {
  return (
    <Link href={href} className="hover:underline">
      {label}
      {sortIndicator(column, sort, dir)}
    </Link>
  );
}


export default async function OpenRouterAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const authSupabase = createAuthenticatedServerClient();
  const {
    data: { session },
  } = await authSupabase.auth.getSession();

  if (!session) {
    redirect("/login?next=/admin/dashboard");
  }

  const pool = getDbPool();

  const modelFilterRaw = getParam(searchParams, "model");
  const modelFilter = modelFilterRaw || null;

  const mSort = getParam(searchParams, "m_sort") || "total_cost";
  const mDirRaw = getParam(searchParams, "m_dir") || "desc";
  const mDir: "asc" | "desc" = mDirRaw === "asc" ? "asc" : "desc";

  const aSort = getParam(searchParams, "a_sort") || "created_at";
  const aDirRaw = getParam(searchParams, "a_dir") || "desc";
  const aDir: "asc" | "desc" = aDirRaw === "asc" ? "asc" : "desc";

  const cSort = getParam(searchParams, "c_sort") || "avg_round_accuracy";
  const cDirRaw = getParam(searchParams, "c_dir") || "desc";
  const cDir: "asc" | "desc" = cDirRaw === "asc" ? "asc" : "desc";

  const errTypeRaw = getParam(searchParams, "errType");
  const errType: ErrorBucket | null =
    errTypeRaw === "rate_limit" ||
    errTypeRaw === "not_found" ||
    errTypeRaw === "parse" ||
    errTypeRaw === "other"
      ? errTypeRaw
      : null;

  const pageRaw = getParam(searchParams, "page");
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);

  const tabRaw = getParam(searchParams, "tab") || "overview";
  const tab: "overview" | "models" | "analytics" | "compare" | "debug" | "events" =
    tabRaw === "models" ||
    tabRaw === "analytics" ||
    tabRaw === "compare" ||
    tabRaw === "debug" ||
    tabRaw === "events"
      ? tabRaw
      : "overview";

  const currentParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => currentParams.append(key, v));
    } else {
      currentParams.set(key, value);
    }
  }

  function makeLink(
    updates: Record<string, string | undefined>
  ): string {
    const next = new URLSearchParams(currentParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return `/admin/dashboard${qs ? `?${qs}` : ""}`;
  }

  function modelSortLink(column: string): string {
    const nextDir =
      mSort === column
        ? mDir === "desc"
          ? "asc"
          : "desc"
        : defaultDir(column);
    return makeLink({ m_sort: column, m_dir: nextDir });
  }

  function activitySortLink(column: string): string {
    const nextDir =
      aSort === column
        ? aDir === "desc"
          ? "asc"
          : "desc"
        : defaultDir(column);
    return makeLink({ a_sort: column, a_dir: nextDir, page: undefined });
  }

  function detailLink(id: string): string {
    return makeLink({ detail: id });
  }

  function pageLink(pageNum: number): string {
    return makeLink({ page: String(pageNum) });
  }

  function tabLink(target: string): string {
    const next = new URLSearchParams(currentParams.toString());
    // Clear tab-specific params so switching tabs starts clean.
    next.delete("page");
    next.delete("m_sort");
    next.delete("m_dir");
    next.delete("a_sort");
    next.delete("a_dir");
    next.delete("c_sort");
    next.delete("c_dir");
    next.delete("model");
    next.delete("errType");
    next.delete("addModel");
    next.delete("calls");
    // Keep "detail" so ResultsModal can stay open across tabs.
    next.set("tab", target);
    const qs = next.toString();
    return `/admin/dashboard${qs ? `?${qs}` : ""}`;
  }

  function compareSortLink(column: string): string {
    const nextDir =
      cSort === column
        ? cDir === "desc"
          ? "asc"
          : "desc"
        : column === "model_name"
        ? "asc"
        : "desc";
    return makeLink({ c_sort: column, c_dir: nextDir });
  }

  const needModelSummary = tab === "overview" || tab === "models";
  const needActivity = tab === "overview";
  const needKpi = tab === "overview";

  const { rows: modelOptionsRows } = needActivity
    ? await pool.query<{ model_id: string }>(
        `SELECT DISTINCT model_id FROM ai_players ORDER BY model_id`
      )
    : { rows: [] as { model_id: string }[] };
  const modelOptions = modelOptionsRows.map((r) => r.model_id);

  const modelOrderBy = modelSortExpression(mSort, mDir);
  const { rows: modelRows } = needModelSummary
    ? await pool.query<ModelSummaryRow>(
    `
    WITH model_calls AS (
      SELECT
        ab.ai_player_id,
        COUNT(*)::int AS total_calls,
        COUNT(*) FILTER (WHERE c.response_payload IS NULL OR c.error IS NOT NULL)::int AS error_count,
        COALESCE(
          SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (WHERE c.response_payload IS NOT NULL),
          0
        ) AS total_cost,
        COALESCE(
          SUM(
            COALESCE((c.response_payload->'usage'->>'prompt_tokens')::int, 0) +
            COALESCE((c.response_payload->'usage'->>'completion_tokens')::int, 0)
          )
          FILTER (WHERE c.response_payload IS NOT NULL),
          0
        )::int AS total_tokens,
        MAX(c.created_at) AS last_call_at
      FROM ai_answer_bank ab
      JOIN ai_answer_bank_calls c ON c.ai_answer_bank_id = ab.id
      GROUP BY ab.ai_player_id
    ),
    model_answer_errors AS (
      SELECT
        ab.ai_player_id,
        COUNT(*) FILTER (WHERE ab.error IS NOT NULL)::int AS final_error_total,
        COUNT(*) FILTER (
          WHERE ab.error ILIKE '%429%'
            OR ab.error ILIKE '%rate limit%'
            OR ab.error ILIKE '%rate-limit%'
            OR ab.error ILIKE '%too many requests%'
        )::int AS rate_limit_count,
        COUNT(*) FILTER (
          WHERE ab.error ILIKE '%404%'
            OR ab.error ILIKE '%no endpoints found%'
        )::int AS not_found_count,
        COUNT(*) FILTER (
          WHERE ab.error ILIKE '%parse%'
            OR ab.error ILIKE '%json%'
            OR ab.error ILIKE '%missing finalguess%'
        )::int AS parse_count
      FROM ai_answer_bank ab
      GROUP BY ab.ai_player_id
    )
    SELECT
      p.id,
      p.name,
      p.model_id,
      p.is_active,
      p.is_active_practice,
      p.is_active_daily,
      p.daily_cost_cap_usd,
      COALESCE(mc.total_calls, 0)::int AS total_calls,
      COALESCE(mc.error_count, 0)::int AS error_count,
      COALESCE(mc.total_cost, 0) AS total_cost,
      COALESCE(mc.total_tokens, 0)::int AS total_tokens,
      mc.last_call_at,
      COALESCE(mae.final_error_total, 0) AS final_error_total,
      COALESCE(mae.rate_limit_count, 0) AS rate_limit_count,
      COALESCE(mae.not_found_count, 0) AS not_found_count,
      COALESCE(mae.parse_count, 0) AS parse_count
    FROM ai_players p
    LEFT JOIN model_calls mc ON mc.ai_player_id = p.id
    LEFT JOIN model_answer_errors mae ON mae.ai_player_id = p.id
    WHERE ($1::text IS NULL OR p.model_id = $1::text)
    ORDER BY ${modelOrderBy}
    `,
    [modelFilter]
  )
    : { rows: [] as ModelSummaryRow[] };

  const activityOrderBy = activitySortExpression(aSort, aDir);
  const offset = (page - 1) * PAGE_SIZE;
  const { rows: activityRows } = needActivity
    ? await pool.query<ActivityRow>(
    `
    WITH activity_costs AS (
      SELECT
        c.ai_answer_bank_id,
        COALESCE(
          SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (WHERE c.response_payload IS NOT NULL),
          0
        ) AS cost
      FROM ai_answer_bank_calls c
      GROUP BY c.ai_answer_bank_id
    )
    SELECT
      ab.id,
      p.name AS model_name,
      p.model_id,
      e.title AS event_title,
      ab.round_accuracy,
      ab.location_accuracy,
      ab.year_accuracy,
      COALESCE(ac.cost, 0) AS cost,
      ab.error,
      ab.created_at,
      CASE WHEN dc.date IS NOT NULL THEN 'Daily (inferred)' ELSE 'Practice' END AS mode,
      COUNT(*) OVER() AS total_count
    FROM ai_answer_bank ab
    JOIN ai_players p ON p.id = ab.ai_player_id
    JOIN events e ON e.id = ab.event_id
    LEFT JOIN activity_costs ac ON ac.ai_answer_bank_id = ab.id
    LEFT JOIN daily_challenges dc
      ON dc.date = ab.created_at::date AND ab.event_id = ANY(dc.event_ids)
    ORDER BY ${activityOrderBy}
    LIMIT $1 OFFSET $2
    `,
    [PAGE_SIZE, offset]
  )
    : { rows: [] as ActivityRow[] };

  const totalCount = activityRows[0]?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const perModel = modelRows.map((row) => ({
    ...row,
    totalCost: toNumber(row.total_cost),
  }));

  const totalCalls = perModel.reduce((sum, row) => sum + row.total_calls, 0);
  const totalErrors = perModel.reduce((sum, row) => sum + row.error_count, 0);
  const totalCost = perModel.reduce((sum, row) => sum + row.totalCost, 0);
  const totalTokens = perModel.reduce((sum, row) => sum + row.total_tokens, 0);
  const totalRateLimit = perModel.reduce(
    (sum, row) => sum + row.rate_limit_count,
    0
  );
  const totalNotFound = perModel.reduce(
    (sum, row) => sum + row.not_found_count,
    0
  );
  const totalParse = perModel.reduce((sum, row) => sum + row.parse_count, 0);
  const totalFinalErrors = perModel.reduce(
    (sum, row) => sum + row.final_error_total,
    0
  );
  const totalOther = Math.max(
    0,
    totalFinalErrors - totalRateLimit - totalNotFound - totalParse
  );

  const overallLastCallAt =
    perModel.length > 0
      ? formatDateTime(
          perModel.reduce(
            (latest, row) =>
              row.last_call_at && row.last_call_at > latest
                ? row.last_call_at
                : latest,
            perModel[0].last_call_at || ""
          )
        )
      : "—";

  const activeModelCount = perModel.filter(
    (row) => row.is_active_practice || row.is_active_daily
  ).length;

  const { rows: kpiRows } = needKpi
    ? await pool.query<{
        calls_24h: number;
        cost_24h: string | number | null;
        errors_24h: number;
      }>(
        `
        SELECT
          COUNT(*)::int AS calls_24h,
          COALESCE(
            SUM((c.response_payload->'usage'->>'cost')::numeric)
              FILTER (WHERE c.response_payload IS NOT NULL),
            0
          ) AS cost_24h,
          COUNT(*) FILTER (WHERE c.response_payload IS NULL OR c.error IS NOT NULL)::int AS errors_24h
        FROM ai_answer_bank_calls c
        WHERE c.created_at >= now() - interval '24 hours'
        `
      )
    : { rows: [] as { calls_24h: number; cost_24h: string | number | null; errors_24h: number }[] };
  const kpi = kpiRows[0] ?? { calls_24h: 0, cost_24h: 0, errors_24h: 0 };
  const kpiCalls24h = kpi.calls_24h;
  const kpiCost24h = toNumber(kpi.cost_24h);
  const kpiErrors24h = kpi.errors_24h;
  const kpiErrorRate24h =
    kpiCalls24h > 0 ? (kpiErrors24h / kpiCalls24h) * 100 : 0;

  const TABS: { key: typeof tab; label: string; href?: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "models", label: "Models" },
    { key: "analytics", label: "Analytics" },
    { key: "compare", label: "Compare" },
    { key: "debug", label: "Debug" },
    { key: "events", label: "Events", href: "/admin/dashboard/events" },
  ];

  const costTrend: CostTrendRow[] =
    tab === "analytics" ? await fetchCostTrend(pool, { days: 30 }) : [];

  // Per-day max cost for sparkline scaling.
  const maxDayCost = costTrend.reduce((max, row) => {
    const c = toNumber(row.cost);
    return c > max ? c : max;
  }, 0);

  // Group by model for per-model sparkline + cap progress.
  const trendByModel = new Map<
    string,
    { model_name: string; model_id: string; rows: CostTrendRow[]; totalCost: number; daily_cost_cap_usd: number | null }
  >();
  for (const row of costTrend) {
    let entry = trendByModel.get(row.ai_player_id);
    if (!entry) {
      entry = {
        model_name: row.model_name,
        model_id: row.model_id,
        rows: [],
        totalCost: 0,
        daily_cost_cap_usd: row.daily_cost_cap_usd
          ? toNumber(row.daily_cost_cap_usd)
          : null,
      };
      trendByModel.set(row.ai_player_id, entry);
    }
    entry.rows.push(row);
    entry.totalCost += toNumber(row.cost);
  }

  // Build a complete 30-day date range so sparkline gaps are visible.
  const trendDays: string[] = [];
  if (tab === "analytics") {
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      trendDays.push(d.toISOString().slice(0, 10));
    }
  }
  // Index each model's rows by day for O(1) lookup.
  const trendByModelWithGaps = new Map<
    string,
    { model_name: string; model_id: string; days: { day: string; cost: number; tokens: number }[]; totalCost: number; daily_cost_cap_usd: number | null }
  >();
  for (const [playerId, entry] of trendByModel.entries()) {
    const byDay = new Map<string, CostTrendRow>();
    for (const row of entry.rows) byDay.set(row.day, row);
    const days = trendDays.map((day) => {
      const row = byDay.get(day);
      return {
        day,
        cost: row ? toNumber(row.cost) : 0,
        tokens: row ? row.tokens : 0,
      };
    });
    trendByModelWithGaps.set(playerId, {
      model_name: entry.model_name,
      model_id: entry.model_id,
      days,
      totalCost: entry.totalCost,
      daily_cost_cap_usd: entry.daily_cost_cap_usd,
    });
  }

  const leaderboardRaw: LeaderboardRow[] =
    tab === "compare" ? await fetchLeaderboard(pool) : [];

  // Client-side sort of the leaderboard (data set is small).
  const leaderboard = [...leaderboardRaw].sort((a, b) => {
    const dir = cDir === "asc" ? 1 : -1;
    const get = (row: LeaderboardRow): number | string => {
      switch (cSort) {
        case "model_name":
          return row.model_name;
        case "total_answers":
          return row.total_answers;
        case "avg_round_accuracy":
          return row.avg_round_accuracy ?? -1;
        case "avg_location_accuracy":
          return row.avg_location_accuracy ?? -1;
        case "avg_year_accuracy":
          return row.avg_year_accuracy ?? -1;
        case "error_rate":
          return row.error_rate;
        case "total_cost":
          return toNumber(row.total_cost);
        case "cost_per_call":
          return row.cost_per_call ?? -1;
        case "cost_per_accuracy_point":
          return row.cost_per_accuracy_point ?? -1;
        default:
          return row.avg_round_accuracy ?? -1;
      }
    };
    const av = get(a);
    const bv = get(b);
    if (typeof av === "string" && typeof bv === "string")
      return dir * av.localeCompare(bv);
    return dir * ((av as number) - (bv as number));
  });

  const errorRows: ErrorRow[] =
    tab === "debug"
      ? await fetchErrorBuckets(pool, { type: errType, limit: 50 })
      : [];

  return (
    <main className="min-h-screen bg-gh-bg-base p-6 text-gh-text">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-bold">AI Model Dashboard</h1>

        <nav className="mb-6 flex flex-wrap gap-1 border-b border-[var(--gh-border-default)]">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href ?? tabLink(t.key)}
              className={`rounded-t px-4 py-2 text-sm font-medium ${
                tab === t.key
                  ? "border-b-2 border-gh-text bg-gh-bg-surface text-gh-text"
                  : "text-gh-text-sec hover:text-gh-text"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === "overview" && (
          <>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Active models" value={activeModelCount.toLocaleString()} />
              <KpiCard label="Calls (24h)" value={kpiCalls24h.toLocaleString()} />
              <KpiCard label="Cost (24h)" value={formatCost(kpiCost24h)} />
              <KpiCard
                label="Error rate (24h)"
                value={`${kpiErrorRate24h.toFixed(1)}%`}
              />
            </div>

        <section className="mb-10">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Per-model summary</h2>
            <ModelFilter options={modelOptions} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={modelSortLink("name")}
                      label="Model"
                      column="name"
                      sort={mSort}
                      dir={mDir}
                    />
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Modes
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <SortHeader
                      href={modelSortLink("total_calls")}
                      label="Calls"
                      column="total_calls"
                      sort={mSort}
                      dir={mDir}
                    />
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <SortHeader
                      href={modelSortLink("error_count")}
                      label="Errors"
                      column="error_count"
                      sort={mSort}
                      dir={mDir}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={modelSortLink("final_errors")}
                      label="Error types"
                      column="final_errors"
                      sort={mSort}
                      dir={mDir}
                    />
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <SortHeader
                      href={modelSortLink("total_cost")}
                      label="Total Cost"
                      column="total_cost"
                      sort={mSort}
                      dir={mDir}
                    />
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <SortHeader
                      href={modelSortLink("total_tokens")}
                      label="Total Tokens"
                      column="total_tokens"
                      sort={mSort}
                      dir={mDir}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={modelSortLink("last_call_at")}
                      label="Last Call"
                      column="last_call_at"
                      sort={mSort}
                      dir={mDir}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {perModel.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                  >
                    <td
                      className="max-w-[220px] truncate px-4 py-3"
                      title={row.model_id}
                    >
                      {row.name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-4">
                        <ModeToggle
                          playerId={row.id}
                          mode="practice"
                          enabled={row.is_active_practice}
                        />
                        <ModeToggle
                          playerId={row.id}
                          mode="daily"
                          enabled={row.is_active_daily}
                        />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {row.total_calls.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {row.error_count.toLocaleString()}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-gh-text-sec">
                      {errorBreakdown(row)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {formatCost(row.totalCost)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {row.total_tokens.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                      {formatDateTime(row.last_call_at)}
                    </td>
                  </tr>
                ))}
                {!modelFilter && perModel.length > 0 && (
                  <tr className="bg-gh-bg-elevated font-semibold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3" />
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {totalCalls.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {totalErrors.toLocaleString()}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-gh-text-sec">
                      {[
                        totalRateLimit > 0 &&
                          `rate-limit: ${totalRateLimit}`,
                        totalNotFound > 0 &&
                          `404: ${totalNotFound}`,
                        totalParse > 0 && `parse: ${totalParse}`,
                        totalOther > 0 && `other: ${totalOther}`,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {formatCost(totalCost)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {totalTokens.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                      {overallLastCallAt}
                    </td>
                  </tr>
                )}
                {perModel.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-6 text-gh-text-sec"
                      colSpan={8}
                    >
                      No models found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Per-activity results</h2>

          <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={activitySortLink("model_name")}
                      label="Model"
                      column="model_name"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={activitySortLink("mode")}
                      label="Mode"
                      column="mode"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={activitySortLink("event_title")}
                      label="Event"
                      column="event_title"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    <div className="flex flex-col">
                      <span>Accuracy</span>
                      <span className="flex justify-center gap-2 text-xs font-normal">
                        <SortHeader
                          href={activitySortLink("round_accuracy")}
                          label="combo"
                          column="round_accuracy"
                          sort={aSort}
                          dir={aDir}
                        />
                        <SortHeader
                          href={activitySortLink("location_accuracy")}
                          label="where"
                          column="location_accuracy"
                          sort={aSort}
                          dir={aDir}
                        />
                        <SortHeader
                          href={activitySortLink("year_accuracy")}
                          label="when"
                          column="year_accuracy"
                          sort={aSort}
                          dir={aDir}
                        />
                      </span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <SortHeader
                      href={activitySortLink("cost")}
                      label="Cost"
                      column="cost"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={activitySortLink("error")}
                      label="Error"
                      column="error"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortHeader
                      href={activitySortLink("created_at")}
                      label="Created"
                      column="created_at"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Results</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                  >
                    <td
                      className="max-w-[180px] truncate px-4 py-3"
                      title={row.model_id}
                    >
                      {row.model_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                      {row.mode}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-4 py-3"
                      title={row.event_title}
                    >
                      {row.event_title}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <div className="flex flex-col text-xs">
                        <span>{formatAccuracy(row.round_accuracy)}</span>
                        <span>{formatAccuracy(row.location_accuracy)}</span>
                        <span>{formatAccuracy(row.year_accuracy)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {formatCost(toNumber(row.cost))}
                    </td>
                    <td
                      className="max-w-[260px] truncate px-4 py-3 text-xs text-gh-text-sec"
                      title={row.error || undefined}
                    >
                      {shortError(row.error)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={detailLink(row.id)}
                        className="text-gh-text-sec hover:underline"
                      >
                        View results
                      </Link>
                    </td>
                  </tr>
                ))}
                {activityRows.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-6 text-gh-text-sec"
                      colSpan={8}
                    >
                      No activity results found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <div className="text-gh-text-sec">
                Page {page} of {totalPages} ({totalCount.toLocaleString()} rows)
              </div>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={pageLink(page - 1)}
                    className="rounded border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-1 text-gh-text hover:bg-gh-bg-elevated"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded border border-[var(--gh-border-default)] px-3 py-1 text-gh-text-sec opacity-50">
                    Previous
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={pageLink(page + 1)}
                    className="rounded border border-[var(--gh-border-default)] bg-gh-bg-surface px-3 py-1 text-gh-text hover:bg-gh-bg-elevated"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded border border-[var(--gh-border-default)] px-3 py-1 text-gh-text-sec opacity-50">
                    Next
                  </span>
                )}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-gh-text-sec">
            * Daily/Practice mode is inferred: a row is labeled Daily only when
            its event_id appears in daily_challenges.event_ids for its creation
            date; otherwise it is labeled Practice by elimination. This is a
            heuristic, not a stored fact.
          </p>
        </section>
          </>
        )}

        {tab === "models" && (
          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Manage models</h2>
              <Link
                href={makeLink({ tab: "models", addModel: "1" })}
                className="rounded bg-gh-text px-4 py-2 text-sm text-gh-bg-base hover:opacity-90"
              >
                + Add model
              </Link>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
                    <th className="px-4 py-3 font-semibold">
                      <SortHeader
                        href={modelSortLink("name")}
                        label="Model"
                        column="name"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-center font-semibold">Modes</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={modelSortLink("total_calls")}
                        label="Calls"
                        column="total_calls"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={modelSortLink("total_cost")}
                        label="Total Cost"
                        column="total_cost"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">Daily cap</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {perModel.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                    >
                      <td
                        className="max-w-[220px] truncate px-4 py-3"
                        title={row.model_id}
                      >
                        {row.name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-4">
                          <ModeToggle
                            playerId={row.id}
                            mode="practice"
                            enabled={row.is_active_practice}
                          />
                          <ModeToggle
                            playerId={row.id}
                            mode="daily"
                            enabled={row.is_active_daily}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.total_calls.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {formatCost(row.totalCost)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <form
                          action={updateDailyCostCap}
                          className="flex items-center justify-end gap-2"
                        >
                          <input type="hidden" name="playerId" value={row.id} />
                          <input
                            type="number"
                            name="cap"
                            step="0.000001"
                            min="0"
                            defaultValue={row.daily_cost_cap_usd ?? ""}
                            placeholder="No cap"
                            className="w-28 rounded border border-[var(--gh-border-default)] bg-gh-bg-base px-2 py-1 text-right text-sm text-gh-text"
                          />
                          <button
                            type="submit"
                            className="rounded border border-[var(--gh-border-default)] px-2 py-1 text-xs text-gh-text hover:bg-gh-bg-elevated"
                          >
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3">
                        <ModelRowActions
                          playerId={row.id}
                          modelId={row.model_id}
                          isActive={row.is_active}
                        />
                      </td>
                    </tr>
                  ))}
                  {perModel.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-gh-text-sec" colSpan={6}>
                        No models found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "analytics" && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Cost &amp; usage trend (30 days)</h2>

            {costTrend.length === 0 ? (
              <p className="rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface p-8 text-center text-gh-text-sec">
                No call data in the last 30 days.
              </p>
            ) : (
              <div className="space-y-4">
                {Array.from(trendByModelWithGaps.entries()).map(([playerId, entry]) => (
                  <div
                    key={playerId}
                    className="rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{entry.model_name}</span>
                        <span className="ml-2 text-xs text-gh-text-sec">
                          {entry.model_id}
                        </span>
                      </div>
                      <div className="text-sm text-gh-text-sec">
                        30d cost: {formatCost(entry.totalCost)}
                      </div>
                    </div>

                    {entry.daily_cost_cap_usd !== null &&
                      entry.daily_cost_cap_usd > 0 && (
                        <div className="mb-3">
                          <div className="mb-1 flex justify-between text-xs text-gh-text-sec">
                            <span>Avg daily cost vs cap</span>
                            <span>
                              {formatCost(entry.totalCost / 30)} /{" "}
                              {formatCost(entry.daily_cost_cap_usd)} per day
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded bg-gh-bg-base">
                            <div
                              className="h-full rounded bg-gh-text"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (entry.totalCost / 30 / entry.daily_cost_cap_usd) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                    <div className="flex items-end gap-px" style={{ height: "40px" }}>
                      {entry.days.map((d) => {
                        const widthPct =
                          maxDayCost > 0 ? (d.cost / maxDayCost) * 100 : 0;
                        return (
                          <div
                            key={d.day}
                            title={`${d.day}: ${formatCost(d.cost)} · ${d.tokens} tokens`}
                            className="flex-1 rounded-t bg-gh-text-sec"
                            style={{
                              height: `${Math.max(2, widthPct)}%`,
                              opacity: d.cost > 0 ? 1 : 0.15,
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-gh-text-sec">
                      <span>{entry.days[0]?.day}</span>
                      <span>{entry.days[entry.days.length - 1]?.day}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "compare" && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Model leaderboard</h2>

            <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
                    <th className="px-4 py-3 text-center font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">
                      <SortHeader
                        href={compareSortLink("model_name")}
                        label="Model"
                        column="model_name"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("total_answers")}
                        label="Answers"
                        column="total_answers"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("avg_round_accuracy")}
                        label="Combo"
                        column="avg_round_accuracy"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("avg_location_accuracy")}
                        label="Where"
                        column="avg_location_accuracy"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("avg_year_accuracy")}
                        label="When"
                        column="avg_year_accuracy"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("error_rate")}
                        label="Error %"
                        column="error_rate"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("total_cost")}
                        label="Total Cost"
                        column="total_cost"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("cost_per_call")}
                        label="Cost/Call"
                        column="cost_per_call"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <SortHeader
                        href={compareSortLink("cost_per_accuracy_point")}
                        label="Cost/Acc"
                        column="cost_per_accuracy_point"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => (
                    <tr
                      key={row.ai_player_id}
                      className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                    >
                      <td className="px-4 py-3 text-center font-semibold">
                        {idx + 1}
                      </td>
                      <td
                        className="max-w-[200px] truncate px-4 py-3"
                        title={row.model_id}
                      >
                        {row.model_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.total_answers.toLocaleString()}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-right font-semibold"
                        style={{
                          color: row.avg_round_accuracy != null
                            ? getAccuracyColor(row.avg_round_accuracy)
                            : undefined,
                        }}
                      >
                        {row.avg_round_accuracy != null
                          ? `${row.avg_round_accuracy.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-right"
                        style={{
                          color: row.avg_location_accuracy != null
                            ? getAccuracyColor(row.avg_location_accuracy)
                            : undefined,
                        }}
                      >
                        {row.avg_location_accuracy != null
                          ? `${row.avg_location_accuracy.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-right"
                        style={{
                          color: row.avg_year_accuracy != null
                            ? getAccuracyColor(row.avg_year_accuracy)
                            : undefined,
                        }}
                      >
                        {row.avg_year_accuracy != null
                          ? `${row.avg_year_accuracy.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {(row.error_rate * 100).toFixed(1)}%
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {formatCost(toNumber(row.total_cost))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.cost_per_call != null
                          ? formatCost(toNumber(row.cost_per_call))
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.cost_per_accuracy_point != null
                          ? formatCost(toNumber(row.cost_per_accuracy_point))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-gh-text-sec" colSpan={10}>
                        No model data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "debug" && (
          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Error inspector</h2>
              <div className="flex gap-1">
                {([
                  { key: null, label: "All" },
                  { key: "rate_limit", label: "Rate limit" },
                  { key: "not_found", label: "404" },
                  { key: "parse", label: "Parse" },
                  { key: "other", label: "Other" },
                ] as { key: ErrorBucket | null; label: string }[]).map(
                  (opt) => (
                    <Link
                      key={opt.label}
                      href={makeLink({
                        tab: "debug",
                        errType: opt.key ?? undefined,
                      })}
                      className={`rounded px-3 py-1 text-sm ${
                        errType === opt.key
                          ? "bg-gh-text text-gh-bg-base"
                          : "border border-[var(--gh-border-default)] text-gh-text-sec hover:text-gh-text"
                      }`}
                    >
                      {opt.label}
                    </Link>
                  )
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
                    <th className="px-4 py-3 font-semibold">Model</th>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Error</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                    >
                      <td
                        className="max-w-[160px] truncate px-4 py-3"
                        title={row.model_id}
                      >
                        {row.model_name}
                      </td>
                      <td
                        className="max-w-[200px] truncate px-4 py-3"
                        title={row.event_title}
                      >
                        {row.event_title}
                      </td>
                      <td
                        className="max-w-[300px] truncate px-4 py-3 text-xs text-gh-text-sec"
                        title={row.error}
                      >
                        {row.error}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gh-text-sec">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={makeLink({ tab: "debug", calls: row.id })}
                          className="text-gh-text-sec hover:underline"
                        >
                          View calls
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {errorRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-gh-text-sec" colSpan={5}>
                        No error rows found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <ResultsModal />
      <AddModelModal />
      <CallDebugModal />
    </main>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-gh-text-sec">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}


