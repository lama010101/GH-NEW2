// Fleet-truth metrics — single definition per number
// (ADMIN-BUILD-FLEETTRUTH-1101-031).
//
// Pure functions only: no DB access, no hidden state. Every label and count on
// the Overview and Models tabs derives from these functions; the same
// definitions are mirrored in SQL inside
// supabase/migrations/20261101090000_admin_fleet_truth_views.sql.
//
// Definitions (CTO-approved):
//   Eligible event : events.status = 'validated' AND EXISTS (images row).
//   Play           : one ai_answer_bank row. OK = error IS NULL,
//                    failed = error IS NOT NULL. ai_answer_bank_calls rows are
//                    API calls, NOT plays (Debug page only).
//   Model state    : Paused → Blocked → Running, evaluated in this order;
//                    Failing is an overlay on Running.
//   Track          : openrouter_models.is_vision true/false/no row.
//   Price          : openrouter_models.is_free, ':free' id fallback, else Unknown.
//   Coverage       : eligible event with >= 1 OK play; depth = distinct models
//                    with an OK play on the event.

// ---------------------------------------------------------------------------
// Failure cause
// ---------------------------------------------------------------------------

export type FailureCause =
  | "auth"
  | "gone"
  | "rate_limit"
  | "bad_output"
  | "other";

export const FAILURE_CAUSES: readonly FailureCause[] = [
  "auth",
  "gone",
  "rate_limit",
  "bad_output",
  "other",
];

export const FAILURE_CAUSE_LABEL: Record<FailureCause, string> = {
  auth: "auth",
  gone: "gone",
  rate_limit: "rate_limit",
  bad_output: "bad_output",
  other: "other",
};

/** Classifies ai_answer_bank.error text. NULL/empty error → null (OK play). */
export function classifyFailure(
  error: string | null | undefined
): FailureCause | null {
  if (error === null || error === undefined || error === "") return null;
  if (error.includes("401")) return "auth";
  if (error.includes("404")) return "gone";
  if (error.includes("429")) return "rate_limit";
  if (
    error.startsWith("Failed to parse") ||
    error.toLowerCase().includes("missing finalguess")
  ) {
    return "bad_output";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Model state — Paused / Blocked / Running (+ Failing overlay)
// ---------------------------------------------------------------------------

export type FleetModelState = "paused" | "blocked" | "running";

export type ModelStateInput = {
  is_active: boolean;
  is_active_practice: boolean;
  is_active_daily: boolean;
  /** openrouter_models.availability_status; NULL when no catalog row exists. */
  availability_status: string | null;
  /** Whether an openrouter_models row exists for this model_id. */
  has_catalog_row: boolean;
};

export type DerivedModelState = {
  state: FleetModelState;
  /** One-line reason shown next to the badge. */
  reason: string;
  /** No openrouter_models row — not blocked, but flagged "unverified". */
  unverified: boolean;
};

export function deriveModelState(m: ModelStateInput): DerivedModelState {
  const unverified = !m.has_catalog_row;
  if (!m.is_active) {
    return { state: "paused", reason: "Master switch off", unverified };
  }
  if (!m.is_active_practice && !m.is_active_daily) {
    return { state: "blocked", reason: "No mode selected", unverified };
  }
  if (m.has_catalog_row && m.availability_status !== "available") {
    return {
      state: "blocked",
      reason: m.availability_status ?? "unavailable",
      unverified,
    };
  }
  return { state: "running", reason: "Running", unverified };
}

// ---------------------------------------------------------------------------
// Failing overlay — >=5 considered plays in 7d and OK-rate < 50%.
// cause=auth rows are EXCLUDED from the rate (fleet-wide key problem,
// not a model fault).
// ---------------------------------------------------------------------------

export type FailingInput = {
  plays_7d: number;
  ok_7d: number;
  auth_7d: number;
};

export type DerivedFailing = {
  failing: boolean;
  /** plays_7d minus auth failures — the rate denominator. */
  considered: number;
  /** ok_7d / considered; null when fewer than 5 considered plays. */
  okRate: number | null;
};

export function deriveFailing(input: FailingInput): DerivedFailing {
  const considered = input.plays_7d - input.auth_7d;
  if (considered < 5) {
    return { failing: false, considered, okRate: null };
  }
  const okRate = input.ok_7d / considered;
  return { failing: okRate < 0.5, considered, okRate };
}

// ---------------------------------------------------------------------------
// Track / Price
// ---------------------------------------------------------------------------

export type ModelTrack = "vision" | "text" | "unknown";

export const TRACK_LABEL: Record<ModelTrack, string> = {
  vision: "Vision",
  text: "Text-only",
  unknown: "Unknown",
};

export function deriveTrack(isVision: boolean | null): ModelTrack {
  if (isVision === true) return "vision";
  if (isVision === false) return "text";
  return "unknown";
}

export type ModelPrice = "free" | "paid" | "unknown";

export const PRICE_LABEL: Record<ModelPrice, string> = {
  free: "Free",
  paid: "Paid",
  unknown: "Unknown",
};

export function derivePrice(
  isFree: boolean | null,
  modelId: string
): ModelPrice {
  if (isFree === true || modelId.endsWith(":free")) return "free";
  if (isFree === false) return "paid";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Grouping (Models tab): Track+Price / Track / Price / None
// ---------------------------------------------------------------------------

export type GroupMode = "track_price" | "track" | "price" | "none";

/** Group key for the default Track+Price grouping. */
export function modelGroupKey(track: ModelTrack, price: ModelPrice): string {
  if (track === "unknown") return "unknown";
  return `${track}-${price}`;
}

/** Display order for Track+Price groups (unknown always last). */
export const TRACK_PRICE_GROUP_ORDER = [
  "vision-free",
  "vision-paid",
  "text-free",
  "text-paid",
  "vision-unknown",
  "text-unknown",
  "unknown",
] as const;

export const TRACK_GROUP_ORDER: ModelTrack[] = ["vision", "text", "unknown"];
export const PRICE_GROUP_ORDER: ModelPrice[] = ["free", "paid", "unknown"];

export function trackPriceGroupLabel(key: string): string {
  if (key === "unknown") return "Unknown";
  const [track, price] = key.split("-") as [ModelTrack, ModelPrice];
  return `${TRACK_LABEL[track]}/${PRICE_LABEL[price]}`;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export type DepthBucket = "0" | "1" | "2" | "3+";

export function depthBucket(modelCount: number): DepthBucket {
  if (modelCount <= 0) return "0";
  if (modelCount === 1) return "1";
  if (modelCount === 2) return "2";
  return "3+";
}

/** covered as % of eligible; 0 when there are no eligible events. */
export function coveragePct(covered: number, eligible: number): number {
  if (eligible <= 0) return 0;
  return (covered / eligible) * 100;
}
