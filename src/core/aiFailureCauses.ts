// Single TS source for classifying ai_answer_bank.error text into a failure
// cause (AIP-BUILD-FLEETHALT-1102-043).
//
// Precedence MUST mirror the SQL view admin_fleet_model_stats
// (supabase/migrations/20261102130000_admin_fleet_truth_views.sql):
//   auth       — error contains '401'
//   gone       — error contains '404'
//   rate_limit — error contains '429'
//   bad_output — starts with 'Failed to parse' OR contains 'missing finalguess'
//   other      — anything else (including 403, 400, timeouts, TRUNCATED_*)
// NULL/empty error → null (OK play).
//
// IMPORTANT: HTTP 403 is deliberately NOT auth here — it can be a per-model
// moderation/region block and must never trigger a fleet halt (only 401 means
// "key rejected"). Same for 400/other 4xx.

export type FailureCause = "auth" | "gone" | "rate_limit" | "bad_output" | "other";

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
