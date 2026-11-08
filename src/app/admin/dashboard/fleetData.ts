// Fleet dashboard shared constants + pure helpers.
// Task: ADM-BUILD-FLEETDASH-1107-120 (rebuild of /admin/dashboard).
//
// AI_RATE_SETTING_KEYS is the single list shared by the "Speed and spending
// limits" form (page.tsx) and the upsert action (actions.ts) — it MUST stay
// in sync with src/core/aiRateBudget.ts NUMERIC_KEYS + ai_rpm_overrides.
// deriveFleetAvailability / deriveFleetTier are kept for
// fleetData.test.ts (pure helpers, no DB access).

import { CHEAP_TIER_MAX_USD_PER_TOKEN } from "@/core/aiEligibility";

// ---------------------------------------------------------------------------
// ai_fleet_settings keys edited by the rate-budget form (defaults written by
// the ai_fleet_final migration; runtime defaults in aiRateBudget.ts).
// ---------------------------------------------------------------------------

export const AI_RATE_SETTING_KEYS = [
  "ai_rpm_free",
  "ai_rpm_paid",
  "ai_rpm_overrides",
  "ai_free_rpd_fleet",
  "ai_rpd_paid_model",
  "ai_global_rpd",
  "ai_run_max_plays",
  "ai_run_max_audits",
  "ai_calls_per_play",
  "ai_backoff_base_ms",
  "ai_backoff_max_ms",
  "ai_max_cooldowns_per_model",
  "ai_practice_per_player_per_run",
  "ai_benchmark_subset_size",
] as const;

export type AiRateSettingKey = (typeof AI_RATE_SETTING_KEYS)[number];

// ---------------------------------------------------------------------------
// Plain-English metadata for the "Speed and spending limits" table.
// `field` maps each ai_fleet_settings key to its RateSettings field so the
// page can show the effective default when no row exists yet.
// ---------------------------------------------------------------------------

import type { RateSettings } from "@/core/aiRateBudget";
import { DEFAULT_RATE_SETTINGS } from "@/core/aiRateBudget";

export type RateSettingMeta = {
  label: string;
  does: string;
  changeWhen: string;
  field: keyof RateSettings;
};

export const RATE_SETTING_META: Record<AiRateSettingKey, RateSettingMeta> = {
  ai_rpm_free: {
    label: "Free-model speed",
    does: "The most calls per minute allowed across all free models combined pacing-wise (per model).",
    changeWhen: "Lower it if free providers keep rate-limiting; raise it if the fleet waits too much.",
    field: "rpmFree",
  },
  ai_rpm_paid: {
    label: "Paid-model speed",
    does: "The most calls per minute each paid model may make.",
    changeWhen: "Raise it for fast paid models; lower it if a provider complains.",
    field: "rpmPaid",
  },
  ai_rpm_overrides: {
    label: "Per-model speed overrides",
    does: "A JSON object of model slug -> calls per minute, overriding the two speeds above for specific models.",
    changeWhen: "Only when one model needs a different speed than its tier default.",
    field: "rpmOverrides",
  },
  ai_free_rpd_fleet: {
    label: "Free calls per day (all free models)",
    does: "The account-wide daily ceiling for calls to free models — OpenRouter's free tier allows 1000/day.",
    changeWhen: "Raise toward 1000 for more coverage; lower to stay safely under the provider limit.",
    field: "freeRpdFleet",
  },
  ai_rpd_paid_model: {
    label: "Paid calls per day (per model)",
    does: "The most calls one paid model may make per day.",
    changeWhen: "Raise for models that should cover more events; lower to cap a spendy model.",
    field: "rpdPaidModel",
  },
  ai_global_rpd: {
    label: "Total calls per day (whole fleet)",
    does: "The fleet-wide daily ceiling across every model and every kind of call.",
    changeWhen: "Raise when the fleet is too slow to finish a run; lower to protect quotas.",
    field: "globalRpd",
  },
  ai_run_max_plays: {
    label: "Plays per run",
    does: "The most play items one Daily/Coverage run will dispatch.",
    changeWhen: "Raise to finish more events per run (longer runtime); lower for shorter runs.",
    field: "runMaxPlays",
  },
  ai_run_max_audits: {
    label: "Audits per run",
    does: "The most audit items one audit run will dispatch.",
    changeWhen: "Raise to audit the catalog faster; lower to keep audit runs short.",
    field: "runMaxAudits",
  },
  ai_calls_per_play: {
    label: "Calls expected per play",
    does: "How many LLM calls one play is budgeted for (guess + hints + review). Used for pacing and request budgets.",
    changeWhen: "Only if the play flow changes how many calls it makes.",
    field: "callsPerPlay",
  },
  ai_backoff_base_ms: {
    label: "Retry wait (start)",
    does: "The first wait after a rate limit, in milliseconds — it doubles on each repeat, up to the max below.",
    changeWhen: "Raise if providers need longer breathers; lower for faster recovery.",
    field: "backoffBaseMs",
  },
  ai_backoff_max_ms: {
    label: "Retry wait (max)",
    does: "The ceiling for the doubling retry wait, in milliseconds.",
    changeWhen: "Raise for heavily limited providers; lower to retry sooner.",
    field: "backoffMaxMs",
  },
  ai_max_cooldowns_per_model: {
    label: "Cooldowns per model per run",
    does: "How many rate-limit cooldowns one model may suffer in a run before its remaining items are deferred to a later run.",
    changeWhen: "Raise to keep trying a flaky model; lower to defer it sooner.",
    field: "maxCooldownsPerModel",
  },
  ai_practice_per_player_per_run: {
    label: "Practice plays per model per run",
    does: "The most Practice-mode plays each model gets per run.",
    changeWhen: "Raise for faster coverage of unplayed events; lower to save calls.",
    field: "practicePerPlayerPerRun",
  },
  ai_benchmark_subset_size: {
    label: "Benchmark events",
    does: "How many fixed events premium-tier models re-play to compare themselves against each other.",
    changeWhen: "Raise for a sharper comparison (more calls); lower to save budget.",
    field: "benchmarkSubsetSize",
  },
};

