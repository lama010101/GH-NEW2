import { describe, it, expect } from "vitest";
import {
  FLEET_HALT_MIN_AUTH_FAILURES,
  FLEET_HALT_MIN_DISTINCT_MODELS,
  FLEET_HALT_WINDOW_MS,
  shouldHaltFleet,
  type FleetOutcomeEvent,
} from "./aiFleetHalt";

// AIP-BUILD-FLEETHALT-1102-043 — unit proof for the fleet-halt rule.
// Only auth (HTTP 401) failures from >=2 distinct models inside the window halt.

const NOW = 1_800_000_000_000;
const T = (msAgo: number) => NOW - msAgo;
const ev = (modelId: string, msAgo: number, cause: FleetOutcomeEvent["cause"]): FleetOutcomeEvent => ({
  modelId,
  at: T(msAgo),
  cause,
});

describe("shouldHaltFleet", () => {
  it("halts: 3 auth failures from 2 distinct models inside the window", () => {
    const d = shouldHaltFleet(
      [
        ev("a/model", 1000, "auth"),
        ev("b/model", 2000, "auth"),
        ev("a/model", 3000, "auth"),
      ],
      NOW
    );
    expect(d.halt).toBe(true);
    expect(d.authFailures).toBe(3);
    expect(d.distinctModels).toBe(2);
  });

  it("no halt: 3 auth failures from a single model", () => {
    const d = shouldHaltFleet(
      [
        ev("a/model", 1000, "auth"),
        ev("a/model", 2000, "auth"),
        ev("a/model", 3000, "auth"),
      ],
      NOW
    );
    expect(d.halt).toBe(false);
    expect(d.authFailures).toBe(3);
    expect(d.distinctModels).toBe(1);
  });

  it("no halt: only 2 auth failures even across 2 models", () => {
    const d = shouldHaltFleet(
      [ev("a/model", 1000, "auth"), ev("b/model", 2000, "auth")],
      NOW
    );
    expect(d.halt).toBe(false);
    expect(d.authFailures).toBe(2);
  });

  it("no halt: auth failures outside the window do not count", () => {
    const d = shouldHaltFleet(
      [
        ev("a/model", FLEET_HALT_WINDOW_MS + 1, "auth"),
        ev("b/model", FLEET_HALT_WINDOW_MS + 60_000, "auth"),
        ev("a/model", 1000, "auth"),
      ],
      NOW
    );
    expect(d.halt).toBe(false);
    expect(d.authFailures).toBe(1);
  });

  it("events exactly at the window edge count", () => {
    const d = shouldHaltFleet(
      [
        ev("a/model", FLEET_HALT_WINDOW_MS, "auth"),
        ev("b/model", FLEET_HALT_WINDOW_MS, "auth"),
        ev("a/model", 0, "auth"),
      ],
      NOW
    );
    expect(d.halt).toBe(true);
  });

  it("429 rate_limit never counts toward auth", () => {
    const d = shouldHaltFleet(
      [
        ev("a/model", 1, "rate_limit"),
        ev("b/model", 2, "rate_limit"),
        ev("c/model", 3, "rate_limit"),
        ev("d/model", 4, "rate_limit"),
        ev("e/model", 5, "rate_limit"),
      ],
      NOW
    );
    expect(d.halt).toBe(false);
    expect(d.authFailures).toBe(0);
  });

  it("a cause produced by 403 ('other') never counts", () => {
    // 403 classifies as 'other' in aiFailureCauses — feeding 'other' here must
    // never halt, even across many models.
    const d = shouldHaltFleet(
      [
        ev("a/model", 1, "other"),
        ev("b/model", 2, "other"),
        ev("c/model", 3, "other"),
      ],
      NOW
    );
    expect(d.halt).toBe(false);
    expect(d.authFailures).toBe(0);
  });

  it("mixed outcomes: only the auth causes count", () => {
    const d = shouldHaltFleet(
      [
        ev("a/model", 10, "auth"),
        ev("a/model", 9, null), // success — ignored
        ev("b/model", 8, "bad_output"),
        ev("b/model", 7, "auth"),
        ev("c/model", 6, "gone"),
        ev("b/model", 5, "auth"),
      ],
      NOW
    );
    expect(d.halt).toBe(true);
    expect(d.authFailures).toBe(3);
    expect(d.distinctModels).toBe(2);
  });

  it("empty event log => no halt", () => {
    const d = shouldHaltFleet([], NOW);
    expect(d.halt).toBe(false);
    expect(d.authFailures).toBe(0);
    expect(d.distinctModels).toBe(0);
  });

  it("constants are the task-specified values", () => {
    expect(FLEET_HALT_MIN_AUTH_FAILURES).toBe(3);
    expect(FLEET_HALT_MIN_DISTINCT_MODELS).toBe(2);
    expect(FLEET_HALT_WINDOW_MS).toBe(600_000);
  });
});
