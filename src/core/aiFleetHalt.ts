// Pure fleet-halt decision (AIP-BUILD-FLEETHALT-1102-043).
//
// The Sep 25–Oct 2 outage: every AI play failed HTTP 401 (bad key) for 8 days
// and nothing alerted. This rule halts the run when auth failures are
// fleet-wide — N auth failures across M DISTINCT models inside a time window —
// instead of burning the whole roster's retries against a dead key.
//
// Only cause==='auth' (HTTP 401, key rejected) counts. 403 is never 'auth' in
// aiFailureCauses (per-model moderation/region block) so it cannot halt the
// fleet; rate_limit/gone/bad_output/other never count either.
//
// No I/O, no Date.now() internally — `now` is injected for determinism.

import type { FailureCause } from "./aiFailureCauses";

export const FLEET_HALT_MIN_AUTH_FAILURES = 3;
export const FLEET_HALT_MIN_DISTINCT_MODELS = 2;
export const FLEET_HALT_WINDOW_MS = 600_000; // 10 minutes

export type FleetOutcomeEvent = {
  modelId: string;
  at: number;
  cause: FailureCause | null;
};

export type FleetHaltDecision = {
  halt: boolean;
  /** auth-cause events inside the window. */
  authFailures: number;
  /** distinct modelIds behind those auth failures. */
  distinctModels: number;
};

export function shouldHaltFleet(
  events: FleetOutcomeEvent[],
  now: number
): FleetHaltDecision {
  const windowStart = now - FLEET_HALT_WINDOW_MS;
  let authFailures = 0;
  const models = new Set<string>();
  for (const e of events) {
    if (e.cause !== "auth") continue;
    if (e.at < windowStart || e.at > now) continue;
    authFailures++;
    models.add(e.modelId);
  }
  const distinctModels = models.size;
  return {
    halt:
      authFailures >= FLEET_HALT_MIN_AUTH_FAILURES &&
      distinctModels >= FLEET_HALT_MIN_DISTINCT_MODELS,
    authFailures,
    distinctModels,
  };
}
