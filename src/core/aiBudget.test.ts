import { describe, it, expect } from "vitest";
import { evaluateBudget, DEFAULT_FLEET_DAILY_CAP_USD } from "./aiBudget";

// AIP-BUILD-BUDGET-1103-004 — table-driven proof for evaluateBudget.
// Order: fleet cap first (halt_fleet), then model cap (skip_model), else
// proceed. Null/undefined/NaN/non-positive cap = no cap.

type Row = {
  name: string;
  fleetSpend: number;
  fleetCap: number | null | undefined;
  modelSpend: number;
  modelCap: number | null | undefined;
  want: "proceed" | "skip_model" | "halt_fleet";
};

const CASES: Row[] = [
  // --- proceed ---
  { name: "no caps set", fleetSpend: 10, fleetCap: null, modelSpend: 5, modelCap: null, want: "proceed" },
  { name: "under both caps", fleetSpend: 1.0, fleetCap: 2, modelSpend: 0.5, modelCap: 1, want: "proceed" },
  { name: "zero spend, caps set", fleetSpend: 0, fleetCap: 2, modelSpend: 0, modelCap: 1, want: "proceed" },
  // --- fleet cap ---
  { name: "fleet spend == fleet cap (exact boundary)", fleetSpend: 2, fleetCap: 2, modelSpend: 0, modelCap: null, want: "halt_fleet" },
  { name: "fleet spend > fleet cap", fleetSpend: 2.01, fleetCap: 2, modelSpend: 0, modelCap: null, want: "halt_fleet" },
  { name: "fleet just under cap", fleetSpend: 1.99, fleetCap: 2, modelSpend: 0, modelCap: null, want: "proceed" },
  { name: "fleet cap wins over model cap", fleetSpend: 2, fleetCap: 2, modelSpend: 9, modelCap: 1, want: "halt_fleet" },
  { name: "fleet cap 0 = no cap", fleetSpend: 100, fleetCap: 0, modelSpend: 0, modelCap: null, want: "proceed" },
  { name: "fleet cap negative = no cap", fleetSpend: 100, fleetCap: -5, modelSpend: 0, modelCap: null, want: "proceed" },
  { name: "fleet cap NaN = no cap", fleetSpend: 100, fleetCap: NaN, modelSpend: 0, modelCap: null, want: "proceed" },
  { name: "fleet cap undefined = no cap", fleetSpend: 100, fleetCap: undefined, modelSpend: 0, modelCap: null, want: "proceed" },
  // --- model cap ---
  { name: "model spend == model cap (exact boundary)", fleetSpend: 0, fleetCap: null, modelSpend: 1, modelCap: 1, want: "skip_model" },
  { name: "model spend > model cap", fleetSpend: 0, fleetCap: null, modelSpend: 1.2, modelCap: 1, want: "skip_model" },
  { name: "model just under cap", fleetSpend: 0, fleetCap: null, modelSpend: 0.99, modelCap: 1, want: "proceed" },
  { name: "model cap 0 = no cap", fleetSpend: 0, fleetCap: null, modelSpend: 50, modelCap: 0, want: "proceed" },
  { name: "model cap negative = no cap", fleetSpend: 0, fleetCap: null, modelSpend: 50, modelCap: -1, want: "proceed" },
  { name: "model cap NaN = no cap", fleetSpend: 0, fleetCap: null, modelSpend: 50, modelCap: NaN, want: "proceed" },
  { name: "model cap undefined = no cap", fleetSpend: 0, fleetCap: null, modelSpend: 50, modelCap: undefined, want: "proceed" },
];

describe("evaluateBudget", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const v = evaluateBudget({
        fleetSpendUsd: c.fleetSpend,
        fleetCapUsd: c.fleetCap ?? null,
        modelSpendUsd: c.modelSpend,
        modelCapUsd: c.modelCap ?? null,
      });
      expect(v.action).toBe(c.want);
      expect(typeof v.reason).toBe("string");
      expect(v.reason.length).toBeGreaterThan(0);
    });
  }

  it("default fleet cap constant is 2", () => {
    expect(DEFAULT_FLEET_DAILY_CAP_USD).toBe(2);
  });
});
