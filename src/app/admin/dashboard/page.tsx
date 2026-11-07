import { redirect } from "next/navigation";
import Link from "next/link";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";
import { fetchSpendTodayByPlayer, getFleetDailyCap } from "@/server/aiSpend";
import {
  classifyPlayer,
  catalogModelFromRow,
  type CatalogModelRow,
} from "@/core/aiEligibility";
import { derivePrice } from "./fleetMetrics";
import {
  fetchFleetRoster,
  fetchModelUsage,
  fetchFleetSpend7d,
  fetchDeferralStats,
  fetchEligibleEventStats,
  fetchAuditVotes,
  fetchPracticePlays7d,
  fetchRecentErrorRows,
  fetchRecentFleetRuns,
  fetchOpenFleetAlerts,
  fetchRateSettings,
} from "./queries";
import { setFleetDailyCap, updateRateSettings } from "./actions";
import { updateDailyCostCap } from "./models/actions";
import { scheduleAiPlayerModeChange } from "./scheduling/actions";
import {
  AI_RATE_SETTING_KEYS,
  RATE_SETTING_META,
  rateSettingDisplayValue,
  type AiRateSettingKey,
} from "./fleetData";
import {
  buildRecommendations,
  classifyEventAudit,
  classifyModelStatus,
  classifyProblem,
  describeRun,
  FLEET_MODEL_STATUS_LABEL,
  PROBLEM_CLASS_INFO,
  PROBLEM_CLASS_LABEL,
  type FleetModelStatus,
  type ProblemClass,
} from "./fleetOverview";
import { SortableTable, type SortableColumn, type SortableRow } from "./SortableTable";
import { FleetModelsTable, type FleetModelTableRow } from "./FleetModelsTable";
import { CollapsibleSection, DismissAlertButton, ModeToggle } from "./FleetControls";
import { ModelControls } from "./models/ModelControls";
import { RecordDrawer, type DrawerField } from "./components/RecordDrawer";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

const HOUR_MS = 3_600_000;
const RATE_LIMIT_RECENT_MS = 36 * HOUR_MS;

function getParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function fmtRelative(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diff = nowMs - ms;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fleet-card">
      <h3 className="fleet-card-title">{title}</h3>
      <div className="fleet-card-body">{children}</div>
    </section>
  );
}

