// AI fleet overview — pure presentation logic for the rebuilt
// /admin/dashboard page (ADM-BUILD-FLEETDASH-1107-120).
//
// Everything in this file is deterministic and I/O-free: the server page
// (page.tsx) gathers DB rows, maps them into the input types below, and
// these functions produce the status chips, "What to do" items, problem
// classes, run sentences, audit verdicts and table-sort comparisons.
// Unit-tested in fleetOverview.test.ts.

// ---------------------------------------------------------------------------
// Model status — classifyModelStatus
// ---------------------------------------------------------------------------

export type FleetModelStatus = "playing" | "waiting" | "stopped" | "off";

export const FLEET_MODEL_STATUS_LABEL: Record<FleetModelStatus, string> = {
  playing: "Playing",
  waiting: "Waiting",
  stopped: "Stopped",
  off: "Off",
};

export type ClassifyModelStatusInput = {
  /** Injected epoch ms — never Date.now() inside. */
  nowMs: number;
  /** openrouter_models row exists AND availability_status === 'available'
   *  (catalogModelFromRow semantics — anything else is a dead slug). */
  catalogAvailable: boolean;
  /** classifyPlayer() role with budget gate 'proceed' (same as the runners). */
  eligibilityRole: "player" | "auditor" | "excluded";
  /** classifyPlayer() reason code ('dead_slug', 'admin_deactivated',
   *  'no_mode_flags', 'free_text_audit', 'paid_text_audit',
   *  'text_only_inactive_paid', 'free_vision', 'paid_vision', ...). */
  eligibilityReason: string;
  /** Resolved vision flag: catalog is_vision === true (false for text-only
   *  AND for unknown/missing flags once the catalog row exists). */
  isVision: boolean;
  isActiveDaily: boolean;
  isActivePractice: boolean;
  /** Free+vision models play both modes regardless of the admin flags
   *  (aiEligibility D1 branch 4) — they can never be "switched off". */
  freeVisionAlwaysOn: boolean;
  /** Model's LLM spend for the current UTC day (ai_answer_bank_calls cost). */
  spendTodayUsd: number;
  /** ai_players.daily_cost_cap_usd; null/<=0 = no cap. */
  dailyCapUsd: number | null;
  /** Fleet spend for the current UTC day. */
  fleetSpendTodayUsd: number;
  /** ai_fleet_settings fleet_daily_cap_usd; null = no cap. */
  fleetCapUsd: number | null;
  /** An unresolved 'auth_fleet' alert exists (repeated 401s halted the fleet). */
  fleetHalted: boolean;
  /** The provider refused calls recently: an ai_play_deferrals row for this
   *  player was touched within the last 36 hours. */
  rateLimited: boolean;
  /** ai_model_reliability.last_success_at as epoch ms; null = never. */
  lastSuccessAtMs: number | null;
  /** Latest ai_answer_bank_calls.created_at today as epoch ms; used only to
   *  say WHEN a model hit its own cap. null = unknown. */
  lastActivityAtMs: number | null;
};

export type ModelStatusResult = {
  status: FleetModelStatus;
  whyText: string;
};

const HOUR_MS = 3_600_000;
const PLAYING_WINDOW_MS = 36 * HOUR_MS;

/** Plain-English mapping for aiEligibility exclusion reason codes. */
export function plainEligibilityReason(reason: string): string {
  switch (reason) {
    case "admin_deactivated":
      return "switched off (master switch)";
    case "text_only_inactive_paid":
      return "paid text-only model is switched off";
    case "no_mode_flags":
      return "no play mode switched on";
    case "budget":
      return "paused by the spending guard";
    case "deleted":
      return "removed from the roster";
    case "dead_slug":
      return "the provider removed this model";
    default:
      return reason.replace(/_/g, " ");
  }
}

/** D1: free+vision models play daily AND practice regardless of admin flags. */
export function isFreeVisionAlwaysOn(reason: string): boolean {
  return reason === "free_vision";
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatClockUtc(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16) + " UTC";
}

