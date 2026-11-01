import { redirect } from "next/navigation";
import Link from "next/link";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";
import { ResultsModal } from "./ResultsModal";
import { AddModelModal } from "./models/AddModelModal";
import { ModelControls } from "./models/ModelControls";
import { updateDailyCostCap } from "./models/actions";
import { scheduleAiPlayerModeChange } from "./scheduling/actions";
import { fetchCostTrend, fetchLeaderboard, fetchErrorBuckets, fetchRecentErrors, fetchCostWeek, fetchScheduledChanges, type CostTrendRow, type LeaderboardRow, type ErrorRow, type ErrorBucket, type RecentErrorRow, type ScheduledChangeRow } from "./queries";
import { getAccuracyColor } from "@/core/accuracyColor";
import { CallDebugModal } from "./CallDebugModal";
import { classifyFailure, coveragePct, deriveFailing, deriveModelState, derivePrice, deriveTrack, modelGroupKey, trackPriceGroupLabel, FAILURE_CAUSES, TRACK_LABEL, PRICE_LABEL, TRACK_PRICE_GROUP_ORDER, TRACK_GROUP_ORDER, PRICE_GROUP_ORDER, type FleetModelState, type GroupMode } from "./fleetMetrics";
import { RecordDrawer, type DrawerField } from "./components/RecordDrawer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = { [key: string]: string | string[] | undefined };

// Row shape of the read-only admin_fleet_model_stats view
// (supabase/migrations/20261101090000_admin_fleet_truth_views.sql).
type FleetStatRow = {
  ai_player_id: string;
  name: string;
  model_id: string;
  is_active: boolean;
  is_active_practice: boolean;
  is_active_daily: boolean;
  daily_cost_cap_usd: string | number | null;
  has_catalog_row: boolean;
  is_vision: boolean | null;
  is_free: boolean | null;
  availability_status: string | null;
  ok_plays: number;
  failed_plays: number;
  failed_auth: number;
  failed_gone: number;
  failed_rate_limit: number;
  failed_bad_output: number;
  failed_other: number;
  distinct_events_ok: number;
  ok_event_ids: string[] | null;
  avg_year_diff: number | null;
  avg_distance_km: number | null;
  last_ok_at: string | null;
  last_play_at: string | null;
  plays_7d: number;
  ok_7d: number;
  auth_7d: number;
};

type FleetCoverageRow = {
  eligible_total: number;
  covered_total: number;
  depth_0: number;
  depth_1: number;
  depth_2: number;
  depth_3plus: number;
  covered_vision: number;
  covered_text: number;
  covered_unknown: number;
};

type FleetRow = FleetStatRow & {
  state: ReturnType<typeof deriveModelState>;
  failing: boolean;
  failingRate: number | null;
  track: ReturnType<typeof deriveTrack>;
  price: ReturnType<typeof derivePrice>;
  coveredN: number;
  coveredPct: number;
  totalCost: number;
  costPerOk: number | null;
};

// One badge per model + one-line reason (ADMIN-BUILD-FLEETTRUTH-1101-031).
function FleetBadge({
  state,
  failing,
}: {
  state: FleetModelState;
  failing: boolean;
}) {
  const [label, cls] = failing
    ? ["Failing", "ops-chip-bad"]
    : state === "running"
    ? ["Running", "ops-chip-ok"]
    : state === "blocked"
    ? ["Blocked", "ops-chip-warn"]
    : ["Paused", "ops-chip-muted"];
  return <span className={`ops-chip ${cls}`}>{label}</span>;
}

function fleetStateTier(
  state: FleetModelState,
  failing: boolean
): "ok" | "warn" | "bad" | "off" {
  if (failing) return "bad";
  if (state === "running") return "ok";
  if (state === "blocked") return "warn";
  return "off";
}

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

// Client-side sort of the fleet rows (data set is small — one row per live
// ai_player). Sort keys match the Models tab columns; state sorts by
// severity: failing > blocked > running > paused.
const STATE_RANK: Record<FleetModelState, number> = {
  paused: 0,
  running: 1,
  blocked: 2,
};

