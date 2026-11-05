// Fleet-final dashboard queries — AIP-BUILD-FLEETFINAL-1103-060 (design E5).
//
// All queries use the service-role pg pool (getDbPool), consistent with the
// existing page.tsx / queries.ts pattern. They read the security_invoker
// views shipped in supabase/migrations/20261103120000_ai_fleet_final.sql
// (SELECT is granted to service_role only — the pool role sees them).
//
// Pure helpers (deriveFleetAvailability, deriveFleetTier) carry no DB access
// so they are unit-testable in fleetData.test.ts, mirroring
// fleetMetrics.ts / fleetMetrics.test.ts.

import type { Pool } from "pg";
import { CHEAP_TIER_MAX_USD_PER_TOKEN } from "@/core/aiEligibility";

// ---------------------------------------------------------------------------
// ai_fleet_settings keys edited by the "Rate budget" form (D3; defaults
// written by the migration). Single list shared by the form (page.tsx) and
// the upsert action (actions.ts).
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
// Pure helpers — availability reason / cost tier
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

/** numeric columns arrive as strings from pg; normalize to number|null. */
function numOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Fleet coverage & reliability — ai_model_reliability + player flags + catalog
// ---------------------------------------------------------------------------

export type FleetReliabilityRow = {
  ai_player_id: string;
  name: string;
  model_id: string;
  plays_ok: number;
  plays_error: number;
  /** numeric -> string; null when the player has no plays. */
  parse_failure_rate: string | number | null;
  n429: number;
  p50_duration_ms: number | null;
  p95_duration_ms: number | null;
  events_played: number;
  /** numeric -> string; % of playable events with an OK play. */
  coverage_pct: string | number | null;
  last_success_at: string | null;
  /** numeric -> string; mean total_cost_usd over OK plays. */
  avg_cost_usd: string | number | null;
  is_active: boolean;
  is_active_daily: boolean;
  is_active_practice: boolean;
  daily_cost_cap_usd: string | number | null;
  deleted_at: string | null;
  has_catalog_row: boolean;
  is_free: boolean | null;
  is_vision: boolean | null;
  availability_status: string | null;
  price_prompt_usd: string | number | null;
  price_completion_usd: string | number | null;
  tier: FleetTier | null;
  role: FleetAvailabilityRole;
  availabilityReason: string;
};

export async function fetchFleetReliability(
  pool: Pool
): Promise<FleetReliabilityRow[]> {
  const { rows } = await pool.query<
    Omit<FleetReliabilityRow, "tier" | "role" | "availabilityReason">
  >(
    `
    SELECT
      r.ai_player_id,
      r.name,
      r.model_id,
      r.plays_ok,
      r.plays_error,
      r.parse_failure_rate,
      r.n429,
      r.p50_duration_ms,
      r.p95_duration_ms,
      r.events_played,
      r.coverage_pct,
      r.last_success_at::text AS last_success_at,
      r.avg_cost_usd,
      p.is_active,
      p.is_active_daily,
      p.is_active_practice,
      p.daily_cost_cap_usd,
      p.deleted_at::text AS deleted_at,
      (om.model_id IS NOT NULL) AS has_catalog_row,
      om.is_free,
      om.is_vision,
      om.availability_status,
      om.price_prompt_usd,
      om.price_completion_usd
    FROM ai_model_reliability r
    JOIN ai_players p ON p.id = r.ai_player_id
    LEFT JOIN openrouter_models om ON om.model_id = r.model_id
    ORDER BY r.name
    `
  );
  return rows.map((row) => {
    const availability = deriveFleetAvailability({
      deleted: row.deleted_at !== null,
      hasCatalogRow: row.has_catalog_row,
      availabilityStatus: row.availability_status,
      isVision: row.is_vision,
      isFree: row.is_free,
      isActive: row.is_active,
    });
    return {
      ...row,
      tier: deriveFleetTier({
        isFree: row.is_free,
        pricePromptUsd: numOrNull(row.price_prompt_usd),
        priceCompletionUsd: numOrNull(row.price_completion_usd),
      }),
      role: availability.role,
      availabilityReason: availability.reason,
    };
  });
}