function formatRelativeMs(ms: number, nowMs: number): string {
  const diff = nowMs - ms;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Precedence (first match wins) — mirrors the task spec exactly:
 *   1 provider removed the model (dead slug / catalog unavailable)
 *   2 not eligible (aiEligibility reason -> plain English)
 *   3 text-only (cannot play, still reviews hints/audits)
 *   4 switched off in both modes
 *   5 own daily USD cap reached
 *   6 fleet cap reached / fleet halted (401s)
 *   7 rate-limited recently (provider 429 deferrals)
 *   8 Playing (counted success in the last 36 h)
 *   9 Waiting (eligible, nothing counted yet)
 */
export function classifyModelStatus(
  input: ClassifyModelStatusInput
): ModelStatusResult {
  // 1. Provider removed the model — it can never succeed again.
  if (!input.catalogAvailable) {
    return {
      status: "stopped",
      whyText:
        "The provider removed this model (it now returns 'model not found'). It will never succeed again — remove it from the roster.",
    };
  }

  // 2. Not eligible for a reason other than the mode flags.
  //    'no_mode_flags' falls through to step 4 ("switched off by you").
  if (
    input.eligibilityRole === "excluded" &&
    input.eligibilityReason !== "no_mode_flags"
  ) {
    return {
      status: "off",
      whyText: `Not eligible: ${plainEligibilityReason(input.eligibilityReason)}.`,
    };
  }

  // 3. Text-only models cannot play image events; they still review
  //    hints and audits (role 'auditor' in aiEligibility).
  if (!input.isVision) {
    return {
      status: "off",
      whyText:
        "Text-only model — it cannot play image events, but it still reviews hints and audits.",
    };
  }

  // 4. Both play modes switched off by the admin. Free+vision models are
  //    exempt: they play both modes regardless of the flags (D1).
  if (
    !input.isActiveDaily &&
    !input.isActivePractice &&
    !input.freeVisionAlwaysOn
  ) {
    return {
      status: "off",
      whyText: "Switched off by you — Daily and Practice are both off.",
    };
  }

  // 5. The model's own daily USD cap is spent for today.
  const cap = input.dailyCapUsd;
  if (
    cap !== null &&
    Number.isFinite(cap) &&
    cap > 0 &&
    input.spendTodayUsd >= cap
  ) {
    const stoppedAt =
      input.lastActivityAtMs !== null &&
      input.lastActivityAtMs <= input.nowMs &&
      input.lastActivityAtMs >= input.nowMs - 24 * HOUR_MS
        ? ` at ${formatClockUtc(input.lastActivityAtMs)}`
        : "";
    return {
      status: "stopped",
      whyText: `Reached its own ${formatUsd(cap)} daily cap${stoppedAt}. Restarts tomorrow.`,
    };
  }

  // 6. Fleet-wide stop: auth halt (401s) first, then the fleet USD cap.
  if (input.fleetHalted) {
    return {
      status: "stopped",
      whyText:
        "The fleet is halted — the OpenRouter key was rejected (401). Check the key and account credit.",
    };
  }
  const fleetCap = input.fleetCapUsd;
  if (
    fleetCap !== null &&
    Number.isFinite(fleetCap) &&
    fleetCap > 0 &&
    input.fleetSpendTodayUsd >= fleetCap
  ) {
    return {
      status: "stopped",
      whyText: `The whole fleet reached its ${formatUsd(fleetCap)} daily limit. Restarts tomorrow.`,
    };
  }

  // 7. Provider rate limiting (recent 429 deferrals).
  if (input.rateLimited) {
    return {
      status: "waiting",
      whyText:
        "Its provider keeps refusing calls (rate limit). It retries automatically.",
    };
  }

  // 8. Counted success inside the last 36 hours.
  if (
    input.lastSuccessAtMs !== null &&
    input.nowMs - input.lastSuccessAtMs <= PLAYING_WINDOW_MS
  ) {
    return {
      status: "playing",
      whyText: `Playing — last success ${formatRelativeMs(input.lastSuccessAtMs, input.nowMs)}.`,
    };
  }

  // 9. Eligible and switched on, but nothing counted in the window.
  return {
    status: "waiting",
    whyText:
      input.lastSuccessAtMs === null
        ? "Waiting — eligible, but it has not completed a play yet."
        : `Waiting — no completed play in the last 36 hours (last success ${formatRelativeMs(input.lastSuccessAtMs, input.nowMs)}).`,
  };
}

// ---------------------------------------------------------------------------
// Recommendations — buildRecommendations
// ---------------------------------------------------------------------------

export type RecommendationSeverity = "critical" | "warning" | "info";

export type FleetRecommendation = {
  severity: RecommendationSeverity;
  title: string;
  text: string;
  /** Plain next step; null when nothing is required. */
  todo: string | null;
  /** Set only for items backed by a stored ai_fleet_alerts row — those are
   *  the only items that may show a Dismiss button. */
  alertId?: string;
};

export type RecommendationModelInput = {
  playerId: string;
  name: string;
  modelId: string;
  status: FleetModelStatus;
  /** Catalog row missing/unavailable (provider removed the model). */
  deadSlug: boolean;
  /** Model spent >= its own daily_cost_cap_usd today. */
  ownCapReached: boolean;
  ownCapUsd: number | null;
  /** Epoch ms of the model's last LLM call today (cap stop time), or null. */
  capStoppedAtMs: number | null;
  /** Distinct UTC days with deferrals across the last 3 UTC calendar days (rate-limit streak, max 3). */
  rateLimitDays3d: number;
  /** classifyPlayer role === 'player' AND paid tier (flags actually gate it). */
  suggestible: boolean;
  dailyOn: boolean;
  practiceOn: boolean;
  /** True when the model's catalog price derives to "free". */
  isFree: boolean;
};

export type RecommendationAlertInput = {
  id: string;
  kind: string;
  severity: RecommendationSeverity;
  message: string;
  occurrences: number;
};

export type BuildRecommendationsInput = {
  nowMs: number;
  fleetSpendTodayUsd: number;
  fleetCapUsd: number | null;
  fleetHalted: boolean;
  practicePlaysLast7d: number;
  alerts: RecommendationAlertInput[];
  models: RecommendationModelInput[];
};

const SEVERITY_RANK: Record<RecommendationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const ALERT_KIND_TEXT: Record<
  string,
  { title: string; text: string; todo: string | null }
> = {
  auth_fleet: {
    title: "Key rejected — fleet halted",
    text: "The OpenRouter API key was rejected (HTTP 401) by several models, so the fleet stopped to protect it.",
    todo: "Check the OpenRouter API key and account credit.",
  },
  budget: {
    title: "Daily spending limit reached",
    text: "The fleet hit its daily USD cap and stopped starting new plays.",
    todo: "It resets tomorrow — raise the cap below only if you want more coverage.",
  },
  model_gone: {
    title: "Model removed by provider",
    text: "A model returned 'model not found' (404) — the provider removed it.",
    todo: "Remove it from the roster; it will never succeed again.",
  },
  circuit_open: {
    title: "Model kept failing",
    text: "A model failed repeatedly and its breaker stayed open.",
    todo: "Check the model — swap it if it stays broken.",
  },
};

function alertExplanation(alert: RecommendationAlertInput): {
  title: string;
  text: string;
  todo: string | null;
} {
  const known = ALERT_KIND_TEXT[alert.kind];
  if (known) {
    // The stored message carries the live numbers (e.g. how many models saw
    // the 401); keep it as a detail line under the plain explanation.
    const detail =
      alert.message && !known.text.includes(alert.message)
        ? ` ${alert.message}`
        : "";
    return { title: known.title, text: known.text + detail, todo: known.todo };
  }
  return {
    title: "Fleet alert",
    text: alert.message || "The fleet recorded an alert.",
    todo: null,
  };
}

/**
 * Ordered "What to do" items. Pure: the page supplies already-computed
 * per-model facts; this function only applies the rules. Items computed
 * from live data carry no alertId (no Dismiss); stored alerts do.
 */
export function buildRecommendations(
  input: BuildRecommendationsInput
): FleetRecommendation[] {
  const items: FleetRecommendation[] = [];
  const cap = input.fleetCapUsd;
  const hasFleetCap = cap !== null && Number.isFinite(cap) && cap > 0;
  const fleetHeadroom = !hasFleetCap || input.fleetSpendTodayUsd < cap;

  // Fleet halt — top severity, first.
  if (input.fleetHalted) {
    items.push({
      severity: "critical",
      title: "The fleet is halted",
      text: "The OpenRouter key was rejected (HTTP 401) by multiple models. Nothing will play until it is fixed.",
      todo: "Check the OpenRouter API key and account credit. Never paste the key anywhere.",
    });
  }

  // Dead slugs — will never succeed again.
  for (const m of input.models) {
    if (!m.deadSlug) continue;
    items.push({
      severity: "warning",
      title: `${m.name} will never succeed again`,
      text: "The provider removed this model — every call returns 'model not found' (404).",
      todo: "Remove it from the roster (it can be restored from Trash if needed).",
    });
  }

  // Own daily USD cap reached — restarts tomorrow.
  for (const m of input.models) {
    if (!m.ownCapReached) continue;
    const stopped =
      m.capStoppedAtMs !== null
        ? ` It stopped at ${formatClockUtc(m.capStoppedAtMs)}.`
        : "";
    items.push({
      severity: "warning",
      title: `${m.name} hit its own daily cap`,
      text: `It spent its ${formatUsd(m.ownCapUsd ?? 0)} daily limit.${stopped} It restarts tomorrow.`,
      todo: fleetHeadroom
        ? "Raise its cap in the model's Details if the fleet has headroom."
        : "The fleet cap is the limit — it restarts tomorrow.",
    });
  }

  // Rate-limited for >= 3 consecutive days.
  for (const m of input.models) {
    if (m.rateLimitDays3d < 3) continue;
    items.push({
      severity: "warning",
      title: `${m.name} is being held back by its provider`,
      text: `Its provider has refused calls (rate limit) on ${m.rateLimitDays3d} of the last 3 days — nothing is broken on our side.`,
      todo: m.isFree
        ? "No action needed — it retries automatically. Or swap it for another free vision model that is still available."
        : "No action needed — it retries automatically. If it persists, lower this model's requests per minute in the fleet settings.",
    });
  }

  // Fleet spend >= 80% of cap.
  if (hasFleetCap && input.fleetSpendTodayUsd >= cap * 0.8) {
    items.push({
      severity: "warning",
      title: "The fleet is nearing its daily limit",
      text: `It has used ${Math.round((input.fleetSpendTodayUsd / cap) * 100)}% of today's spending limit (${formatUsd(input.fleetSpendTodayUsd)} of ${formatUsd(cap)}).`,
      todo: "New plays stop at 100%. Raise the cap only if you want more coverage.",
    });
  }

  // Spend < 50% of cap AND eligible models switched off for a mode —
  // money is not what limits coverage.
  if (hasFleetCap && input.fleetSpendTodayUsd < cap * 0.5) {
    const candidates = input.models
      .filter((m) => m.suggestible && (!m.dailyOn || !m.practiceOn))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 3);
    if (candidates.length > 0) {
      const named = candidates
        .map(
          (m) =>
            `${m.name} (${[!m.dailyOn ? "Daily" : null, !m.practiceOn ? "Practice" : null]
              .filter(Boolean)
              .join(" and ")} off)`
        )
        .join(", ");
      items.push({
        severity: "info",
        title: "Money is not what limits coverage",
        text: `Only ${Math.round((input.fleetSpendTodayUsd / cap) * 100)}% of the daily limit is used, yet eligible models are switched off.`,
        todo: `Switch on a mode for: ${named}.`,
      });
    }
  }

  // Zero Practice plays in the last 7 days — no scheduler exists yet.
  if (input.practicePlaysLast7d === 0) {
    items.push({
      severity: "info",
      title: "Practice plays are not running yet",
      text: "No Practice play has completed in the last 7 days — there is no scheduler for them yet.",
      todo: null,
    });
  }

  // Stored open alerts — the only items that may be dismissed.
  for (const alert of input.alerts) {
    const ex = alertExplanation(alert);
    items.push({
      severity: alert.severity,
      title: ex.title,
      text: ex.text,
      todo: ex.todo,
      alertId: alert.id,
    });
  }

  return items
    .map((item, idx) => ({ item, idx }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] ||
        a.idx - b.idx
    )
    .map((x) => x.item);
}

