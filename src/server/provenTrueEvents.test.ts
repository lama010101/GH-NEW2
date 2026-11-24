import { describe, expect, it, vi } from "vitest";
import { fetchProvenTrueEventIds } from "./provenTrueEvents";
import { RELIABILITY_PLAY_MIN } from "@/core/eventReliability";

// OPS-GATE-AIFLEET-DAILYTRUE-1124-885 — the proven-true event-id query is the
// single owner of the Daily AI gate's pool. Mocked pool only; no DB access.

describe("fetchProvenTrueEventIds", () => {
  it("queries event_reliability joined to events with the quarantine filter", async () => {
    const query = vi.fn<
      (sql: string, params?: unknown[]) => Promise<{ rows: { event_id: string }[] }>
    >(async () => ({
      rows: [{ event_id: "e1" }, { event_id: "e2" }],
    }));
    const ids = await fetchProvenTrueEventIds({ query } as never);
    expect(ids).toEqual(["e1", "e2"]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("event_reliability");
    expect(sql).toContain("events");
    expect(sql).toContain("retired_at IS NULL");
    expect(sql).toContain("status = 'validated'");
    expect(sql).toContain("reliability >= $1");
    expect(params).toEqual([RELIABILITY_PLAY_MIN]);
    expect(RELIABILITY_PLAY_MIN).toBe(95);
  });

  it("returns an empty array when the pool is empty", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await expect(fetchProvenTrueEventIds({ query } as never)).resolves.toEqual([]);
  });

  it("propagates DB errors (missing relation etc.) so callers fail closed", async () => {
    const query = vi.fn(async () => {
      throw new Error('relation "event_reliability" does not exist');
    });
    await expect(fetchProvenTrueEventIds({ query } as never)).rejects.toThrow(
      "event_reliability"
    );
  });
});
