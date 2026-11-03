// Pure budget-cap decision (AIP-BUILD-BUDGET-1103-004).
//
// The Sep 25–Oct 2 outage lesson generalizes: cost caps must be enforced by
// the runner, not just displayed in admin. This rule decides, per dispatch,
// whether a work item may proceed:
//   1. fleet cap first — fleetSpend >= fleetCap  => halt_fleet (stop ALL new
//      dispatches; in-flight children are allowed to finish, never killed)
//   2. model cap     — modelSpend >= modelCap    => skip_model (skip that
//      model's remaining items; they are cancelled-by-budget, not failures)
//   3. otherwise                                   => proceed
//
// A null, undefined, NaN or non-positive cap means NO cap.
// No I/O — pure function.

export const DEFAULT_FLEET_DAILY_CAP_USD = 2;

export type BudgetAction = "proceed" | "skip_model" | "halt_fleet";

export type BudgetInput = {
  fleetSpendUsd: number;
  fleetCapUsd: number | null;
  modelSpendUsd: number;
  modelCapUsd: number | null;
};

export type BudgetVerdict = {
  action: BudgetAction;
  reason: string;
};

function normalizeCap(cap: number | null | undefined): number | null {
  if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0) return null;
  return cap;
}

export function evaluateBudget(input: BudgetInput): BudgetVerdict {
  const fleetCap = normalizeCap(input.fleetCapUsd);
  if (fleetCap !== null && input.fleetSpendUsd >= fleetCap) {
    return {
      action: "halt_fleet",
      reason: `fleet spend $${input.fleetSpendUsd.toFixed(2)} >= fleet cap $${fleetCap.toFixed(2)}`,
    };
  }
  const modelCap = normalizeCap(input.modelCapUsd);
  if (modelCap !== null && input.modelSpendUsd >= modelCap) {
    return {
      action: "skip_model",
      reason: `model spend $${input.modelSpendUsd.toFixed(2)} >= model cap $${modelCap.toFixed(2)}`,
    };
  }
  return { action: "proceed", reason: "within budget" };
}
