import { describe, it, expect, vi, beforeEach } from "vitest";

// UX-BUILD-V1CLOSE-1124-868 item C: GET /api/daily/status must rank from the
// shared humans+AI loader (loadDailyRankedRows) — the same basis
// /api/daily/results and /api/daily/panel use — so the same player on the
// same date gets the same rank in both endpoints.

const USER_ID = "11111111-2222-3333-4444-555555555555";
const TODAY = "2026-11-24";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  loadDailyRankedRows: vi.fn(),
  finalizeStaleDailyAttempts: vi.fn(),
  loadCompeteSessionSnapshot: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/dailyRankedRows", () => ({
  loadDailyRankedRows: mockFns.loadDailyRankedRows,
}));

vi.mock("@/server/dailyChallenge", () => ({
  finalizeStaleDailyAttempts: mockFns.finalizeStaleDailyAttempts,
}));

vi.mock("@/server/sessionCore", () => ({
  loadCompeteSessionSnapshot: mockFns.loadCompeteSessionSnapshot,
}));

vi.mock("@/core/dailyDate", () => ({
  getDailyChallengeDate: () => TODAY,
}));

vi.mock("@/server/db", () => ({
  dbPool: { query: mockFns.dbQuery },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

function createSupabaseClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("Unauthorized"),
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFns.createAuthenticatedServerClient.mockReturnValue(
    createSupabaseClient({ id: USER_ID })
  );
  mockFns.finalizeStaleDailyAttempts.mockResolvedValue(undefined);
  mockFns.loadDailyRankedRows.mockResolvedValue([]);
  mockFns.dbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("daily_attempts")) {
      return { rows: [{ game_id: "game-1", status: "completed" }] };
    }
    if (sql.includes("leaderboard_daily")) {
      return {
        rows: [{ avg_accuracy: 80, best_round_accuracy: 90, total_xp: 500 }],
      };
    }
    return { rows: [] };
  });
});

async function loadRoute() {
  const mod = await import("./route");
  return mod.GET;
}

describe("GET /api/daily/status — shared humans+AI rank basis", () => {
  it("returns 401 and never queries the DB when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient(null)
    );

    const GET = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
    expect(mockFns.loadDailyRankedRows).not.toHaveBeenCalled();
  });

  it("returns the rank from loadDailyRankedRows for a completed attempt", async () => {
    // AI player holds rank 1; the human requester is rank 2. A humans-only
    // COUNT over leaderboard_daily would have produced rank 1 — the shared
    // loader must win so status matches /api/daily/results.
    mockFns.loadDailyRankedRows.mockResolvedValue([
      { player_id: "ai-1", rank: 1, avg_accuracy: 95, is_ai: true },
      { player_id: USER_ID, rank: 2, avg_accuracy: 80, is_ai: false },
    ]);

    const GET = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mockFns.loadDailyRankedRows).toHaveBeenCalledWith(TODAY);
    expect(body.results.rank).toBe(2);
    // The old humans-only rank query must be gone: dbPool is hit exactly
    // twice (daily_attempts lookup + leaderboard_daily stats row).
    expect(mockFns.dbQuery).toHaveBeenCalledTimes(2);
    for (const [sql] of mockFns.dbQuery.mock.calls) {
      expect(sql).not.toContain("COUNT(*)::int + 1 AS rank");
    }
  });

  it("returns rank null when the player is absent from the ranked rows", async () => {
    mockFns.loadDailyRankedRows.mockResolvedValue([
      { player_id: "user-2", rank: 1, avg_accuracy: 90, is_ai: false },
    ]);

    const GET = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.rank).toBeNull();
  });
});