// ---------------------------------------------------------------------------
// Event-audit verdicts — card "Events judged true / false"
// ---------------------------------------------------------------------------

export type EventAuditVerdict = "true" | "false" | "unsure";

/**
 * Per-event verdict from its auditor votes. Vote buckets: 'true' =
 * is_real_event real|likely_real, 'false' = doubtful|fabricated,
 * 'unsure' = unknown/NULL. Plurality wins; ties resolve to 'unsure'
 * (conservative — never claim a verdict the auditors did not agree on).
 */
export function classifyEventAudit(
  trueVotes: number,
  falseVotes: number,
  unsureVotes: number
): EventAuditVerdict {
  if (trueVotes > falseVotes && trueVotes > unsureVotes) return "true";
  if (falseVotes > trueVotes && falseVotes > unsureVotes) return "false";
  return "unsure";
}

// ---------------------------------------------------------------------------
// Problems — classifyProblem + static meaning/todo map
// ---------------------------------------------------------------------------

export type ProblemClass =
  | "rate_limit"
  | "not_found"
  | "unauthorized"
  | "timeout"
  | "other";

export const PROBLEM_CLASS_LABEL: Record<ProblemClass, string> = {
  rate_limit: "Rate limit 429",
  not_found: "Model not found 404",
  unauthorized: "Unauthorized 401/403",
  timeout: "Timeout",
  other: "Other",
};