function Bar({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="fleet-bar"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="fleet-bar-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}

const STATUS_CHIP_CLASS: Record<FleetModelStatus, string> = {
  playing: "ops-chip ops-chip-ok",
  waiting: "ops-chip ops-chip-info",
  stopped: "ops-chip ops-chip-bad",
  off: "ops-chip ops-chip-muted",
};

const RUN_KIND_LABEL: Record<string, string> = {
  daily: "Daily play",
  practice: "Coverage",
  manual: "Manual",
};

export default async function AiFleetPage({
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
  const nowMs = Date.now();
  const utcToday = new Date(nowMs).toISOString().slice(0, 10);
  const drawerId = getParam(searchParams, "drawer") ?? null;

  const [
    roster,
    usage,
    spend7d,
    deferrals,
    eventStats,
    auditVotes,
    practicePlays7d,
    errorRows,
    runs,
    alerts,
    settingsRows,
    spendToday,
    fleetCap,
  ] = await Promise.all([
    fetchFleetRoster(pool),
    fetchModelUsage(pool, utcToday),
    fetchFleetSpend7d(pool),
    fetchDeferralStats(pool),
    fetchEligibleEventStats(pool),
    fetchAuditVotes(pool),
    fetchPracticePlays7d(pool),
    fetchRecentErrorRows(pool, { days: 7, limit: 3000 }),
    fetchRecentFleetRuns(pool, 15),
    fetchOpenFleetAlerts(pool),
    fetchRateSettings(pool),
    fetchSpendTodayByPlayer(pool, utcToday),
    getFleetDailyCap(pool),
  ]);

  const usageByPlayer = new Map(
    usage.filter((u) => u.ai_player_id !== null).map((u) => [u.ai_player_id as string, u])
  );
  const deferByPlayer = new Map(deferrals.map((d) => [d.ai_player_id, d]));
  const settingsByKey = new Map(settingsRows.map((s) => [s.key, s.value]));

  const fleetSpendToday = spendToday.total;
  const fleetHalted =
    alerts.some((a) => a.kind === "auth_fleet") ||
    runs.some(
      (r) =>
        r.halt_reason === "auth_fleet" &&
        Date.parse(r.started_at) > nowMs - 24 * HOUR_MS
    );

  // ---------------- per-model view rows ----------------
  type ModelView = {
    row: (typeof roster)[number];
    playerId: string;
    name: string;
    modelId: string;
    price: string;
    status: FleetModelStatus;
    whyText: string;
    eventsPlayed: number;
    spendTodayUsd: number;
    cost7dUsd: number;
    callsToday: number;
    lastSuccessAt: string | null;
    dailyCapUsd: number | null;
    catalogAvailable: boolean;
    deadSlug: boolean;
    ownCapReached: boolean;
    capStoppedAtMs: number | null;
    rateLimitDays3d: number;
    rateLimited: boolean;
    suggestible: boolean;
    dailyOn: boolean;
    practiceOn: boolean;
    role: string;
    isActive: boolean;
  };

  const modelViews: ModelView[] = roster.map((row) => {
    const catalogRow: CatalogModelRow = {
      model_id: row.model_id,
      is_free: row.is_free,
      is_vision: row.is_vision,
      availability_status: row.availability_status,
      context_length: row.context_length,
      price_prompt_usd: row.price_prompt_usd,
      price_completion_usd: row.price_completion_usd,
    };
    const catalogModel = catalogModelFromRow(catalogRow);
    const verdict = classifyPlayer(
      {
        id: row.ai_player_id,
        model_id: row.model_id,
        is_active: row.is_active,
        is_active_daily: row.is_active_daily,
        is_active_practice: row.is_active_practice,
        deleted_at: null,
      },
      catalogModel,
      { action: "proceed" }
    );
    const u = usageByPlayer.get(row.ai_player_id);
    const d = deferByPlayer.get(row.ai_player_id);
    const spendTodayUsd = num(u?.cost_today);
    const cost7dUsd = num(u?.cost_7d);
    const lastCallMs = u?.last_call_today ? Date.parse(u.last_call_today) : null;
    const lastSuccessMs = row.last_success_at ? Date.parse(row.last_success_at) : null;
    const dailyCapUsd =
      row.daily_cost_cap_usd === null ? null : num(row.daily_cost_cap_usd);
    const cap =
      dailyCapUsd !== null && Number.isFinite(dailyCapUsd) && dailyCapUsd > 0
        ? dailyCapUsd
        : null;
    const ownCapReached = cap !== null && spendTodayUsd >= cap;
    const rateLimited =
      d?.last_deferred_at != null &&
      Date.parse(d.last_deferred_at) >= nowMs - RATE_LIMIT_RECENT_MS;
    const statusRes = classifyModelStatus({
      nowMs,
      catalogAvailable: catalogModel !== null,
      eligibilityRole: verdict.role,
      eligibilityReason: verdict.reason,
      isVision: catalogModel?.isVision === true,
      isActiveDaily: row.is_active_daily === true,
      isActivePractice: row.is_active_practice === true,
      freeVisionAlwaysOn: verdict.reason === "free_vision",
      spendTodayUsd,
      dailyCapUsd: cap,
      fleetSpendTodayUsd: fleetSpendToday,
      fleetCapUsd: fleetCap,
      fleetHalted,
      rateLimited,
      lastSuccessAtMs: lastSuccessMs,
      lastActivityAtMs: lastCallMs,
    });
    return {
      row,
      playerId: row.ai_player_id,
      name: row.name,
      modelId: row.model_id,
      price: derivePrice(row.is_free, row.model_id),
      status: statusRes.status,
      whyText: statusRes.whyText,
      eventsPlayed: row.events_played,
      spendTodayUsd,
      cost7dUsd,
      callsToday: u?.calls_today ?? 0,
      lastSuccessAt: row.last_success_at,
      dailyCapUsd: cap,
      catalogAvailable: catalogModel !== null,
      deadSlug: catalogModel === null,
      ownCapReached,
      capStoppedAtMs: ownCapReached ? lastCallMs : null,
      rateLimitDays3d: d?.defer_days_3d ?? 0,
      rateLimited,
      suggestible: verdict.role === "player" && verdict.tier !== "free",
      dailyOn: row.is_active_daily === true,
      practiceOn: row.is_active_practice === true,
      role: verdict.role,
      isActive: row.is_active === true,
    };
  });

  // ---------------- summary numbers ----------------
  const totalModels = modelViews.length;
  const visionCount = roster.filter((r) => r.is_vision === true).length;
  const textCount = roster.filter((r) => r.is_vision === false).length;
  const unknownCatalog = roster.filter((r) => r.is_vision === null).length;
  const askedToday = modelViews.filter((m) => m.callsToday > 0).length;
  const offCount = modelViews.filter((m) => m.status === "off").length;
  const dailyOnCount = roster.filter((r) => r.is_active_daily === true).length;
  const practiceOnCount = roster.filter((r) => r.is_active_practice === true).length;
  const eligibleModels = modelViews.filter((m) => m.role === "player").length;

  const eligibleTotal = eventStats.eligible_total;
  const eventsPct =
    eligibleTotal > 0 ? (eventStats.events_with_play / eligibleTotal) * 100 : 0;
  const avgModelsPerEvent =
    eligibleTotal > 0 ? eventStats.ok_pairs / eligibleTotal : 0;

  // Audit verdicts per event
  const auditByEvent = new Map<string, { t: number; f: number; u: number }>();
  for (const v of auditVotes) {
    const e = auditByEvent.get(v.event_id) ?? { t: 0, f: 0, u: 0 };
    if (v.is_real_event === "real" || v.is_real_event === "likely_real") e.t += v.n;
    else if (v.is_real_event === "doubtful" || v.is_real_event === "fabricated") e.f += v.n;
    else e.u += v.n;
    auditByEvent.set(v.event_id, e);
  }
  let auditTrue = 0;
  let auditFalse = 0;
  let auditUnsure = 0;
  for (const e of auditByEvent.values()) {
    const v = classifyEventAudit(e.t, e.f, e.u);
    if (v === "true") auditTrue++;
    else if (v === "false") auditFalse++;
    else auditUnsure++;
  }
  const auditedEvents = auditByEvent.size;
  const auditedPct = eligibleTotal > 0 ? (auditedEvents / eligibleTotal) * 100 : 0;

  // Spend
  const spendPct = fleetCap && fleetCap > 0 ? (fleetSpendToday / fleetCap) * 100 : 0;

  // ---------------- recommendations ----------------
  const recommendations = buildRecommendations({
    nowMs,
    fleetSpendTodayUsd: fleetSpendToday,
    fleetCapUsd: fleetCap,
    fleetHalted,
    practicePlaysLast7d: practicePlays7d,
    alerts: alerts.map((a) => ({
      id: a.id,
      kind: a.kind,
      severity: a.severity,
      message: a.message,
      occurrences: a.occurrences,
    })),
    models: modelViews.map((m) => ({
      playerId: m.playerId,
      name: m.name,
      modelId: m.modelId,
      status: m.status,
      deadSlug: m.deadSlug,
      ownCapReached: m.ownCapReached,
      ownCapUsd: m.dailyCapUsd,
      capStoppedAtMs: m.capStoppedAtMs,
      rateLimitDays3d: m.rateLimitDays3d,
      suggestible: m.suggestible,
      dailyOn: m.dailyOn,
      practiceOn: m.practiceOn,
    })),
  });

  // ---------------- models table ----------------
  const eligibleDenom = Math.max(eligibleTotal, 1);
  const modelColumns: SortableColumn[] = [
    { key: "model", label: "Model", kind: "text" },
    { key: "price", label: "Price", kind: "text" },
    { key: "daily", label: "Daily", kind: "text" },
    { key: "practice", label: "Practice", kind: "text" },
    { key: "status", label: "Status", kind: "text" },
    { key: "why", label: "Why", kind: "text" },
    { key: "events", label: "Events played", kind: "number", align: "right" },
    { key: "costToday", label: "Cost today", kind: "number", align: "right" },
    { key: "cost7d", label: "Cost 7 days", kind: "number", align: "right" },
    { key: "lastSuccess", label: "Last success", kind: "date", align: "right" },
  ];

  const modelRows: FleetModelTableRow[] = modelViews.map((m) => {
    const eventsPctModel = (m.eventsPlayed / eligibleDenom) * 100;
    const costBarDenom = m.dailyCapUsd ?? fleetCap ?? 0;
    const costBarPct = costBarDenom > 0 ? (m.spendTodayUsd / costBarDenom) * 100 : 0;
    const drawerHref = `/admin/dashboard?drawer=${m.playerId}`;
    return {
      id: m.playerId,
      status: m.status,
      sort: {
        model: m.name.toLowerCase(),
        price: m.price,
        daily: m.dailyOn ? 1 : 0,
        practice: m.practiceOn ? 1 : 0,
        status: FLEET_MODEL_STATUS_LABEL[m.status],
        why: m.whyText,
        events: m.eventsPlayed,
        costToday: m.spendTodayUsd,
        cost7d: m.cost7dUsd,
        lastSuccess: m.lastSuccessAt,
      },
      cells: [
        <span key="m" className="fleet-modelcell">
          <Link href={drawerHref} className="ops-celllink" title="Open details">
            <span className="ops-cellname">
              <span className="ops-truncate">{m.name}</span>
            </span>
          </Link>
          <span className="fleet-modelid">{m.modelId}</span>
        </span>,
        <span key="p">{m.price === "unknown" ? "Unknown" : m.price === "free" ? "Free" : "Paid"}</span>,
        <ModeToggle key="d" playerId={m.playerId} mode="daily" on={m.dailyOn} label="Daily" />,
        <ModeToggle key="pr" playerId={m.playerId} mode="practice" on={m.practiceOn} label="Practice" />,
        <span key="s" className={STATUS_CHIP_CLASS[m.status]}>
          {FLEET_MODEL_STATUS_LABEL[m.status]}
        </span>,
        <span key="w" className="fleet-why">{m.whyText}</span>,
        <span key="e" className="fleet-numcell">
          {m.eventsPlayed} / {eligibleTotal}
          <Bar pct={eventsPctModel} label={`${m.name} events played`} />
        </span>,
        <span key="ct" className="fleet-numcell">
          {fmtUsd(m.spendTodayUsd)}
          <Bar pct={costBarPct} label={`${m.name} cost today vs cap`} />
        </span>,
        <span key="c7" className="fleet-numcell">{fmtUsd(m.cost7dUsd)}</span>,
        <span key="ls">{fmtRelative(m.lastSuccessAt, nowMs)}</span>,
      ],
    };
  });

  const totalEventsPlayed = modelViews.reduce((s, m) => s + m.eventsPlayed, 0);
  const totalCostToday = modelViews.reduce((s, m) => s + m.spendTodayUsd, 0);
  const totalCost7d = modelViews.reduce((s, m) => s + m.cost7dUsd, 0);
  const latestSuccess = modelViews
    .map((m) => m.lastSuccessAt)
    .filter((x): x is string => x !== null)
    .sort()
    .pop();
  // Spend on players no longer in the live roster (soft-deleted etc.).
  const rosterIds = new Set(modelViews.map((m) => m.playerId));
  let unattributedToday = 0;
  let unattributed7d = 0;
  for (const u of usage) {
    if (u.ai_player_id === null || rosterIds.has(u.ai_player_id)) continue;
    unattributedToday += num(u.cost_today);
    unattributed7d += num(u.cost_7d);
  }

  const modelFooter: React.ReactNode[] = [
    <strong key="t">Totals</strong>,
    "—",
    "—",
    "—",
    "—",
    `${totalEventsPlayed.toLocaleString()} plays`,
    fmtUsd(totalCostToday),
    fmtUsd(totalCost7d),
    latestSuccess ? fmtRelative(latestSuccess, nowMs) : "—",
  ];

  // ---------------- recent runs ----------------
  const runColumns: SortableColumn[] = [
    { key: "started", label: "Started", kind: "date" },
    { key: "kind", label: "Kind", kind: "text" },
    { key: "models", label: "Models", kind: "text" },
    { key: "plays", label: "Plays", kind: "number", align: "right" },
    { key: "refused", label: "Refused", kind: "number", align: "right" },
    { key: "cost", label: "Cost", kind: "text", align: "right" },
    { key: "what", label: "What happened", kind: "text" },
  ];
  const runRows: SortableRow[] = runs.map((r) => ({
    id: r.id,
    sort: {
      started: r.started_at,
      kind: RUN_KIND_LABEL[r.kind] ?? r.kind,
      models: null,
      plays: r.plays_ok,
      refused: r.failed_rate_limit,
      cost: null,
      what: describeRun(r),
    },
    cells: [
      <span key="s">{fmtDateTime(r.started_at)}</span>,
      <span key="k">{RUN_KIND_LABEL[r.kind] ?? r.kind}</span>,
      <span key="m" title="Per-run model list is not recorded">-</span>,
      <span key="p" className="fleet-numcell">
        {r.plays_ok}
        <span className="fleet-sub"> / {r.plays_attempted} tried</span>
      </span>,
      <span key="r" className="fleet-numcell">{r.failed_rate_limit}</span>,
      <span key="c" title="Per-run cost is not recorded">-</span>,
      <span key="w" className="fleet-why">{describeRun(r)}</span>,
    ],
  }));

  // ---------------- problems ----------------
  type ProblemGroup = {
    cls: ProblemClass;
    model: string;
    times: number;
    lastSeen: string;
  };
  const problemMap = new Map<string, ProblemGroup>();
  for (const e of errorRows) {
    const cls = classifyProblem(e.error);
    const key = `${cls}|${e.model_name}`;
    const g = problemMap.get(key) ?? {
      cls,
      model: e.model_name,
      times: 0,
      lastSeen: e.created_at,
    };
    g.times += 1;
    if (e.created_at > g.lastSeen) g.lastSeen = e.created_at;
    problemMap.set(key, g);
  }
  const problemGroups = [...problemMap.values()].sort(
    (a, b) => b.times - a.times || b.lastSeen.localeCompare(a.lastSeen)
  );
  const problemColumns: SortableColumn[] = [
    { key: "problem", label: "Problem", kind: "text" },
    { key: "model", label: "Model", kind: "text" },
    { key: "times", label: "Times", kind: "number", align: "right" },
    { key: "lastSeen", label: "Last seen", kind: "date" },
    { key: "meaning", label: "What it means", kind: "text" },
    { key: "todo", label: "What to do", kind: "text" },
  ];
  const problemRows: SortableRow[] = problemGroups.map((g, i) => ({
    id: `${g.cls}-${g.model}-${i}`,
    sort: {
      problem: PROBLEM_CLASS_LABEL[g.cls],
      model: g.model,
      times: g.times,
      lastSeen: g.lastSeen,
      meaning: PROBLEM_CLASS_INFO[g.cls].meaning,
      todo: PROBLEM_CLASS_INFO[g.cls].todo,
    },
    cells: [
      <span key="p">{PROBLEM_CLASS_LABEL[g.cls]}</span>,
      <span key="m">{g.model}</span>,
      <span key="t" className="fleet-numcell">{g.times}</span>,
      <span key="l">{fmtDateTime(g.lastSeen)}</span>,
      <span key="i" className="fleet-why">{PROBLEM_CLASS_INFO[g.cls].meaning}</span>,
      <span key="d" className="fleet-why">{PROBLEM_CLASS_INFO[g.cls].todo}</span>,
    ],
  }));

  // ---------------- settings table ----------------
  const settingRows: { key: string; label: string; now: unknown; does: string; changeWhen: string }[] = [
    {
      key: "fleet_daily_cap_usd",
      label: "Daily spending limit (whole fleet)",
      now: fleetCap,
      does: "The most the whole fleet may spend in one UTC day before new plays stop.",
      changeWhen: "Raise it when you want more coverage and accept the cost; lower it to protect spend.",
    },
    ...AI_RATE_SETTING_KEYS.map((key: AiRateSettingKey) => ({
      key,
      label: RATE_SETTING_META[key].label,
      now: rateSettingDisplayValue(key, settingsByKey.get(key)),
      does: RATE_SETTING_META[key].does,
      changeWhen: RATE_SETTING_META[key].changeWhen,
    })),
    {
      key: "per_model_caps",
      label: "Per-model daily caps",
      now: null,
      does: "Each model can have its own daily USD cap, enforced by the runners.",
      changeWhen: "Edit per model via the model name (Details) in the table above.",
    },
  ];
  const settingColumns: SortableColumn[] = [
    { key: "setting", label: "Setting", kind: "text" },
    { key: "now", label: "Now", kind: "number", align: "right" },
    { key: "does", label: "What it does", kind: "text" },
    { key: "when", label: "Change it when", kind: "text" },
  ];
  const settingTableRows: SortableRow[] = settingRows.map((s) => {
    const numeric = typeof s.now === "number" ? s.now : typeof s.now === "string" ? num(s.now) : null;
    const nowLabel =
      s.key === "fleet_daily_cap_usd"
        ? fmtUsd(num(s.now))
        : s.key === "ai_rpm_overrides"
        ? JSON.stringify(s.now ?? {})
        : s.key === "per_model_caps"
        ? "per model"
        : s.now === undefined || s.now === null
        ? "—"
        : String(s.now);
    return {
      id: s.key,
      sort: {
        setting: s.label.toLowerCase(),
        now: numeric,
        does: s.does,
        when: s.changeWhen,
      },
      cells: [
        <span key="s" className="fleet-settingcell">
          {s.label}
          <span className="fleet-modelid">{s.key}</span>
        </span>,
        <span key="n" className="fleet-numcell">{nowLabel}</span>,
        <span key="d" className="fleet-why">{s.does}</span>,
        <span key="w" className="fleet-why">{s.changeWhen}</span>,
      ],
    };
  });

  // Rate-settings form defaults (all 14 keys must submit a valid value).
  const rateInputDefault = (key: AiRateSettingKey): string => {
    const v = rateSettingDisplayValue(key, settingsByKey.get(key));
    return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
  };

  // ---------------- drawer ----------------
  const drawerModel = drawerId ? modelViews.find((m) => m.playerId === drawerId) : undefined;
  const drawerFields: DrawerField[] = drawerModel
    ? [
        { label: "Model id", value: drawerModel.modelId, mono: true },
        { label: "Status", value: FLEET_MODEL_STATUS_LABEL[drawerModel.status] },
        { label: "Why", value: drawerModel.whyText },
        { label: "Price", value: drawerModel.price === "unknown" ? "Unknown" : drawerModel.price === "free" ? "Free" : "Paid" },
        { label: "Events played", value: `${drawerModel.eventsPlayed} / ${eligibleTotal}` },
        { label: "Cost today (UTC)", value: fmtUsd(drawerModel.spendTodayUsd) },
        { label: "Cost last 7 days", value: fmtUsd(drawerModel.cost7dUsd) },
        { label: "Calls today", value: String(drawerModel.callsToday) },
        { label: "Last success", value: fmtRelative(drawerModel.lastSuccessAt, nowMs) },
        {
          label: "Daily cost cap",
          value: drawerModel.dailyCapUsd !== null ? fmtUsd(drawerModel.dailyCapUsd) : "No cap",
        },
      ]
    : [];

  return (
    <div className="fleet-page">
      <header className="fleet-head">
        <h1>AI fleet</h1>
        <p className="fleet-subtitle">
          Which AI players run, what they cost, and what needs you.
        </p>
      </header>

      {/* A. Summary cards */}
      <div className="fleet-cards">
        <SummaryCard title="Events played (verified)">
          <p className="fleet-big">{fmtPct(eventsPct)}</p>
          <Bar pct={eventsPct} label="Events with at least one counted AI play" />
          <p className="fleet-note">
            {eventStats.events_with_play.toLocaleString()} of {eligibleTotal.toLocaleString()}{" "}
            events have at least one counted AI play. Failed attempts are not
            counted. A counted play is a stored, scored result
            (ai_answer_bank.error IS NULL) on an event the work queue targets
            (validated, not retired, has an image and coordinates).
          </p>
        </SummaryCard>

        <SummaryCard title="Events judged true / false">
          {auditedEvents === 0 ? (
            <p className="fleet-note">
              Not available yet — the auditors have not judged any events. The
              verdicts come from ai_event_audits.is_real_event.
            </p>
          ) : (
            <>
              <p className="fleet-big">
                {fmtPct((auditTrue / auditedEvents) * 100)} true ·{" "}
                {fmtPct((auditFalse / auditedEvents) * 100)} false
              </p>
              <div
                className="fleet-stackbar"
                role="img"
                aria-label={`Audited events: ${auditTrue} judged true, ${auditUnsure} unsure, ${auditFalse} judged false`}
              >
                <div className="fleet-stack-true" style={{ width: `${(auditTrue / auditedEvents) * 100}%` }} />
                <div className="fleet-stack-unsure" style={{ width: `${(auditUnsure / auditedEvents) * 100}%` }} />
                <div className="fleet-stack-false" style={{ width: `${(auditFalse / auditedEvents) * 100}%` }} />
              </div>
              <p className="fleet-note">
                Of the {auditedEvents.toLocaleString()} audited events (
                {fmtPct(auditedPct)} of all).{" "}
                {fmtPct((auditUnsure / auditedEvents) * 100)} unsure. The rest
                are not audited yet.
              </p>
            </>
          )}
        </SummaryCard>

        <SummaryCard title="Models in the roster">
          <p className="fleet-big">{totalModels}</p>
          <p className="fleet-note">
            {visionCount} can see images (play) · {textCount} text-only (review
            only){unknownCatalog > 0 ? ` · ${unknownCatalog} unknown` : ""}
          </p>
          <p className="fleet-note">
            {askedToday} were asked something today · {offCount} are off
          </p>
        </SummaryCard>

        <SummaryCard title="Active players, by mode">
          <p className="fleet-big">
            Daily {dailyOnCount} · Practice {practiceOnCount}
          </p>
          <p className="fleet-note">
            Models switched on for each mode. Free vision models play both
            modes even when the switches show off.
          </p>
        </SummaryCard>

        <SummaryCard title="Spend today">
          <p className="fleet-big">
            {fmtUsd(fleetSpendToday)}
            {fleetCap !== null ? ` of ${fmtUsd(fleetCap)}` : ""}
          </p>
          <Bar pct={spendPct} label="Fleet spend today vs daily cap" />
          <p className="fleet-note">
            {fmtPct(spendPct)} of the daily limit (UTC) · last 7 days:{" "}
            {fmtUsd(spend7d)}
          </p>
        </SummaryCard>

        <SummaryCard title="Coverage">
          <p className="fleet-big">
            {avgModelsPerEvent.toFixed(1)}{" "}
            <span className="fleet-note-inline">
              models per event · {eligibleModels} eligible
            </span>
          </p>
          <Bar
            pct={eligibleModels > 0 ? (avgModelsPerEvent / eligibleModels) * 100 : 0}
            label="Average models per event vs eligible models"
          />
          <p className="fleet-note">
            Total counted plays ÷ total events, out of the {eligibleModels}{" "}
            models eligible to play.
          </p>
        </SummaryCard>
      </div>

      {/* B. What to do */}
      <section className="fleet-section">
        <h2>What to do</h2>
        {recommendations.length === 0 ? (
          <p className="fleet-note">Nothing needs you right now.</p>
        ) : (
          <ul className="fleet-recs">
            {recommendations.map((rec, i) => (
              <li key={i} className={`fleet-rec fleet-rec-${rec.severity}`}>
                <div className="fleet-rec-head">
                  <span className={`ops-chip ${rec.severity === "critical" ? "ops-chip-bad" : rec.severity === "warning" ? "ops-chip-warn" : "ops-chip-info"}`}>
                    {rec.severity}
                  </span>
                  <strong>{rec.title}</strong>
                  {rec.alertId && <DismissAlertButton alertId={rec.alertId} />}
                </div>
                <p className="fleet-note">{rec.text}</p>
                {rec.todo && <p className="fleet-todo">To do: {rec.todo}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* C. Models table */}
      <section className="fleet-section">
        <h2>Every model, and why it is or is not playing</h2>
        <FleetModelsTable
          columns={modelColumns}
          rows={modelRows}
          footer={modelFooter}
        />
        {(unattributedToday > 0 || unattributed7d > 0) && (
          <p className="fleet-note">
            Unattributed (players no longer on the live roster):{" "}
            {fmtUsd(unattributedToday)} today · {fmtUsd(unattributed7d)} last 7
            days.
          </p>
        )}
      </section>

      {/* D. Recent runs */}
      <section className="fleet-section">
        <h2>Recent runs</h2>
        <SortableTable
          columns={runColumns}
          rows={runRows}
          emptyText="No fleet runs recorded yet."
        />
        <p className="fleet-note">
          Audit runs do not write run records; per-run model lists and cost are
          not recorded (shown as &quot;-&quot;).
        </p>
      </section>

      {/* E. Problems, in plain words */}
      <section className="fleet-section">
        <h2>Problems, in plain words</h2>
        <SortableTable
          columns={problemColumns}
          rows={problemRows}
          emptyText="No errors in the last 7 days."
        />
        <p className="fleet-note">
          Grouped from ai_answer_bank.error over the last 7 days.
        </p>
      </section>

      {/* F. Speed and spending limits */}
      <CollapsibleSection title="Speed and spending limits">
        <SortableTable columns={settingColumns} rows={settingTableRows} />
        <div className="fleet-forms">
          <form action={setFleetDailyCap} className="fleet-form">
            <h3>Daily spending limit (whole fleet)</h3>
            <label className="fleet-field">
              <span>USD per day</span>
              <input
                type="number"
                name="cap"
                step="0.01"
                min="0.01"
                max="1000"
                defaultValue={fleetCap ?? 2}
                required
                className="ops-input"
              />
            </label>
            <button type="submit" className="ops-btn ops-btn-primary">
              Save daily cap
            </button>
          </form>
          <form action={updateRateSettings} className="fleet-form">
            <h3>Speed and volume limits</h3>
            <div className="fleet-settings-grid">
              {AI_RATE_SETTING_KEYS.map((key) => (
                <label key={key} className="fleet-field">
                  <span title={key}>{RATE_SETTING_META[key].label}</span>
                  <input
                    type={key === "ai_rpm_overrides" ? "text" : "number"}
                    name={key}
                    step={key === "ai_rpm_overrides" ? undefined : "any"}
                    min={key === "ai_rpm_overrides" ? undefined : "0"}
                    defaultValue={rateInputDefault(key)}
                    required
                    className="ops-input"
                  />
                </label>
              ))}
            </div>
            <button type="submit" className="ops-btn ops-btn-primary">
              Save speed limits
            </button>
          </form>
          <p className="fleet-note">
            Per-model daily caps are edited per model: open a model name in the
            table above → Details.
          </p>
        </div>
      </CollapsibleSection>

      {drawerModel && (
        <RecordDrawer
          open={true}
          closeHref="/admin/dashboard"
          title={drawerModel.name}
          subtitle={drawerModel.modelId}
          fields={drawerFields}
          actions={
            <div className="fleet-drawer-actions">
              <ModelControls
                playerId={drawerModel.playerId}
                modelId={drawerModel.modelId}
                isActive={drawerModel.isActive}
                isPractice={drawerModel.practiceOn}
                isDaily={drawerModel.dailyOn}
              />
              <form action={updateDailyCostCap} className="fleet-form">
                <label className="fleet-field">
                  <span>Daily cost cap (USD)</span>
                  <input
                    type="number"
                    name="cap"
                    step="0.000001"
                    min="0"
                    defaultValue={drawerModel.dailyCapUsd ?? ""}
                    placeholder="No cap"
                    className="ops-input"
                  />
                </label>
                <input type="hidden" name="playerId" value={drawerModel.playerId} />
                <button type="submit" className="ops-btn">
                  Save cap
                </button>
              </form>
              <details className="fleet-schedule">
                <summary className="ops-btn">Schedule a mode change…</summary>
                <form
                  action={scheduleAiPlayerModeChange}
                  className="ops-panel ops-panel-pad fleet-form"
                >
                  <input type="hidden" name="playerId" value={drawerModel.playerId} />
                  <select name="mode" className="ops-input" defaultValue="daily">
                    <option value="daily">Daily</option>
                    <option value="practice">Practice</option>
                  </select>
                  <select name="targetValue" className="ops-input" defaultValue="enable">
                    <option value="enable">Enable</option>
                    <option value="disable">Disable</option>
                  </select>
                  <input
                    type="datetime-local"
                    name="applyAt"
                    required
                    className="ops-input"
                  />
                  <p className="fleet-note">
                    Time is read as UTC. Applied by the daily cron on its first
                    run after this time.
                  </p>
                  <button type="submit" className="ops-btn">
                    Schedule change
                  </button>
                </form>
              </details>
            </div>
          }
        />
      )}
    </div>
  );
}
