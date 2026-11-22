import { describe, expect, it } from "vitest";
import {
  benchEligible,
  classifyCallFailure,
  estimateCallCostUsd,
  hasReasoningField,
  parseArgs,
  planAttempts,
} from "./run-benchmark";
import type { CatalogModel } from "@/core/aiEligibility";

function model(over: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: "m/x",
    isFree: false,
    isVision: true,
    contextLength: null,
    maxCompletion: null,
    promptPrice: 1e-7,
    completionPrice: 4e-7,
    ...over,
  };
}

describe("classifyCallFailure", () => {
  it("402/401 -> provider_error + abort lane", () => {
    expect(classifyCallFailure("OpenRouter request failed: 402 Payment Required x")).toEqual({
      outcome: "provider_error",
      lane: "abort",
      status: 402,
    });
    expect(classifyCallFailure("OpenRouter request failed: 401 Unauthorized x").lane).toBe("abort");
  });
  it("429 -> rate_limit_deferred + stop lane", () => {
    expect(classifyCallFailure("OpenRouter request failed: 429 Too Many Requests x")).toEqual({
      outcome: "rate_limit_deferred",
      lane: "stop",
      status: 429,
    });
  });
  it("5xx -> provider_error continue; timeout flag -> timeout", () => {
    expect(classifyCallFailure("OpenRouter request failed: 503 x").outcome).toBe("provider_error");
    expect(classifyCallFailure(null, true).outcome).toBe("timeout");
    expect(classifyCallFailure("fetch failed: boom").outcome).toBe("provider_error");
  });
});

describe("benchEligible", () => {
  it("vision+free ok; vision+cheap ok; premium/text rejected", () => {
    expect(benchEligible(model({ isFree: true }))).toBe(true);
    expect(benchEligible(model())).toBe(true); // 5e-7 <= 1e-6
    expect(benchEligible(model({ promptPrice: 1e-5, completionPrice: 1e-5 }))).toBe(false);
    expect(benchEligible(model({ isVision: false, isFree: true }))).toBe(false);
    expect(benchEligible(null)).toBe(false);
  });
});

describe("planAttempts (resume)", () => {
  const items = [{ event_id: "a" }, { event_id: "b" }, { event_id: "c" }];
  it("skips successes, resumes at max+1, caps attempts", () => {
    const existing = [
      { event_id: "a", attempt_no: 1, outcome: "success" },
      { event_id: "b", attempt_no: 1, outcome: "provider_error" },
      { event_id: "b", attempt_no: 2, outcome: "no_reasoning" },
    ];
    const plan = planAttempts(items, existing, 2);
    expect(plan).toEqual([{ event_id: "c", attempt_no: 1 }]);
  });
  it("retries failed event at next attempt_no", () => {
    const plan = planAttempts(items, [{ event_id: "b", attempt_no: 1, outcome: "timeout" }], 2);
    expect(plan).toEqual([
      { event_id: "a", attempt_no: 1 },
      { event_id: "b", attempt_no: 2 },
      { event_id: "c", attempt_no: 1 },
    ]);
  });
});

describe("hasReasoningField", () => {
  it("detects reasoning string in reply JSON", () => {
    expect(hasReasoningField('{"reasoning":"because","finalGuess":{}}')).toBe(true);
    expect(hasReasoningField('{"finalGuess":{}}')).toBe(false);
    expect(hasReasoningField("not json")).toBe(false);
  });
});

describe("estimateCallCostUsd / parseArgs", () => {
  it("estimate uses catalog prices", () => {
    expect(estimateCallCostUsd(model({ promptPrice: 0, completionPrice: 0 }))).toBe(0);
  });
  it("parseArgs parses a valid invocation", () => {
    const a = parseArgs([
      "--set=123e4567-e89b-42d3-a456-426614174000",
      "--models=google/gemma-4-31b-it:free,mistralai/ministral-3b-2512",
      "--max-cost-usd=0.05",
      "--max-cost-usd-total=0.05",
      "--limit=5",
      "--live",
    ]);
    expect(a.setId).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(a.modelIds).toEqual([
      "google/gemma-4-31b-it:free",
      "mistralai/ministral-3b-2512",
    ]);
    expect(a.maxCostUsd).toBe(0.05);
    expect(a.maxCostUsdTotal).toBe(0.05);
    expect(a.limit).toBe(5);
    expect(a.live).toBe(true);
    expect(a.maxAttempts).toBe(2);
  });
});
