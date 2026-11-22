import { describe, it, expect, vi, beforeEach } from "vitest";

// DLY-BUILD-PANELAPI-1111-106: GET /api/daily/panel must 401 before any DB
// access, validate ?date after auth, and return the humans+AI panel payload
// (rank of N, global average, 10-bucket histogram, streak).

const USER_ID = "11111111-2222-3333-4444-555555555555";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  loadDailyRankedRows: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/dailyRankedRows", () => ({
  loadDailyRankedRows: mockFns.loadDailyRankedRows,
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

function createRequest(url: string) {
  return { url } as any;
}

const BASE_URL = "http://localhost/api/daily/panel";

beforeEach(() => {
  vi.clearAllMocks();
  mockFns.createAuthenticatedServerClient.mockReturnValue(
    createSupabaseClient({ id: USER_ID })
  );
  mockFns.loadDailyRankedRows.mockResolvedValue([]);
  mockFns.dbQuery.mockResolvedValue({ rows: [] });
});

async function loadRoute() {
  const mod = await import("./route");
  return mod.GET;
}

describe("GET /api/daily/panel", () => {
  it("returns 401 and never queries the DB when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient(null)
    );

    const GET = await loadRoute();
    const response = await GET(createRequest(`${BASE_URL}?date=2026-01-15`));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockFns.loadDailyRankedRows).not.toHaveBeenCalled();
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed date and never queries the DB", async () => {
    const GET = await loadRoute();
    const response = await GET(createRequest(`${BASE_URL}?date=garbage`));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid date format. Use YYYY-MM-DD.",
    });
    expect(mockFns.loadDailyRankedRows).not.toHaveBeenCalled();
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("returns the panel payload for an authenticated user", async () => {
    mockFns.loadDailyRankedRows.mockResolvedValue([
      { player_id: "ai-1", rank: 1, avg_accuracy: 95, is_ai: true },
      { player_id: USER_ID, rank: 2, avg_accuracy: 80, is_ai: false },
      { player_id: "user-2", rank: 2, avg_accuracy: 80, is_ai: false },
    ]);
    mockFns.dbQuery.mockResolvedValue({
      rows: [{ daily_streak_current: 4, daily_streak_best: 9 }],
    });

    const GET = await loadRoute();
    const response = await GET(createRequest(`${BASE_URL}?date=2026-01-15`));

    expect(response.status).toBe(200);
    expect(mockFns.loadDailyRankedRows).toHaveBeenCalledWith("2026-01-15");
    expect(mockFns.dbQuery).toHaveBeenCalledTimes(1);
    const [streakSql, streakParams] = mockFns.dbQuery.mock.calls[0];
    expect(streakSql).toContain("player_daily_streak");
    expect(streakParams).toEqual([USER_ID]);

    expect(await response.json()).toEqual({
      date: "2026-01-15",
      rank: 2,
      totalPlayers: 3,
      aiPlayers: 1,
      globalAvgAccuracy: 85,
      histogram: [0, 0, 0, 0, 0, 0, 0, 0, 2, 1],
      streak: { current: 4, best: 9 },
    });
  });

  it("defaults to the current daily challenge date when ?date is absent", async () => {
    const GET = await loadRoute();
    const response = await GET(createRequest(BASE_URL));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockFns.loadDailyRankedRows).toHaveBeenCalledWith(body.date);
  });

  it("returns rank null and zero streak when the requester is absent", async () => {
    mockFns.loadDailyRankedRows.mockResolvedValue([
      { player_id: "user-2", rank: 1, avg_accuracy: 90, is_ai: false },
    ]);
    mockFns.dbQuery.mockResolvedValue({ rows: [] });

    const GET = await loadRoute();
    const response = await GET(createRequest(`${BASE_URL}?date=2026-01-15`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rank).toBeNull();
    expect(body.streak).toEqual({ current: 0, best: 0 });
    expect(body.totalPlayers).toBe(1);
  });

  it("returns zero totals and a ten-bucket zero histogram for an empty set", async () => {
    const GET = await loadRoute();
    const response = await GET(createRequest(`${BASE_URL}?date=2026-01-15`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: "2026-01-15",
      rank: null,
      totalPlayers: 0,
      aiPlayers: 0,
      globalAvgAccuracy: null,
      histogram: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      streak: { current: 0, best: 0 },
    });
  });
});
