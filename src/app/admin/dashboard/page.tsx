import { redirect } from "next/navigation";
import Link from "next/link";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";
import { ModeToggle } from "./ModeToggle";
import { ResultsModal } from "./ResultsModal";
import { AddModelModal } from "./models/AddModelModal";
import { ModelRowActions } from "./models/ModelRowActions";
import { updateDailyCostCap } from "./models/actions";
import { scheduleAiPlayerModeChange } from "./scheduling/actions";
import { fetchCostTrend, fetchLeaderboard, fetchErrorBuckets, fetchRosterHealth, fetchRecentErrors, fetchCostWeek, fetchScheduledChanges, type CostTrendRow, type LeaderboardRow, type ErrorRow, type ErrorBucket, type RosterHealthRow, type RecentErrorRow, type ScheduledChangeRow } from "./queries";
import { getAccuracyColor } from "@/core/accuracyColor";
import { CallDebugModal } from "./CallDebugModal";
import { KpiCard, type KpiTone } from "./KpiCard";
import { StatusBadge } from "./StatusBadge";
import { deriveStatus, statusTier, type RosterHealthDisplayRow } from "./rosterStatus";
import { RecordDrawer, type DrawerField } from "./components/RecordDrawer";

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
  cost_today: string | number | null;
  cost_week: string | number | null;
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

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "just now";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

