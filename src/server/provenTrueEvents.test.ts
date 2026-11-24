// OPS-GATE-AIFLEET-POOLPLAY-1124-886 — unit checks for the proven-true
// pool helper. DB pool is mocked; no real OpenRouter spend.
// (runPlayPhase itself self-runs main() on import — its gate behaviour is
// covered by the dailyAutoplayPhases/dailyBudget/dailyRetry mock seams,
// which now answer the event_reliability query.)

import { describe, expect, it, vi } from "vitest";
import {
  fetchProvenTrueEventIds,
  PROVEN_TRUE_EVENTS_SQL,
} from "./provenTrueEvents";
import { RELIABILITY_PLAY_MIN } from "@/core/eventReliability";

const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";

function mockPool(rows: unknown[] | Error) {
  return {
    query: vi.fn(async () => {
      if (rows instanceof Error) throw rows;
      return { rows };
    }),
  } as unknown as Pick<import("pg").Pool, "query">;
}

describe("fetchProvenTrueEventIds", () => {
  it("returns the proven-true id set and binds reliability >= 95", async () => {
    const pool = mockPool([{ event_id: E1 }, { event_id: E2 }]);
    const ids = await fetchProvenTrueEventIds(pool);
    expect(ids).toEqual(new Set([E1, E2]));
    const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(PROVEN_TRUE_EVENTS_SQL);
    expect(call[1]).toEqual([RELIABILITY_PLAY_MIN]);
    expect(RELIABILITY_PLAY_MIN).toBe(95);
    expect(PROVEN_TRUE_EVENTS_SQL).toContain("retired_at IS NULL");
    expect(PROVEN_TRUE_EVENTS_SQL).toContain("status = 'validated'");
    expect(PROVEN_TRUE_EVENTS_SQL).not.toContain("wikidata");
  });

  it("returns an empty set when the pool is empty", async () => {
    const ids = await fetchProvenTrueEventIds(mockPool([]));
    expect(ids.size).toBe(0);
  });

  it("propagates query errors (caller fails closed -> exit 0, no calls)", async () => {
    const pool = mockPool(new Error("relation event_reliability does not exist"));
    await expect(fetchProvenTrueEventIds(pool)).rejects.toThrow(
      "event_reliability"
    );
  });
});