// ---------------------------------------------------------------------------
// Event AI difficulty — ai_event_ai_difficulty, hardest events first
// ---------------------------------------------------------------------------

export type EventDifficultyRow = {
  event_id: string;
  title: string | null;
  event_year: number | null;
  n_models: number;
  /** numeric -> string; null when the event has no OK plays. */
  avg_distance_km: string | number | null;
  avg_abs_year_diff: string | number | null;
  avg_difficulty_score: string | number | null;
  avg_authenticity_score: string | number | null;
};

export async function fetchEventDifficulty(
  pool: Pool,
  limit: number = 50
): Promise<EventDifficultyRow[]> {
  const { rows } = await pool.query<EventDifficultyRow>(
    `
    SELECT
      d.event_id,
      e.title,
      e.event_year,
      d.n_models,
      d.avg_distance_km,
      d.avg_abs_year_diff,
      d.avg_difficulty_score,
      d.avg_authenticity_score
    FROM ai_event_ai_difficulty d
    LEFT JOIN events e ON e.id = d.event_id
    ORDER BY d.avg_distance_km DESC NULLS LAST
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Events needing review — ai_events_needing_review, worst review_score first
// ---------------------------------------------------------------------------

export type EventNeedingReviewRow = {
  event_id: string;
  title: string;
  event_year: number | null;
  incorrect_hint_reviews: number;
  doubtful_or_fabricated_votes: number;
  year_disagreement: boolean;
  location_disagreement: boolean;
  /** numeric -> string. */
  review_score: string | number;
};

export async function fetchEventsNeedingReview(
  pool: Pool,
  limit: number = 100
): Promise<EventNeedingReviewRow[]> {
  const { rows } = await pool.query<EventNeedingReviewRow>(
    `
    SELECT
      r.event_id,
      e.title,
      e.event_year,
      r.incorrect_hint_reviews,
      r.doubtful_or_fabricated_votes,
      r.year_disagreement,
      r.location_disagreement,
      r.review_score
    FROM ai_events_needing_review r
    JOIN events e ON e.id = r.event_id
    ORDER BY r.review_score DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Rate settings — every ai_fleet_settings row (jsonb value arrives parsed)
// ---------------------------------------------------------------------------

export type RateSettingRow = {
  key: string;
  value: unknown;
  updated_at: string | null;
};

export async function fetchRateSettings(pool: Pool): Promise<RateSettingRow[]> {
  const { rows } = await pool.query<RateSettingRow>(
    `
    SELECT key, value, updated_at::text AS updated_at
    FROM ai_fleet_settings
    ORDER BY key
    `
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Deferred plays — open ai_play_deferrals (429 cooldown bookkeeping, D3)
// ---------------------------------------------------------------------------

export type DeferredPlayRow = {
  id: string;
  ai_player_id: string;
  event_id: string;
  player_name: string | null;
  event_title: string | null;
  mode: string;
  reason: string | null;
  n429: number;
  attempts: number;
  retry_after_at: string | null;
  first_deferred_at: string;
  last_deferred_at: string;
};

export async function fetchDeferredPlays(
  pool: Pool,
  limit: number = 50
): Promise<DeferredPlayRow[]> {
  const { rows } = await pool.query<DeferredPlayRow>(
    `
    SELECT
      d.id,
      d.ai_player_id,
      d.event_id,
      p.name AS player_name,
      e.title AS event_title,
      d.mode,
      d.reason,
      d.n429,
      d.attempts,
      d.retry_after_at::text AS retry_after_at,
      d.first_deferred_at::text AS first_deferred_at,
      d.last_deferred_at::text AS last_deferred_at
    FROM ai_play_deferrals d
    LEFT JOIN ai_players p ON p.id = d.ai_player_id
    LEFT JOIN events e ON e.id = d.event_id
    WHERE d.resolved_at IS NULL
    ORDER BY d.retry_after_at ASC NULLS FIRST
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}