function fleetSortValue(row: FleetRow, column: string): number | string {
  switch (column) {
    case "name":
      return row.name;
    case "state":
      return (row.failing ? 3 : STATE_RANK[row.state.state]);
    case "track":
      return TRACK_LABEL[row.track];
    case "price":
      return PRICE_LABEL[row.price];
    case "ok_plays":
      return row.ok_plays;
    case "failed":
      return row.failed_plays;
    case "covered":
      return row.coveredN;
    case "avg_year":
      return row.avg_year_diff ?? -1;
    case "avg_km":
      return row.avg_distance_km ?? -1;
    case "cost_total":
      return row.totalCost;
    case "cost_per_ok":
      return row.costPerOk ?? -1;
    case "last_ok":
      return row.last_ok_at ?? "";
    default:
      return row.ok_plays;
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

  const mSort = getParam(searchParams, "m_sort") || "ok_plays";
  const capFilterRaw = getParam(searchParams, "cap_filter") || "";
  const capFilter =
    capFilterRaw === "capped" || capFilterRaw === "uncapped" ? capFilterRaw : null;
  const mDirRaw = getParam(searchParams, "m_dir") || "desc";
  const mDir: "asc" | "desc" = mDirRaw === "asc" ? "asc" : "desc";
  const mGroupRaw = getParam(searchParams, "m_group") || "track_price";
  const mGroup: GroupMode =
    mGroupRaw === "track" || mGroupRaw === "price" || mGroupRaw === "none"
      ? mGroupRaw
      : "track_price";

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

  const needFleet = tab === "overview" || tab === "models";
  const needActivity = tab === "analytics";
  const needOverview = tab === "overview";
  const needRecentErrors = tab === "overview";
  const needCostWeek = tab === "overview";
  const needScheduled = tab === "overview";

  // Fleet truth: per-model play stats from the read-only view
  // admin_fleet_model_stats (migration 20261101090000). One row per live
  // ai_player; deleted rows never appear here (they live in Trash).
  const { rows: fleetStatRows } = needFleet
    ? await pool.query<FleetStatRow>(
        `SELECT * FROM admin_fleet_model_stats ORDER BY name`
      )
    : { rows: [] as FleetStatRow[] };

  const { rows: coverageRows } = needFleet
    ? await pool.query<FleetCoverageRow>(`SELECT * FROM admin_fleet_coverage`)
    : { rows: [] as FleetCoverageRow[] };
  const coverage = coverageRows[0] ?? null;
  const eligibleTotal = coverage?.eligible_total ?? 0;

  // Distinct eligible events with >=1 OK play, per player — from the view's
  // ok_event_ids (single eligibility definition lives in the migration).
  // Powers per-group union counts on the Models tab.
  const coveredByPlayer = new Map<string, Set<string>>();
  for (const r of fleetStatRows) {
    coveredByPlayer.set(r.ai_player_id, new Set(r.ok_event_ids ?? []));
  }

  // Per-model total cost — the existing cost computation, unchanged
  // (SUM of response_payload->'usage'->>'cost' over ai_answer_bank_calls).
  const { rows: modelCostRows } = needFleet
    ? await pool.query<{ ai_player_id: string; total_cost: string | number }>(
        `
        SELECT
          ab.ai_player_id,
          COALESCE(
            SUM((c.response_payload->'usage'->>'cost')::numeric)
            FILTER (WHERE c.response_payload IS NOT NULL),
            0
          ) AS total_cost
        FROM ai_answer_bank ab
        JOIN ai_answer_bank_calls c ON c.ai_answer_bank_id = ab.id
        GROUP BY ab.ai_player_id
        `
      )
    : { rows: [] as { ai_player_id: string; total_cost: string | number }[] };
  const costByPlayer = new Map<string, number>(
    modelCostRows.map((r) => [r.ai_player_id, toNumber(r.total_cost)])
  );

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

  // --- Fleet truth derivation (single definitions, fleetMetrics.ts) ---
  const fleet: FleetRow[] = fleetStatRows.map((row) => {
    const state = deriveModelState({
      is_active: row.is_active,
      is_active_practice: row.is_active_practice,
      is_active_daily: row.is_active_daily,
      availability_status: row.availability_status,
      has_catalog_row: row.has_catalog_row,
    });
    const fail = deriveFailing({
      plays_7d: row.plays_7d,
      ok_7d: row.ok_7d,
      auth_7d: row.auth_7d,
    });
    const coveredN = row.distinct_events_ok;
    const totalCost = costByPlayer.get(row.ai_player_id) ?? 0;
    return {
      ...row,
      state,
      failing: state.state === "running" && fail.failing,
      failingRate: fail.okRate,
      track: deriveTrack(row.is_vision),
      price: derivePrice(row.is_free, row.model_id),
      coveredN,
      coveredPct: coveragePct(coveredN, eligibleTotal),
      totalCost,
      costPerOk: row.ok_plays > 0 ? totalCost / row.ok_plays : null,
    };
  });

  // Fleet-status counts (Overview block 1).
  const runningCount = fleet.filter((r) => r.state.state === "running").length;
  const pausedCount = fleet.filter((r) => r.state.state === "paused").length;
  const blockedCount = fleet.filter((r) => r.state.state === "blocked").length;
  const failingCount = fleet.filter((r) => r.failing).length;
  const practiceRunningCount = fleet.filter(
    (r) => r.state.state === "running" && r.is_active_practice
  ).length;
  const lastOkAt = fleet.reduce((latest, row) => {
    if (row.last_ok_at && (!latest || row.last_ok_at > latest)) {
      return row.last_ok_at;
    }
    return latest;
  }, null as string | null);

  // Needs attention: only Blocked or Failing models (Paused is not an
  // exception).
  const needsAttention = fleet.filter(
    (r) => r.state.state === "blocked" || r.failing
  );

  // --- Health (24h): plays at ai_answer_bank row level, not API calls ---
  const { rows: plays24hRows } = needOverview
    ? await pool.query<{ error: string | null }>(
        `SELECT error FROM ai_answer_bank
         WHERE created_at >= now() - interval '24 hours'`
      )
    : { rows: [] as { error: string | null }[] };
  const plays24h = plays24hRows.length;
  const ok24h = plays24hRows.filter((r) => r.error === null).length;
  const failed24h = plays24h - ok24h;
  const okRate24h = plays24h > 0 ? (ok24h / plays24h) * 100 : 0;
  const cause24h: Record<string, number> = {};
  for (const r of plays24hRows) {
    const cause = classifyFailure(r.error);
    if (cause) cause24h[cause] = (cause24h[cause] ?? 0) + 1;
  }
  const auth24h = cause24h["auth"] ?? 0;

  // --- Cost (existing computation unchanged: usage cost over calls) ---
  const { rows: costTotalRows } = needOverview
    ? await pool.query<{
        cost_24h: string | number | null;
        cost_total: string | number | null;
      }>(
        `
        SELECT
          COALESCE(
            SUM((c.response_payload->'usage'->>'cost')::numeric)
              FILTER (WHERE c.response_payload IS NOT NULL AND c.created_at >= now() - interval '24 hours'),
            0
          ) AS cost_24h,
          COALESCE(
            SUM((c.response_payload->'usage'->>'cost')::numeric)
              FILTER (WHERE c.response_payload IS NOT NULL),
            0
          ) AS cost_total
        FROM ai_answer_bank_calls c
        `
      )
    : { rows: [] as { cost_24h: string | number | null; cost_total: string | number | null }[] };
  const costToday = toNumber(costTotalRows[0]?.cost_24h);
  const costTotal = toNumber(costTotalRows[0]?.cost_total);
  const costWeek = needCostWeek ? await fetchCostWeek(pool) : 0;
  const okPlaysTotal = fleet.reduce((sum, r) => sum + r.ok_plays, 0);
  const costPerOkPlay = okPlaysTotal > 0 ? costTotal / okPlaysTotal : null;

  // --- Scheduled changes + recent errors (unchanged sources) ---
  const recentErrorsRaw: RecentErrorRow[] = needRecentErrors
    ? await fetchRecentErrors(pool, 5)
    : [];
  const scheduledRaw: ScheduledChangeRow[] = needScheduled
    ? await fetchScheduledChanges(pool, { limit: 5 })
    : [];
  const pendingScheduled = scheduledRaw.filter((r) => r.status === "pending");

  const recentErrors = recentErrorsRaw.map((row) => ({
    id: row.id,
    model_name: row.model_name,
    error: row.error,
    cause: classifyFailure(row.error),
    created_at_relative: formatRelativeTime(row.created_at),
  }));

  // --- Models tab: filter, sort (client-side), group ---
  const fleetFiltered = fleet.filter(
    (r) =>
      (modelFilter === null || r.model_id === modelFilter) &&
      (capFilter === null ||
        (capFilter === "capped"
          ? r.daily_cost_cap_usd !== null
          : r.daily_cost_cap_usd === null))
  );
  const fleetSorted = [...fleetFiltered].sort((a, b) => {
    const av = fleetSortValue(a, mSort);
    const bv = fleetSortValue(b, mSort);
    const dir = mDir === "asc" ? 1 : -1;
    if (typeof av === "string" && typeof bv === "string") {
      return dir * av.localeCompare(bv);
    }
    return dir * ((av as number) - (bv as number));
  });

  type FleetGroup = {
    key: string;
    label: string | null;
    rows: FleetRow[];
    running: number;
    okPlays: number;
    coveredEvents: number;
  };
  const fleetGroups: FleetGroup[] = (() => {
    const keyOf = (r: FleetRow): string => {
      if (mGroup === "track") return r.track;
      if (mGroup === "price") return r.price;
      if (mGroup === "none") return "all";
      return modelGroupKey(r.track, r.price);
    };
    const order: readonly string[] =
      mGroup === "track"
        ? TRACK_GROUP_ORDER
        : mGroup === "price"
        ? PRICE_GROUP_ORDER
        : mGroup === "none"
        ? ["all"]
        : TRACK_PRICE_GROUP_ORDER;
    const labelOf = (key: string): string | null => {
      if (mGroup === "none") return null;
      if (mGroup === "track") return TRACK_LABEL[key as FleetRow["track"]];
      if (mGroup === "price") return PRICE_LABEL[key as FleetRow["price"]];
      return trackPriceGroupLabel(key);
    };
    const buckets = new Map<string, FleetRow[]>();
    for (const r of fleetSorted) {
      const k = keyOf(r);
      const arr = buckets.get(k) ?? [];
      arr.push(r);
      buckets.set(k, arr);
    }
    const keys = [...buckets.keys()].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b)
    );
    return keys.map((key) => {
      const rows = buckets.get(key) ?? [];
      const union = new Set<string>();
      let running = 0;
      let okPlays = 0;
      for (const r of rows) {
        if (r.state.state === "running") running++;
        okPlays += r.ok_plays;
        for (const ev of coveredByPlayer.get(r.ai_player_id) ?? []) {
          union.add(ev);
        }
      }
      return {
        key,
        label: labelOf(key),
        rows,
        running,
        okPlays,
        coveredEvents: union.size,
      };
    });
  })();

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
      ? fleet.find((r) => r.ai_player_id === drawerId) ?? null
      : null;
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
          label: "State",
          value: (
            <span className="flex items-center gap-2">
              <FleetBadge
                state={modelDrawerRow.state.state}
                failing={modelDrawerRow.failing}
              />
              {modelDrawerRow.state.reason}
              {modelDrawerRow.state.unverified && (
                <span className="ops-chip ops-chip-muted">unverified</span>
              )}
            </span>
          ),
        },
        {
          label: "Track / Price",
          value: `${TRACK_LABEL[modelDrawerRow.track]} · ${PRICE_LABEL[modelDrawerRow.price]}`,
        },
        {
          label: "Modes",
          value: `${modelDrawerRow.is_active_practice ? "Practice on" : "Practice off"} · ${modelDrawerRow.is_active_daily ? "Daily on" : "Daily off"}`,
        },
        {
          label: "OK plays / Failed",
          value: `${modelDrawerRow.ok_plays.toLocaleString()} / ${modelDrawerRow.failed_plays.toLocaleString()}`,
        },
        {
          label: "Events covered",
          value: `${modelDrawerRow.coveredN.toLocaleString()} (${modelDrawerRow.coveredPct.toFixed(1)}%)`,
        },
        { label: "Cost (total)", value: formatCost(modelDrawerRow.totalCost) },
        {
          label: "Daily cap (USD)",
          value: modelDrawerRow.daily_cost_cap_usd ?? "No cap",
        },
        {
          label: "Last successful play",
          value: formatDateTime(modelDrawerRow.last_ok_at),
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
        </div>
      </header>

        {tab === "overview" && (
          <>
            <div className="ops-grid-2col" style={{ marginBottom: 16 }}>
              <section className="ops-panel">
                <div className="ops-toolbar">
                  <h2 className="ops-panel-title">Fleet status</h2>
                  <Link href={makeLink({ tab: "models" })} className="ops-btn">
                    Models
                  </Link>
                </div>
                <div className="ops-panel-pad">
                  <div className="ops-kpi-value">
                    {runningCount.toLocaleString()} running
                  </div>
                  <p className="ops-panel-sub">
                    {pausedCount.toLocaleString()} paused ·{" "}
                    {blockedCount.toLocaleString()} blocked
                    {failingCount > 0 &&
                      ` · ${failingCount.toLocaleString()} failing`}
                  </p>
                  <p className="ops-panel-sub" style={{ marginTop: 8 }}>
                    Last successful play: {formatRelativeTime(lastOkAt)}
                  </p>
                </div>
              </section>

              <section className="ops-panel">
                <div className="ops-toolbar">
                  <h2 className="ops-panel-title">Coverage</h2>
                  <Link href="/admin/dashboard/events" className="ops-btn">
                    Events
                  </Link>
                </div>
                <div className="ops-panel-pad">
                  <div className="ops-kpi-label">Events covered</div>
                  <div className="ops-kpi-value">
                    {(coverage?.covered_total ?? 0).toLocaleString()} /{" "}
                    {eligibleTotal.toLocaleString()} (
                    {coveragePct(
                      coverage?.covered_total ?? 0,
                      eligibleTotal
                    ).toFixed(1)}
                    %)
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded"
                    style={{ background: "var(--ops-canvas)", margin: "8px 0" }}
                  >
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.min(
                          100,
                          coveragePct(
                            coverage?.covered_total ?? 0,
                            eligibleTotal
                          )
                        )}%`,
                        background: "var(--ops-accent)",
                      }}
                    />
                  </div>
                  <p className="ops-panel-sub">
                    Vision {(coverage?.covered_vision ?? 0).toLocaleString()} ·
                    Text-only {(coverage?.covered_text ?? 0).toLocaleString()} ·
                    Unknown{" "}
                    {(coverage?.covered_unknown ?? 0).toLocaleString()}
                  </p>
                  <p className="ops-panel-sub">
                    Models per event — 0:{" "}
                    {(coverage?.depth_0 ?? 0).toLocaleString()} · 1:{" "}
                    {(coverage?.depth_1 ?? 0).toLocaleString()} · 2:{" "}
                    {(coverage?.depth_2 ?? 0).toLocaleString()} · 3+:{" "}
                    {(coverage?.depth_3plus ?? 0).toLocaleString()}
                  </p>
                  <div className="ops-minirow" style={{ marginTop: 8 }}>
                    <span className="ops-minirow-main">
                      Practice: {practiceRunningCount.toLocaleString()} models
                      running
                    </span>
                  </div>
                  {practiceRunningCount === 0 && (
                    <p
                      className="ops-panel-sub"
                      style={{ color: "var(--ops-bad)", fontWeight: 600 }}
                    >
                      No model is running Practice mode.
                    </p>
                  )}
                  <p className="ops-footnote">
                    Verified in the runner: Daily mode replays only
                    today&apos;s daily-challenge events
                    (daily-autoplay.ts → daily_challenges.event_ids, UTC+14
                    date); Practice is the catalogue-wide mode.
                  </p>
                </div>
              </section>
            </div>

            <div className="ops-grid-2col" style={{ marginBottom: 16 }}>
              <section className="ops-panel">
                <div className="ops-toolbar">
                  <h2 className="ops-panel-title">Health (24h)</h2>
                  <Link href={makeLink({ tab: "debug" })} className="ops-btn">
                    Debug
                  </Link>
                </div>
                <div className="ops-panel-pad">
                  <div className="ops-kpi-value">
                    {ok24h.toLocaleString()} OK /{" "}
                    {failed24h.toLocaleString()} failed
                  </div>
                  <p className="ops-panel-sub">
                    {okRate24h.toFixed(1)}% of {plays24h.toLocaleString()}{" "}
                    plays OK
                  </p>
                  {failed24h > 0 && (
                    <p className="ops-panel-sub" style={{ marginTop: 4 }}>
                      Failed by cause —{" "}
                      {FAILURE_CAUSES.filter((c) => (cause24h[c] ?? 0) > 0)
                        .map((c) => `${c}: ${cause24h[c]}`)
                        .join(" · ")}
                    </p>
                  )}
                  {auth24h > 0 && (
                    <p
                      className="ops-panel-sub"
                      style={{
                        color: "var(--ops-bad)",
                        fontWeight: 600,
                        marginTop: 8,
                      }}
                    >
                      Provider key rejected (401) — fleet-wide, not a model
                      fault
                    </p>
                  )}
                </div>
              </section>

              <section className="ops-panel">
                <div className="ops-toolbar">
                  <h2 className="ops-panel-title">Cost</h2>
                  <Link
                    href={makeLink({ tab: "analytics" })}
                    className="ops-btn"
                  >
                    Analytics
                  </Link>
                </div>
                <div className="ops-panel-pad">
                  <div className="ops-minirow">
                    <span className="ops-minirow-main">Today</span>
                    <span className="ops-minirow-side">
                      {formatCost(costToday)}
                    </span>
                  </div>
                  <div className="ops-minirow">
                    <span className="ops-minirow-main">Last 7 days</span>
                    <span className="ops-minirow-side">
                      {formatCost(costWeek)}
                    </span>
                  </div>
                  <div className="ops-minirow">
                    <span className="ops-minirow-main">Total</span>
                    <span className="ops-minirow-side">
                      {formatCost(costTotal)}
                    </span>
                  </div>
                  <div className="ops-minirow">
                    <span className="ops-minirow-main">Per OK play</span>
                    <span className="ops-minirow-side">
                      {costPerOkPlay !== null
                        ? formatCost(costPerOkPlay)
                        : "—"}
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <div className="ops-grid-2col">
              <section className="ops-panel">
                <div className="ops-toolbar">
                  <h2 className="ops-panel-title">Needs attention</h2>
                  <Link href={makeLink({ tab: "models" })} className="ops-btn">
                    Models
                  </Link>
                </div>
                <div className="ops-panel-pad">
                  {needsAttention.length === 0 ? (
                    <div className="ops-minirow">
                      <span className="ops-minirow-main">
                        <span className="ops-dot ops-dot-ok" />
                        No models need attention
                      </span>
                    </div>
                  ) : (
                    <>
                      {needsAttention.slice(0, 8).map((row) => (
                        <div key={row.ai_player_id} className="ops-minirow">
                          <span className="ops-minirow-main">
                            <span
                              className={`ops-dot ${
                                row.failing ? "ops-dot-bad" : "ops-dot-warn"
                              }`}
                            />
                            <span className="ops-truncate" title={row.model_id}>
                              {row.name}
                            </span>
                            <FleetBadge
                              state={row.state.state}
                              failing={row.failing}
                            />
                          </span>
                          <span className="ops-minirow-side">
                            <span>
                              {row.failing
                                ? `OK-rate ${(100 * (row.failingRate ?? 0)).toFixed(0)}% (7d)`
                                : row.state.reason}
                            </span>
                            <span>{formatRelativeTime(row.last_ok_at)}</span>
                          </span>
                        </div>
                      ))}
                      {needsAttention.length > 8 && (
                        <div className="ops-minirow">
                          <span className="ops-minirow-main">
                            <span style={{ color: "var(--ops-mute)" }}>
                              + {needsAttention.length - 8} more
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
                              {row.cause ?? "other"}
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

            <details className="ops-panel" style={{ marginTop: 16 }}>
              <summary
                className="ops-panel-pad"
                style={{ cursor: "pointer", color: "var(--ops-mute)" }}
              >
                Definitions
              </summary>
              <div
                className="ops-panel-pad"
                style={{ borderTop: "1px solid var(--ops-line)" }}
              >
                <ul className="ops-panel-sub" style={{ paddingLeft: 18, margin: 0 }}>
                  <li>
                    Eligible event: a validated event with at least one image.
                  </li>
                  <li>
                    Play: one ai_answer_bank row. OK = error IS NULL; failed =
                    error IS NOT NULL. API calls (ai_answer_bank_calls) are not
                    plays — they appear only on the Debug page.
                  </li>
                  <li>
                    Failure cause (from error text): auth = contains 401, gone
                    = contains 404, rate_limit = contains 429, bad_output =
                    starts with &quot;Failed to parse&quot; or contains
                    &quot;missing finalGuess&quot;, other = anything else.
                  </li>
                  <li>
                    State: Paused = Enabled switch off. Blocked = Enabled on
                    but no mode selected, or the catalog says the model is not
                    available (reason shown). Running = Enabled on plus a mode
                    flag and not blocked. Failing = running model with ≥5
                    non-auth plays in 7 days and OK-rate under 50%.
                  </li>
                  <li>
                    Track: Vision / Text-only from the OpenRouter catalog
                    (is_vision); Unknown when the model has no catalog row
                    (shown as &quot;unverified&quot;).
                  </li>
                  <li>
                    Price: Free = catalog is_free or a model id ending in
                    &quot;:free&quot;; Paid = catalog is_free false; Unknown =
                    no catalog row.
                  </li>
                  <li>
                    Coverage: an eligible event is covered when at least one
                    model has an OK play on it. Depth = how many distinct
                    models have an OK play (0 / 1 / 2 / 3+).
                  </li>
                </ul>
              </div>
            </details>

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
                {fleetFiltered.length} models
              </span>
              <div className="flex items-center gap-3">
                <form
                  method="get"
                  className="flex items-center gap-2 text-sm"
                  action="/admin/dashboard"
                >
                  <input type="hidden" name="tab" value="models" />
                  <label htmlFor="m_group" className="ops-kpi-label">
                    Group by
                  </label>
                  <select
                    id="m_group"
                    name="m_group"
                    defaultValue={mGroup}
                    className="ops-input"
                  >
                    <option value="track_price">Track + Price</option>
                    <option value="track">Track</option>
                    <option value="price">Price</option>
                    <option value="none">None</option>
                  </select>
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
                    Apply
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
                    <th>
                      <SortHeader
                        href={modelSortLink("state")}
                        label="State"
                        column="state"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th>
                      <SortHeader
                        href={modelSortLink("track")}
                        label="Track"
                        column="track"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th>
                      <SortHeader
                        href={modelSortLink("price")}
                        label="Price"
                        column="price"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={modelSortLink("ok_plays")}
                        label="OK plays"
                        column="ok_plays"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={modelSortLink("failed")}
                        label="Failed"
                        column="failed"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={modelSortLink("covered")}
                        label="Events covered"
                        column="covered"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num ops-col-xl">
                      <SortHeader
                        href={modelSortLink("avg_year")}
                        label="Avg year err"
                        column="avg_year"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num ops-col-xl">
                      <SortHeader
                        href={modelSortLink("avg_km")}
                        label="Avg km err"
                        column="avg_km"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num">
                      <SortHeader
                        href={modelSortLink("cost_total")}
                        label="Cost total"
                        column="cost_total"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="num ops-col-xl">
                      <SortHeader
                        href={modelSortLink("cost_per_ok")}
                        label="Cost/OK play"
                        column="cost_per_ok"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th className="ops-col-xl">
                      <SortHeader
                        href={modelSortLink("last_ok")}
                        label="Last successful"
                        column="last_ok"
                        sort={mSort}
                        dir={mDir}
                      />
                    </th>
                    <th>Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {fleetGroups.flatMap((g) => [
                    ...(g.label !== null
                      ? [
                          <tr key={`group-${g.key}`}>
                            <td
                              colSpan={13}
                              style={{
                                background: "var(--ops-canvas)",
                                color: "var(--ops-mute)",
                                fontWeight: 600,
                              }}
                            >
                              {g.label} — {g.rows.length} models ·{" "}
                              {g.running} running ·{" "}
                              {g.okPlays.toLocaleString()} OK plays ·{" "}
                              {g.coveredEvents.toLocaleString()} events
                              covered
                            </td>
                          </tr>,
                        ]
                      : []),
                    ...g.rows.map((row) => {
                      const dotCls = row.failing
                        ? "ops-dot-bad"
                        : row.state.state === "running"
                        ? "ops-dot-ok"
                        : row.state.state === "blocked"
                        ? "ops-dot-warn"
                        : "ops-dot-off";
                      return (
                        <tr
                          key={row.ai_player_id}
                          data-status={fleetStateTier(
                            row.state.state,
                            row.failing
                          )}
                        >
                          <td data-label="Model" title={row.model_id}>
                            <Link
                              href={makeLink({ drawer: row.ai_player_id })}
                              className="ops-celllink"
                              title="Open record"
                            >
                              <span className="ops-cellname">
                                <span className={`ops-dot ${dotCls}`} />
                                <span className="ops-truncate">{row.name}</span>
                              </span>
                            </Link>
                          </td>
                          <td data-label="State">
                            <span className="flex items-center gap-1" style={{ flexWrap: "wrap" }}>
                              <FleetBadge
                                state={row.state.state}
                                failing={row.failing}
                              />
                              <span style={{ color: "var(--ops-mute)" }}>
                                {row.failing
                                  ? `OK-rate ${(100 * (row.failingRate ?? 0)).toFixed(0)}% (7d)`
                                  : row.state.reason}
                              </span>
                              {row.state.unverified && (
                                <span className="ops-chip ops-chip-muted">
                                  unverified
                                </span>
                              )}
                            </span>
                          </td>
                          <td data-label="Track">
                            {TRACK_LABEL[row.track]}
                          </td>
                          <td data-label="Price">
                            {PRICE_LABEL[row.price]}
                          </td>
                          <td className="num" data-label="OK plays">
                            {row.ok_plays.toLocaleString()}
                          </td>
                          <td className="num" data-label="Failed">
                            {row.failed_plays.toLocaleString()}
                          </td>
                          <td className="num" data-label="Events covered">
                            {row.coveredN.toLocaleString()} (
                            {row.coveredPct.toFixed(1)}%)
                          </td>
                          <td
                            className="num ops-col-xl"
                            data-label="Avg year err"
                          >
                            {row.avg_year_diff !== null
                              ? toNumber(row.avg_year_diff).toFixed(1)
                              : "—"}
                          </td>
                          <td
                            className="num ops-col-xl"
                            data-label="Avg km err"
                          >
                            {row.avg_distance_km !== null
                              ? toNumber(row.avg_distance_km).toFixed(0)
                              : "—"}
                          </td>
                          <td className="num" data-label="Cost total">
                            {formatCost(row.totalCost)}
                          </td>
                          <td
                            className="num ops-col-xl"
                            data-label="Cost/OK play"
                          >
                            {row.costPerOk !== null
                              ? formatCost(row.costPerOk)
                              : "—"}
                          </td>
                          <td
                            className="ops-col-xl"
                            data-label="Last successful"
                            style={{ color: "var(--ops-mute)" }}
                          >
                            {formatRelativeTime(row.last_ok_at)}
                          </td>
                          <td data-label="Controls">
                            <div className="flex flex-col gap-2">
                              <ModelControls
                                playerId={row.ai_player_id}
                                modelId={row.model_id}
                                isActive={row.is_active}
                                isPractice={row.is_active_practice}
                                isDaily={row.is_active_daily}
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <form
                                  action={updateDailyCostCap}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="hidden"
                                    name="playerId"
                                    value={row.ai_player_id}
                                  />
                                  <input
                                    type="number"
                                    name="cap"
                                    step="0.000001"
                                    min="0"
                                    defaultValue={
                                      row.daily_cost_cap_usd ?? ""
                                    }
                                    placeholder="No cap"
                                    className="ops-input"
                                    style={{ width: 96, textAlign: "right" }}
                                    title="Daily cost cap (USD)"
                                  />
                                  <button type="submit" className="ops-btn">
                                    Save
                                  </button>
                                </form>
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
                                    <input
                                      type="hidden"
                                      name="playerId"
                                      value={row.ai_player_id}
                                    />
                                    <select name="mode" className="ops-input">
                                      <option value="practice">Practice</option>
                                      <option value="daily">Daily</option>
                                    </select>
                                    <select
                                      name="targetValue"
                                      className="ops-input"
                                    >
                                      <option value="enable">Enable</option>
                                      <option value="disable">Disable</option>
                                    </select>
                                    <input
                                      type="datetime-local"
                                      name="applyAt"
                                      required
                                      className="ops-input"
                                    />
                                    <p
                                      className="text-xs"
                                      style={{ color: "var(--ops-mute)" }}
                                    >
                                      Time is read as UTC. Changes are applied
                                      by the daily 00:00 UTC cron, on its first
                                      run after this time.
                                    </p>
                                    <button type="submit" className="ops-btn">
                                      Schedule change
                                    </button>
                                  </form>
                                </details>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }),
                  ])}
                  {fleetFiltered.length === 0 && (
                    <tr>
                      <td colSpan={13}>No models found.</td>
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
                    <th>API calls</th>
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
                      <td data-label="API calls">
                        <Link
                          href={makeLink({ tab: "debug", calls: row.id })}
                          className="ops-btn"
                        >
                          View API calls
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
              <ModelControls
                playerId={modelDrawerRow.ai_player_id}
                modelId={modelDrawerRow.model_id}
                isActive={modelDrawerRow.is_active}
                isPractice={modelDrawerRow.is_active_practice}
                isDaily={modelDrawerRow.is_active_daily}
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