/** Effective value for a settings key: stored row value, else the D3 default. */
export function rateSettingDisplayValue(
  key: AiRateSettingKey,
  stored: unknown
): unknown {
  if (stored !== undefined && stored !== null) return stored;
  return DEFAULT_RATE_SETTINGS[RATE_SETTING_META[key].field];
}

// ---------------------------------------------------------------------------
// Pure helpers — availability reason / cost tier (kept for fleetData.test.ts)
// ---------------------------------------------------------------------------

export type FleetAvailabilityRole = "play" | "audit" | "excluded";
export type FleetTier = "free" | "cheap" | "premium";

export type FleetAvailabilityInput = {
  /** ai_players.deleted_at IS NOT NULL. */
  deleted: boolean;
  /** Whether an openrouter_models row exists for the model slug. */
  hasCatalogRow: boolean;
  /** openrouter_models.availability_status; null when no catalog row. */
  availabilityStatus: string | null;
  /** openrouter_models.is_vision; null when no catalog row. */
  isVision: boolean | null;
  /** openrouter_models.is_free; null when no catalog row. */
  isFree: boolean | null;
  /** ai_players.is_active. */
  isActive: boolean;
};

export type FleetAvailability = {
  role: FleetAvailabilityRole;
  /** One-line reason shown in the Availability column. */
  reason: string;
};

// Display-level summary of the D1 eligibility outcome (first match wins):
//   deleted                    -> excluded 'deleted'
//   no catalog row / not_in_catalog -> excluded 'dead slug'
//   !is_vision                 -> audit 'text-only (auditor)'
//   free + vision              -> play 'free+vision plays'
//   paid + is_active           -> play 'plays under budget'
//   else                       -> excluded 'admin-deactivated'
export function deriveFleetAvailability(
  m: FleetAvailabilityInput
): FleetAvailability {
  if (m.deleted) {
    return { role: "excluded", reason: "deleted" };
  }
  if (!m.hasCatalogRow || m.availabilityStatus === "not_in_catalog") {
    return { role: "excluded", reason: "dead slug" };
  }
  if (m.isVision !== true) {
    return { role: "audit", reason: "text-only (auditor)" };
  }
  if (m.isFree === true) {
    return { role: "play", reason: "free+vision plays" };
  }
  if (m.isActive) {
    return { role: "play", reason: "plays under budget" };
  }
  return { role: "excluded", reason: "admin-deactivated" };
}

export type FleetTierInput = {
  /** openrouter_models.is_free; null when no catalog row. */
  isFree: boolean | null;
  /** openrouter_models.price_prompt_usd (USD/token); null when absent. */
  pricePromptUsd: number | null;
  /** openrouter_models.price_completion_usd (USD/token); null when absent. */
  priceCompletionUsd: number | null;
};

// D1 price tier: free -> 'free'; paid with prompt+completion <= 1e-6 USD per
// token -> 'cheap'; anything else on a paid slug -> 'premium'. No catalog row
// (is_free null) -> null: the model is a dead slug and consumes no budget.
export function deriveFleetTier(t: FleetTierInput): FleetTier | null {
  if (t.isFree === true) return "free";
  if (t.isFree !== false) return null;
  if (t.pricePromptUsd === null || t.priceCompletionUsd === null) {
    // A paid slug with unknown pricing is budgeted like a premium model.
    return "premium";
  }
  return t.pricePromptUsd + t.priceCompletionUsd <= CHEAP_TIER_MAX_USD_PER_TOKEN
    ? "cheap"
    : "premium";
}
