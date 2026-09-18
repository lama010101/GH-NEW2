import { describe, it, expect, vi, beforeEach } from "vitest";

// HJ-T19 (spec §13 / HJ-BUILD-GUESTGATE-INVESTPLUS-001): an anonymous caller
// whose journey_player_progress already shows stage 2 unlocked must still be
// rejected by startJourneyPlaythrough for stage 2 — the guest gate applies
// even when the ordinary linear-unlock check would otherwise allow the start.

const mockFns = vi.hoisted(() => ({
  getTransactionClient: vi.fn(),
  appendEvent: vi.fn(),
}));

vi.mock("@/server/sessionCore", () => ({
  getTransactionClient: mockFns.getTransactionClient,
}));

vi.mock("@/server/eventStore", () => ({
  appendEvent: mockFns.appendEvent,
}));

type MockStageRow = {
  id: string;
  stage_number: number;
  status: string;
  pool_size: number;
};

function createMockClient(opts: { stage: MockStageRow; unlocked: boolean }) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("FROM public.journey_stages") && sql.includes("pool_size")) {
      return { rows: [opts.stage] };
    }
    if (sql.includes("jp.status = 'completed'")) {
      return { rows: [{ unlocked: opts.unlocked }] };
    }
    if (sql.includes("FROM public.journey_stage_events")) {
      // No approved content mocked — reaching this proves the guest gate
      // did NOT fire, since Step 3 (draw) runs strictly after it.
      return { rows: [] };
    }
    throw new Error(`Unexpected query reached: ${sql}`);
  });
  return { query, release: vi.fn(), calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startJourneyPlaythrough — guest gate (HJ-T19)", () => {
  it("rejects an anonymous caller starting stage 2 even when stage 2 is already unlocked", async () => {
    const client = createMockClient({
      stage: { id: "stage-2", stage_number: 2, status: "live", pool_size: 5 },
      unlocked: true,
    });
    mockFns.getTransactionClient.mockResolvedValue(client);

    const { startJourneyPlaythrough } = await import("./journeyCore");

    await expect(
      startJourneyPlaythrough({
        playerId: "guest-player-id",
        stageId: "stage-2",
        isAnonymous: true,
      })
    ).rejects.toThrow(
      "Journey stage requires a permanent account — convert your guest session first"
    );

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.calls.some((c) => c.sql.includes("journey_stage_events"))).toBe(false);
  });

  it("does not gate a permanent-account caller starting stage 2", async () => {
    const client = createMockClient({
      stage: { id: "stage-2", stage_number: 2, status: "live", pool_size: 5 },
      unlocked: true,
    });
    mockFns.getTransactionClient.mockResolvedValue(client);

    const { startJourneyPlaythrough } = await import("./journeyCore");

    // Reaches the draw query (mocked to return zero rows) instead of the
    // guest-gate error — proves the gate is conditioned on isAnonymous.
    await expect(
      startJourneyPlaythrough({
        playerId: "permanent-player-id",
        stageId: "stage-2",
        isAnonymous: false,
      })
    ).rejects.toThrow(/Insufficient approved content/);
  });

  it("does not gate an anonymous caller starting stage 1", async () => {
    const client = createMockClient({
      stage: { id: "stage-1", stage_number: 1, status: "live", pool_size: 5 },
      unlocked: true,
    });
    mockFns.getTransactionClient.mockResolvedValue(client);

    const { startJourneyPlaythrough } = await import("./journeyCore");

    await expect(
      startJourneyPlaythrough({
        playerId: "guest-player-id",
        stageId: "stage-1",
        isAnonymous: true,
      })
    ).rejects.toThrow(/Insufficient approved content/);
  });
});
