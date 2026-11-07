// Single TS source for classifying ai_answer_bank.error text into a failure
// cause (AIP-BUILD-FLEETHALT-1102-043).
//
// Precedence MUST mirror the SQL view admin_fleet_model_stats
// (supabase/migrations/20261102130000_admin_fleet_truth_views.sql):
//   auth                — error contains '401'
//   gone                — error contains '404'
//   rate_limit_deferred — error contains the RATE_LIMIT_DEFERRED marker
//   rate_limit          — error contains '429'
//   bad_output          — starts with 'Failed to parse' OR contains 'missing finalguess'
//   other               — anything else (including 403, 400, timeouts, TRUNCATED_*)
// NULL/empty error → null (OK play).
//
// IMPORTANT: HTTP 403 is deliberately NOT auth here — it can be a per-model
// moderation/region block and must never trigger a fleet halt (only 401 means
// "key rejected"). Same for 400/other 4xx.
//
// AIP-BUILD-FLEETFINAL-1103-060 (D3): a worker that hits a 429 exits 75 and
// prints `RATE_LIMIT_DEFERRED retry_after_ms=<n> <provider/limit_source>` on
// stderr — the item is deferred (upserted to ai_play_deferrals), NOT failed.
// The marker is checked BEFORE the generic '429' rule so a deferred line that
// also embeds "429" classifies as rate_limit_deferred; that cause is excluded
// from the fleet-halt rule (shouldHaltFleet counts 'auth' only) and from
// plays_failed (deferred items are counted separately, via the deferral rows).

export type FailureCause =
  | "auth"
  | "gone"
  | "rate_limit"
  | "rate_limit_deferred"
  | "bad_output"
  | "other";

/** Marker printed by a worker that deferred on a 429 (exit 75). */
export const RATE_LIMIT_DEFERRED_MARKER = "RATE_LIMIT_DEFERRED";

export function classifyFailure(
  error: string | null | undefined
): FailureCause | null {
  if (error === null || error === undefined || error === "") return null;
  if (error.includes("401")) return "auth";
  if (error.includes("404")) return "gone";
  if (error.includes(RATE_LIMIT_DEFERRED_MARKER)) return "rate_limit_deferred";
  if (error.includes("429")) return "rate_limit";
  if (
    error.startsWith("Failed to parse") ||
    error.toLowerCase().includes("missing finalguess")
  ) {
    return "bad_output";
  }
  return "other";
}
