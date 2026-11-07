// Pure usage aggregation — decision D6 of AIP-BUILD-FLEETFINAL-1103-060
// (fleet-design-060.md).
//
// eval_facts.cost / prompt_tokens / completion_tokens / reasoning_tokens /
// total_tokens must be the SUM across ALL OpenRouter calls of a play
// (guess turn, optional hint turn, review turn). This helper reduces the
// ai_answer_bank_calls.response_payload values into one totals object.
//
// The fields summed (per the task spec):
//   usage.cost, usage.prompt_tokens, usage.completion_tokens,
//   usage.completion_tokens_details.reasoning_tokens, usage.total_tokens
// (reasoning tokens come from completion_tokens_details — the OpenRouter
// shape — matching what extractUsage in generate-answers-v3.ts reads).
//
// Null payloads, non-object payloads, error bodies ({rawText}, {error:...})
// and calls whose usage object is absent contribute exactly 0.

export type UsageTotals = {
  /** USD, summed (OpenRouter usage.cost). */
  cost: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function usageOf(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) return null;
  const u = (payload as Record<string, unknown>).usage;
  if (typeof u !== "object" || u === null) return null;
  return u as Record<string, unknown>;
}

export function sumUsage(
  responsePayloads: readonly unknown[] | null | undefined
): UsageTotals {
  const totals: UsageTotals = {
    cost: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
  };
  if (!Array.isArray(responsePayloads)) return totals;
  for (const payload of responsePayloads) {
    const u = usageOf(payload);
    if (u === null) continue;
    totals.cost += num(u.cost);
    totals.prompt_tokens += num(u.prompt_tokens);
    totals.completion_tokens += num(u.completion_tokens);
    const details = u.completion_tokens_details;
    if (typeof details === "object" && details !== null) {
      totals.reasoning_tokens += num(
        (details as Record<string, unknown>).reasoning_tokens
      );
    }
    totals.total_tokens += num(u.total_tokens);
  }
  return totals;
}