function formatAccuracy(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
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
    case "cost_today":
      return `COALESCE(mc.cost_today, 0) ${dir} ${nulls}`;
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
  const capFilterRaw = getParam(searchParams, "cap_filter") || "";
  const capFilter =
    capFilterRaw === "capped" || capFilterRaw === "uncapped" ? capFilterRaw : null;
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

  const needModelSummary = tab === "models";
  const needActivity = tab === "analytics";
  const needKpi = tab === "overview";
  const needRosterHealth = tab === "overview" || tab === "models";
  const needRecentErrors = tab === "overview";
  const needCostWeek = tab === "overview";
  const needScheduled = tab === "overview";

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
          SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (WHERE c.response_payload IS NOT NULL AND c.created_at >= date_trunc('day', now())),
          0
        ) AS cost_today,
        COALESCE(
          SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (WHERE c.response_payload IS NOT NULL AND c.created_at >= now() - interval '7 days'),
          0
        ) AS cost_week,
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
      COALESCE(mc.cost_today, 0) AS cost_today,
      COALESCE(mc.cost_week, 0) AS cost_week,
      COALESCE(mc.total_tokens, 0)::int AS total_tokens,
      mc.last_call_at,
      COALESCE(mae.final_error_total, 0) AS final_error_total,
      COALESCE(mae.rate_limit_count, 0) AS rate_limit_count,
      COALESCE(mae.not_found_count, 0) AS not_found_count,
      COALESCE(mae.parse_count, 0) AS parse_count
    FROM ai_players p
    LEFT JOIN model_calls mc ON mc.ai_player_id = p.id
    LEFT JOIN model_answer_errors mae ON mae.ai_player_id = p.id
    WHERE p.deleted_at IS NULL
      AND ($1::text IS NULL OR p.model_id = $1::text)
      AND (
        $2::text IS NULL
        OR ($2::text = 'capped' AND p.daily_cost_cap_usd IS NOT NULL)
        OR ($2::text = 'uncapped' AND p.daily_cost_cap_usd IS NULL)
      )
    ORDER BY ${modelOrderBy}
    `,
    [modelFilter, capFilter]
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
    costToday: toNumber(row.cost_today),
    costWeek: toNumber(row.cost_week),
  }));

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

  // --- Ops Overview data (fleet exceptions, scheduled changes, recent errors) ---
  const rosterHealthRaw: RosterHealthRow[] = needRosterHealth
    ? await fetchRosterHealth(pool)
    : [];
  const recentErrorsRaw: RecentErrorRow[] = needRecentErrors
    ? await fetchRecentErrors(pool, 5)
    : [];
  const costWeek = needCostWeek ? await fetchCostWeek(pool) : 0;
  const scheduledRaw: ScheduledChangeRow[] = needScheduled
    ? await fetchScheduledChanges(pool, { limit: 5 })
    : [];
  const pendingScheduled = scheduledRaw.filter((r) => r.status === "pending");

  const activeModelCount = rosterHealthRaw.filter(
    (row) => row.is_active_practice || row.is_active_daily
  ).length;

  const lastActivityRaw = rosterHealthRaw.reduce((latest, row) => {
    if (row.last_call_at && (!latest || row.last_call_at > latest)) {
      return row.last_call_at;
    }
    return latest;
  }, null as string | null);

  const rosterHealthDisplay: RosterHealthDisplayRow[] = rosterHealthRaw.map(
    (row) => ({
      id: row.id,
      name: row.name,
      model_id: row.model_id,
      is_active: row.is_active,
      is_active_practice: row.is_active_practice,
      is_active_daily: row.is_active_daily,
      daily_cost_cap_usd:
        row.daily_cost_cap_usd !== null
          ? toNumber(row.daily_cost_cap_usd)
          : null,
      calls_24h: row.calls_24h,
      errors_24h: row.errors_24h,
      cost_24h: toNumber(row.cost_24h),
      last_call_at: row.last_call_at,
      last_seen_relative: formatRelativeTime(row.last_call_at),
    })
  );

  // Fleet exceptions only (approved plan §4): erroring, disabled, or ≥80% of
  // daily cap. A healthy fleet renders as a single line.
  const fleetExceptions = rosterHealthDisplay
    .map((row) => {
      const status = deriveStatus(row);
      const capPct =
        row.daily_cost_cap_usd && row.daily_cost_cap_usd > 0
          ? (row.cost_24h / row.daily_cost_cap_usd) * 100
          : null;
      return { ...row, status, capPct };
    })
    .filter(
      (r) =>
        r.status === "erroring" ||
        r.status === "disabled" ||
        (r.capPct ?? 0) >= 80
    );

  const recentErrors = recentErrorsRaw.map((row) => ({
    id: row.id,
    model_name: row.model_name,
    error: row.error,
    error_type: row.error_type,
    created_at_relative: formatRelativeTime(row.created_at),
  }));

  const errorRateTone: KpiTone =
    kpiErrorRate24h > 5
      ? "danger"
      : kpiErrorRate24h >= 1
      ? "gold"
      : "success";

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

  // Shared RecordDrawer state (?drawer=<id>, closed by stripping the param).
  const drawerId = getParam(searchParams, "drawer");
  const drawerCloseHref = makeLink({ drawer: undefined });
  const modelDrawerRow =
    tab === "models" && drawerId
      ? perModel.find((r) => r.id === drawerId) ?? null
      : null;
  const modelDrawerHealth = modelDrawerRow
    ? rosterHealthDisplay.find((r) => r.id === modelDrawerRow.id) ?? null
    : null;
  const healthByPlayer = new Map(
    rosterHealthDisplay.map((r) => [r.id, r] as const)
  );
  const compareDrawerRow =
    tab === "compare" && drawerId
      ? leaderboard.find((r) => r.ai_player_id === drawerId) ?? null
      : null;

  const pageTitle =
    tab === "models"
      ? "Models"
      : tab === "analytics"
      ? "Analytics"
      : tab === "compare"
      ? "Compare"
      : tab === "debug"
      ? "Debug"
      : "Overview";

  const modelDrawerFields: DrawerField[] | undefined = modelDrawerRow
    ? [
        { label: "Model ID", value: modelDrawerRow.model_id, mono: true },
        {
          label: "Status",
          value: modelDrawerHealth ? (
            <StatusBadge status={deriveStatus(modelDrawerHealth)} />
          ) : (
            "—"
          ),
        },
        {
          label: "Modes",
          value: `${modelDrawerRow.is_active_practice ? "Practice on" : "Practice off"} · ${modelDrawerRow.is_active_daily ? "Daily on" : "Daily off"}`,
        },
        {
          label: "Calls (total)",
          value: modelDrawerRow.total_calls.toLocaleString(),
        },
        {
          label: "Errors (total)",
          value: modelDrawerRow.error_count.toLocaleString(),
        },
        {
          label: "Cost today / 7d",
          value: `${formatCost(modelDrawerRow.costToday)} / ${formatCost(modelDrawerRow.costWeek)}`,
        },
        { label: "Cost (total)", value: formatCost(modelDrawerRow.totalCost) },
        {
          label: "Daily cap (USD)",
          value: modelDrawerRow.daily_cost_cap_usd ?? "No cap",
        },
        {
          label: "Tokens (total)",
          value: modelDrawerRow.total_tokens.toLocaleString(),
        },
        {
          label: "Last call",
          value: formatDateTime(modelDrawerRow.last_call_at),
        },
      ]
    : undefined;

  const compareDrawerFields: DrawerField[] | undefined = compareDrawerRow
    ? [
        { label: "Model ID", value: compareDrawerRow.model_id, mono: true },
        {
          label: "Answers",
          value: (compareDrawerRow.total_answers ?? 0).toLocaleString(),
        },
        {
          label: "Error rate",
          value: `${(compareDrawerRow.error_rate * 100).toFixed(1)}%`,
        },
        {
          label: "Cost / call",
          value:
            compareDrawerRow.cost_per_call != null
              ? formatCost(toNumber(compareDrawerRow.cost_per_call))
              : "—",
        },
        {
          label: "Cost / accuracy point",
          value:
            compareDrawerRow.cost_per_accuracy_point != null
              ? formatCost(toNumber(compareDrawerRow.cost_per_accuracy_point))
              : "—",
        },
        {
          label: "Total cost",
          value: formatCost(toNumber(compareDrawerRow.total_cost)),
        },
      ]
    : undefined;

  return (
    <div className="ops-page">
      <header className="ops-pagehead">
        <div>
          <h1 className="ops-h1">{pageTitle}</h1>
          {tab === "overview" && (
            <p className="ops-pagesub">
              Last call {formatRelativeTime(lastActivityRaw)}
            </p>
          )}
        </div>
      </header>

        {tab === "overview" && (
          <>
            <div className="ops-kpi-strip">
              <KpiCard label="Active models" value={activeModelCount.toLocaleString()} />
              <KpiCard label="Total plays (24h)" value={kpiCalls24h.toLocaleString()} />
              <KpiCard
                label="Error rate (24h)"
                value={`${kpiErrorRate24h.toFixed(1)}%`}
                tone={errorRateTone}
              />
              <KpiCard label="Cost today" value={formatCost(kpiCost24h)} />
              <KpiCard label="Cost this week" value={formatCost(costWeek)} />
            </div>

            <div className="ops-grid-2col">
              <section className="ops-panel">
                <div className="ops-toolbar">
                  <h2 className="ops-panel-title">Fleet exceptions</h2>
                  <Link href={makeLink({ tab: "models" })} className="ops-btn">
                    Models
                  </Link>
                </div>
                <div className="ops-panel-pad">
                  {fleetExceptions.length === 0 ? (
                    <div className="ops-minirow">
                      <span className="ops-minirow-main">
                        <span className="ops-dot ops-dot-ok" />
                        All {rosterHealthDisplay.length} models healthy
                      </span>
                    </div>
                  ) : (
                    <>
                      {fleetExceptions.slice(0, 8).map((row) => (
                        <div key={row.id} className="ops-minirow">
                          <span className="ops-minirow-main">
                            <span
                              className={`ops-dot ${
                                row.status === "erroring"
                                  ? "ops-dot-bad"
                                  : row.status === "disabled"
                                  ? "ops-dot-off"
                                  : "ops-dot-warn"
                              }`}
                            />
                            <span className="ops-truncate" title={row.model_id}>
                              {row.name}
                            </span>
                            <StatusBadge status={row.status} />
                          </span>
                          <span className="ops-minirow-side">
                            <span>
                              {row.calls_24h > 0
                                ? `${((row.errors_24h / row.calls_24h) * 100).toFixed(1)}%`
                                : "—"}
                            </span>
                            <span>
                              {row.capPct != null
                                ? `${row.capPct.toFixed(0)}% cap`
                                : "no cap"}
                            </span>
                            <span>{row.last_seen_relative}</span>
                          </span>
                        </div>
                      ))}
                      {fleetExceptions.length > 8 && (
                        <div className="ops-minirow">
                          <span className="ops-minirow-main">
                            <span style={{ color: "var(--ops-mute)" }}>
                              + {fleetExceptions.length - 8} more
                            </span>
                          </span>
                          <span className="ops-minirow-side">
                            <Link
                              href={makeLink({ tab: "models" })}
                              className="ops-btn"
                            >
                              Models
                            </Link>
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              <div className="ops-stack">
                <section className="ops-panel">
                  <div className="ops-toolbar">
                    <h2 className="ops-panel-title">Next scheduled changes</h2>
                    <Link href="/admin/dashboard/schedules" className="ops-btn">
                      Schedules
                    </Link>
                  </div>
                  <div className="ops-panel-pad">
                    {pendingScheduled.length === 0 ? (
                      <p className="ops-empty" style={{ padding: "8px 0" }}>
                        No pending changes.
                      </p>
                    ) : (
                      pendingScheduled.map((r) => (
                        <div key={r.id} className="ops-minirow">
                          <span className="ops-minirow-main">
                            <span className="ops-truncate">
                              {r.player_name ?? r.ai_player_id}
                            </span>
                          </span>
                          <span className="ops-minirow-side">
                            <span>
                              {r.mode} {r.target_value ? "enable" : "disable"}
                            </span>
                            <span>{formatDateTime(r.apply_at)}</span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="ops-panel">
                  <div className="ops-toolbar">
                    <h2 className="ops-panel-title">Recent errors</h2>
                    <Link href={makeLink({ tab: "debug" })} className="ops-btn">
                      Debug
                    </Link>
                  </div>
                  <div className="ops-panel-pad">
                    {recentErrors.length === 0 ? (
                      <p className="ops-empty" style={{ padding: "8px 0" }}>
                        No recent errors.
                      </p>
                    ) : (
                      recentErrors.map((row) => (
                        <div key={row.id} className="ops-minirow">
                          <span className="ops-minirow-main">
                            <span className="ops-chip ops-chip-bad">
                              {row.error_type}
                            </span>
                            <span className="ops-truncate" title={row.error}>
                              {row.model_name}
                            </span>
                          </span>
                          <span className="ops-minirow-side">
                            <span>{row.created_at_relative}</span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div className="ops-links">
              <Link href={makeLink({ tab: "models" })} className="ops-btn">
                Full roster
              </Link>
              <Link href="/admin/dashboard/events" className="ops-btn">
                All events
              </Link>
            </div>
          </>
        )}

        {tab === "analytics" && (
          <>
        <section id="activity-results">
          <h2 className="mb-4 text-lg font-semibold">Per-activity results</h2>

          <div className="ops-panel-flush">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>
                    <SortHeader
                      href={activitySortLink("model_name")}
                      label="Model"
                      column="model_name"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th>
                    <SortHeader
                      href={activitySortLink("event_title")}
                      label="Event"
                      column="event_title"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th>
                    <span>Accuracy</span>
                    <span className="flex gap-2 text-xs font-normal">
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
                  </th>
                  <th className="num">
                    <SortHeader
                      href={activitySortLink("cost")}
                      label="Cost"
                      column="cost"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="ops-col-xl">
                    <SortHeader
                      href={activitySortLink("error")}
                      label="Error"
                      column="error"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th className="ops-col-xl">
                    <SortHeader
                      href={activitySortLink("created_at")}
                      label="Created"
                      column="created_at"
                      sort={aSort}
                      dir={aDir}
                    />
                  </th>
                  <th>Results</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Model" title={row.model_id}>
                      <span className="ops-cellname">
                        <span className="ops-chip ops-chip-muted">{row.mode}</span>
                        <span className="ops-truncate">{row.model_name}</span>
                      </span>
                    </td>
                    <td data-label="Event" title={row.event_title}>
                      <span className="ops-truncate">{row.event_title}</span>
                    </td>
                    <td data-label="Accuracy">
                      <span className="ops-num">
                        {formatAccuracy(row.round_accuracy)} / {formatAccuracy(row.location_accuracy)} / {formatAccuracy(row.year_accuracy)}
                      </span>
                    </td>
                    <td className="num" data-label="Cost">
                      {formatCost(toNumber(row.cost))}
                    </td>
                    <td className="ops-col-xl" data-label="Error" title={row.error || undefined}>
                      <span className="ops-truncate ops-mono" style={{ color: "var(--ops-mute)" }}>
                        {shortError(row.error)}
                      </span>
                    </td>
                    <td className="ops-col-xl" data-label="Created" style={{ color: "var(--ops-mute)" }}>
                      {formatDateTime(row.created_at)}
                    </td>
                    <td data-label="Results">
                      <Link href={detailLink(row.id)} className="ops-btn">
                        View results
                      </Link>
                    </td>
                  </tr>
                ))}
                {activityRows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      No activity results found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="ops-pagination">
              <div>
                Page {page} of {totalPages} ({totalCount.toLocaleString()} rows)
              </div>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={pageLink(page - 1)} className="ops-btn">
                    Previous
                  </Link>
                ) : (
                  <span className="ops-btn" style={{ opacity: 0.5 }}>
                    Previous
                  </span>
                )}
                {page < totalPages ? (
                  <Link href={pageLink(page + 1)} className="ops-btn">
                    Next
                  </Link>
                ) : (
                  <span className="ops-btn" style={{ opacity: 0.5 }}>
                    Next
                  </span>
                )}
              </div>
            </div>
          )}

          <p className="ops-footnote">
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
            <div className="ops-toolbar" style={{ border: "1px solid var(--ops-line)", borderRadius: 4, marginBottom: 16 }}>
              <span>
                {perModel.length} models
              </span>
              <div className="flex items-center gap-3">
                <form
                  method="get"
                  className="flex items-center gap-2 text-sm"
                  action="/admin/dashboard"
                >
                  <input type="hidden" name="tab" value="models" />
                  <label htmlFor="cap_filter" className="ops-kpi-label">
                    Cost cap
                  </label>
                  <select
                    id="cap_filter"
                    name="cap_filter"
                    defaultValue={capFilter ?? ""}
                    className="ops-input"
                  >
                    <option value="">All</option>
                    <option value="capped">Capped only</option>
                    <option value="uncapped">Uncapped only</option>
                  </select>
                  <button type="submit" className="ops-btn">
                    Filter
                  </button>
                </form>
                <Link
                  href={makeLink({ tab: "models", addModel: "1" })}
                  className="ops-btn ops-btn-primary"
                >
                  + Add model
                </Link>
              </div>
            </div>

            <div className="ops-panel-flush">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        href={modelSortLink("name")}
                        label="Model"
                        column="name"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th>Modes</th>
                    <th className="num">
                      <SortHeader
                        href={modelSortLink("total_calls")}
                        label="Calls"
                        column="total_calls"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={modelSortLink("total_cost")}
                        label="Total Cost"
                        column="total_cost"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num ops-col-xl">
                      <SortHeader
                        href={modelSortLink("cost_today")}
                        label="Cost today / 7d"
                        column="cost_today"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num">Daily cap</th>
                    <th className="ops-col-xl">Schedule</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {perModel.map((row) => {
                    const health = healthByPlayer.get(row.id);
                    const st = health ? deriveStatus(health) : null;
                    const dotCls =
                      st === "active" || st === "idle"
                        ? "ops-dot-ok"
                        : st === "erroring"
                        ? "ops-dot-bad"
                        : st === "disabled"
                        ? "ops-dot-off"
                        : "";
                    return (
                    <tr
                      key={row.id}
                      data-status={st ? statusTier(st) : undefined}
                    >
                      <td data-label="Model" title={row.model_id}>
                        <Link
                          href={makeLink({ drawer: row.id })}
                          className="ops-celllink"
                          title="Open record"
                        >
                          <span className="ops-cellname">
                            <span className={`ops-dot ${dotCls}`} />
                            <span className="ops-truncate">{row.name}</span>
                          </span>
                        </Link>
                      </td>
                      <td data-label="Modes">
                        <div className="flex gap-3">
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
                      <td className="num" data-label="Calls">
                        {row.total_calls.toLocaleString()}
                      </td>
                      <td className="num" data-label="Total Cost">
                        {formatCost(row.totalCost)}
                      </td>
                      <td
                        className="num ops-col-xl"
                        data-label="Cost today / 7d"
                        style={{ color: "var(--ops-mute)" }}
                      >
                        {formatCost(row.costToday)} / {formatCost(row.costWeek)}
                      </td>
                      <td data-label="Daily cap">
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
                            className="ops-input"
                            style={{ width: 112, textAlign: "right" }}
                          />
                          <button type="submit" className="ops-btn">
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="ops-col-xl" data-label="Schedule">
                        <details className="text-xs">
                          <summary
                            className="cursor-pointer"
                            style={{ color: "var(--ops-mute)" }}
                          >
                            Schedule…
                          </summary>
                          <form
                            action={scheduleAiPlayerModeChange}
                            className="ops-panel ops-panel-pad mt-2 flex w-56 flex-col gap-2"
                          >
                            <input type="hidden" name="playerId" value={row.id} />
                            <select name="mode" className="ops-input">
                              <option value="practice">Practice</option>
                              <option value="daily">Daily</option>
                            </select>
                            <select name="targetValue" className="ops-input">
                              <option value="enable">Enable</option>
                              <option value="disable">Disable</option>
                            </select>
                            <input
                              type="datetime-local"
                              name="applyAt"
                              required
                              className="ops-input"
                            />
                            <button type="submit" className="ops-btn">
                              Schedule change
                            </button>
                          </form>
                        </details>
                      </td>
                      <td data-label="Actions">
                        <ModelRowActions
                          playerId={row.id}
                          modelId={row.model_id}
                          isActive={row.is_active}
                        />
                      </td>
                    </tr>
                    );
                  })}
                  {perModel.length === 0 && (
                    <tr>
                      <td colSpan={8}>
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
              <p className="ops-panel ops-panel-pad ops-empty">
                No call data in the last 30 days.
              </p>
            ) : (
              <div className="space-y-4">
                {Array.from(trendByModelWithGaps.entries()).map(([playerId, entry]) => (
                  <div key={playerId} className="ops-panel ops-panel-pad">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{entry.model_name}</span>
                        <span className="ops-mono ml-2" style={{ color: "var(--ops-mute)" }}>
                          {entry.model_id}
                        </span>
                      </div>
                      <div className="ops-num" style={{ color: "var(--ops-mute)", fontSize: 13 }}>
                        30d cost: {formatCost(entry.totalCost)}
                      </div>
                    </div>

                    {entry.daily_cost_cap_usd !== null &&
                      entry.daily_cost_cap_usd > 0 && (
                        <div className="mb-3">
                          <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--ops-mute)" }}>
                            <span>Avg daily cost vs cap</span>
                            <span>
                              {formatCost(entry.totalCost / 30)} /{" "}
                              {formatCost(entry.daily_cost_cap_usd)} per day
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded" style={{ background: "var(--ops-canvas)" }}>
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (entry.totalCost / 30 / entry.daily_cost_cap_usd) *
                                    100
                                )}%`,
                                background: "var(--ops-accent)",
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
                            className="flex-1 rounded-t"
                            style={{
                              height: `${Math.max(2, widthPct)}%`,
                              background: "var(--ops-accent)",
                              opacity: d.cost > 0 ? 1 : 0.15,
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-xs" style={{ color: "var(--ops-mute)" }}>
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

            <div className="ops-panel-flush">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        href={compareSortLink("model_name")}
                        label="Model"
                        column="model_name"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={compareSortLink("total_answers")}
                        label="Answers"
                        column="total_answers"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={compareSortLink("avg_round_accuracy")}
                        label="Combo"
                        column="avg_round_accuracy"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={compareSortLink("avg_location_accuracy")}
                        label="Where"
                        column="avg_location_accuracy"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={compareSortLink("avg_year_accuracy")}
                        label="When"
                        column="avg_year_accuracy"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={compareSortLink("error_rate")}
                        label="Error %"
                        column="error_rate"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={compareSortLink("total_cost")}
                        label="Total Cost"
                        column="total_cost"
                        sort={cSort}
                        dir={cDir}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => (
                    <tr key={row.ai_player_id}>
                      <td data-label="Model" title={row.model_id}>
                        <Link
                          href={makeLink({ drawer: row.ai_player_id })}
                          className="ops-celllink"
                          title="Open record"
                        >
                          <span className="ops-cellname">
                            <span className="ops-rank">{idx + 1}</span>
                            <span className="ops-truncate">{row.model_name}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="num" data-label="Answers">
                        {(row.total_answers ?? 0).toLocaleString()}
                      </td>
                      <td
                        className="num"
                        data-label="Combo"
                        style={{
                          fontWeight: 600,
                          color: row.avg_round_accuracy != null
                            ? getAccuracyColor(toNumber(row.avg_round_accuracy))
                            : undefined,
                        }}
                      >
                        {row.avg_round_accuracy != null
                          ? `${toNumber(row.avg_round_accuracy).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td
                        className="num"
                        data-label="Where"
                        style={{
                          color: row.avg_location_accuracy != null
                            ? getAccuracyColor(toNumber(row.avg_location_accuracy))
                            : undefined,
                        }}
                      >
                        {row.avg_location_accuracy != null
                          ? `${toNumber(row.avg_location_accuracy).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td
                        className="num"
                        data-label="When"
                        style={{
                          color: row.avg_year_accuracy != null
                            ? getAccuracyColor(toNumber(row.avg_year_accuracy))
                            : undefined,
                        }}
                      >
                        {row.avg_year_accuracy != null
                          ? `${toNumber(row.avg_year_accuracy).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="num" data-label="Error %">
                        {(row.error_rate * 100).toFixed(1)}%
                      </td>
                      <td className="num" data-label="Total Cost">
                        {formatCost(toNumber(row.total_cost))}
                      </td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={7}>
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
                      className={`ops-btn ${
                        errType === opt.key ? "ops-btn-primary" : ""
                      }`}
                    >
                      {opt.label}
                    </Link>
                  )
                )}
              </div>
            </div>

            <div className="ops-panel-flush">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Event</th>
                    <th>Error</th>
                    <th>Created</th>
                    <th>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Model" title={row.model_id}>
                        <span className="ops-truncate">{row.model_name}</span>
                      </td>
                      <td data-label="Event" title={row.event_title}>
                        <span className="ops-truncate">{row.event_title}</span>
                      </td>
                      <td data-label="Error" title={row.error}>
                        <span
                          className="ops-truncate ops-mono"
                          style={{ color: "var(--ops-mute)" }}
                        >
                          {row.error}
                        </span>
                      </td>
                      <td data-label="Created" style={{ color: "var(--ops-mute)" }}>
                        {formatDateTime(row.created_at)}
                      </td>
                      <td data-label="Calls">
                        <Link
                          href={makeLink({ tab: "debug", calls: row.id })}
                          className="ops-btn"
                        >
                          View calls
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {errorRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        No error rows found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

      <ResultsModal />
      <AddModelModal />
      <CallDebugModal />

      {tab === "models" && (
        <RecordDrawer
          open={modelDrawerRow != null}
          closeHref={drawerCloseHref}
          title={modelDrawerRow?.name ?? ""}
          subtitle={modelDrawerRow?.model_id}
          fields={modelDrawerFields}
          actions={
            modelDrawerRow ? (
              <ModelRowActions
                playerId={modelDrawerRow.id}
                modelId={modelDrawerRow.model_id}
                isActive={modelDrawerRow.is_active}
              />
            ) : undefined
          }
        />
      )}

      {tab === "compare" && (
        <RecordDrawer
          open={compareDrawerRow != null}
          closeHref={drawerCloseHref}
          title={compareDrawerRow?.model_name ?? ""}
          subtitle={compareDrawerRow?.model_id}
          fields={compareDrawerFields}
        />
      )}
    </div>
  );
}