export const PROBLEM_CLASS_INFO: Record<
  ProblemClass,
  { meaning: string; todo: string }
> = {
  rate_limit: {
    meaning: "The provider told us to slow down. Free models share a strict limit.",
    todo: "Nothing — it retries by itself. Act only if it lasts more than 3 days.",
  },
  not_found: {
    meaning: "The provider removed this model or it has no working endpoint left.",
    todo: "Remove it from the roster — it will never succeed again.",
  },
  unauthorized: {
    meaning:
      "The API key was rejected (401) or the model refused the call (403). A fleet-wide 401 halts the run.",
    todo: "For 401s check the OpenRouter key/credit. For 403s the block is per-model — swap the model.",
  },
  timeout: {
    meaning: "The provider took too long or the connection dropped before answering.",
    todo: "Nothing — it retries by itself. If one model times out often, swap it for a faster one.",
  },
  other: {
    meaning:
      "The play failed for a reason that is not a rate limit, a missing model, auth or a timeout (bad output, 5xx, parse errors).",
    todo: "Check the model's row for the raw error; repeated failures usually mean the model's output is unusable — consider swapping it.",
  },
};

/**
 * Classify one ai_answer_bank.error text into a plain problem class.
 * Order: rate limit (429 / RATE_LIMIT_DEFERRED) -> not found (404) ->
 * unauthorized (401/403) -> timeout/network -> other.
 */
