import { describe, it, expect } from "vitest";
import { sumUsage } from "./aiUsage";

// AIP-BUILD-FLEETFINAL-1103-060 — D6 usage-sum proof with realistic
// OpenRouter /chat/completions response payload shapes.

function okPayload(usage: Record<string, unknown>): unknown {
  return {
    id: "gen-abc",
    model: "google/gemini-2.5-flash-lite",
    choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
    usage,
  };
}

describe("sumUsage", () => {
  it("sums cost + tokens across the 3 calls of a play", () => {
    const totals = sumUsage([
      okPayload({ prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, cost: 0.00018 }),
      okPayload({
        prompt_tokens: 900,
        completion_tokens: 150,
        total_tokens: 1050,
        cost: 0.00012,
        completion_tokens_details: { reasoning_tokens: 40 },
      }),
      okPayload({ prompt_tokens: 1400, completion_tokens: 500, total_tokens: 1900, cost: 0.00025 }),
    ]);
    expect(totals.prompt_tokens).toBe(3500);
    expect(totals.completion_tokens).toBe(950);
    expect(totals.reasoning_tokens).toBe(40);
    expect(totals.total_tokens).toBe(4450);
    expect(totals.cost).toBeCloseTo(0.00055, 12);
  });

  it("reasoning tokens come from completion_tokens_details.reasoning_tokens", () => {
    const totals = sumUsage([
      okPayload({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        cost: 0,
        completion_tokens_details: { reasoning_tokens: 500, accepted_prediction_tokens: 0 },
      }),
    ]);
    expect(totals.reasoning_tokens).toBe(500);
  });

  it("null / error / usage-less payloads contribute 0", () => {
    const totals = sumUsage([
      null,
      undefined,
      { rawText: "<html>504 Gateway Timeout</html>" },
      { error: { code: 429, message: "Provider returned error" } },
      okPayload({ prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost: 0.000001 }),
      "garbage",
      42,
      { usage: null },
      { usage: { prompt_tokens: null, completion_tokens: undefined, total_tokens: "bad", cost: null } },
    ]);
    expect(totals.prompt_tokens).toBe(5);
    expect(totals.completion_tokens).toBe(5);
    expect(totals.total_tokens).toBe(10);
    expect(totals.reasoning_tokens).toBe(0);
    expect(totals.cost).toBeCloseTo(0.000001, 12);
  });

  it("numeric strings coerce (jsonb round-trip tolerance)", () => {
    const totals = sumUsage([
      okPayload({ prompt_tokens: "7", completion_tokens: "3", total_tokens: "10", cost: "0.000004" }),
    ]);
    expect(totals).toEqual({
      cost: 0.000004,
      prompt_tokens: 7,
      completion_tokens: 3,
      reasoning_tokens: 0,
      total_tokens: 10,
    });
  });

  it("empty / non-array input => zeros", () => {
    const zero = { cost: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 };
    expect(sumUsage([])).toEqual(zero);
    expect(sumUsage(null)).toEqual(zero);
    expect(sumUsage(undefined)).toEqual(zero);
  });
});