export function classifyProblem(error: string | null | undefined): ProblemClass {
  if (!error) return "other";
  const text = error;
  if (
    text.includes("RATE_LIMIT_DEFERRED") ||
    text.includes("429") ||
    /rate.?limit|too many requests/i.test(text)
  ) {
    return "rate_limit";
  }
  if (text.includes("404") || /no endpoints found/i.test(text)) {
    return "not_found";
  }
  if (text.includes("401") || text.includes("403") || /unauthorized|forbidden/i.test(text)) {
    return "unauthorized";
  }
  if (
    /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|HARD_KILL|fetch failed|aborted|SPAWN_ERROR/i.test(
      text
    )
  ) {
    return "timeout";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Recent runs — describeRun
// ---------------------------------------------------------------------------

export type RunSummaryInput = {
  status: "running" | "ok" | "partial" | "halted" | "error";
  halt_reason: string | null;
  plays_ok: number;
  plays_attempted: number;
  plays_failed: number;
  failed_rate_limit: number;
};

/** One plain sentence describing what a fleet run did. */
export function describeRun(run: RunSummaryInput): string {
  const refused =
    run.failed_rate_limit > 0
      ? ` ${run.failed_rate_limit} call${run.failed_rate_limit === 1 ? "" : "s"} were refused by the provider (rate limit) and retried.`
      : "";
  switch (run.status) {
    case "running":
      return "Still running.";
    case "ok":
      return `Finished. ${run.plays_ok} of ${run.plays_attempted} plays completed.${refused}`;
    case "partial":
      return `Finished with problems. ${run.plays_failed} of ${run.plays_attempted} plays failed.${refused}`;
    case "halted":
      if (run.halt_reason === "auth_fleet") {
        return "Stopped early. The OpenRouter key was rejected (401) — the fleet halted.";
      }
      if (run.halt_reason === "budget") {
        return "Stopped early. The daily spending limit was reached.";
      }
      return `Stopped early.${refused}`;
    case "error":
      return "The run crashed before finishing.";
    default:
      return "-";
  }
}

// ---------------------------------------------------------------------------
// Sortable tables — compareSortValues / sortRows
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc";
export type SortKind = "text" | "number" | "date";
export type SortValue = string | number | null | undefined;

function isMissing(value: SortValue, kind: SortKind): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (kind === "number") return !Number.isFinite(Number(value));
  if (kind === "date") return !Number.isFinite(Date.parse(String(value)));
  return false;
}

function toComparable(value: SortValue, kind: SortKind): number | string {
  if (kind === "number") return Number(value);
  if (kind === "date") return Date.parse(String(value));
  return String(value).toLowerCase();
}

/**
 * Direction-aware value comparison for sortable tables. Numbers compare
 * numerically (never as strings), dates chronologically, text with
 * localeCompare. Missing values are handled by sortRows — this function
 * assumes both values are present.
 */
export function compareSortValues(
  a: SortValue,
  b: SortValue,
  kind: SortKind = "text"
): number {
  const av = toComparable(a, kind);
  const bv = toComparable(b, kind);
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv));
}

/**
 * Sort rows by one key. Missing values (null/undefined/''/NaN) ALWAYS sort
 * last, in both directions. Ties keep the input order (stable sort).
 */
export function sortRows<
  T extends { sort: Record<string, SortValue> }
>(rows: readonly T[], key: string, dir: SortDirection, kind: SortKind = "text"): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aMissing = isMissing(a.sort[key], kind);
    const bMissing = isMissing(b.sort[key], kind);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return compareSortValues(a.sort[key], b.sort[key], kind) * mul;
  });
}
