import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// RANK-FIX-STATUSAUTH-1103-005: POST /api/player/rank-status must verify the
// session with getUser() (never getSession()), return 401 before any rank
// work, and only evaluate the rank when the accuracy-gate flag is on.

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  evaluateAndPersistRank: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/rankStatus", () => ({
  evaluateAndPersistRank: mockFns.evaluateAndPersistRank,
}));

import { POST } from "./route";

const USER = { id: "11111111-1111-4111-8111-111111111111" };

describe("POST /api/player/rank-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.createAuthenticatedServerClient.mockReturnValue({
      auth: { getUser: mockFns.getUser, getSession: mockFns.getSession },
    });
    mockFns.evaluateAndPersistRank.mockResolvedValue({
      totalXp: 0,
      maxRankTier: 0,
      rollingAccPct: null,
      roundsSampled: 0,
    });
  });

  afterEach(() => {
    expect(mockFns.getSession).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns 401 when getUser returns no user and no error", async () => {
    vi.stubEnv("NEXT_PUBLIC_RANK_ACCURACY_GATE", "true");
    mockFns.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mockFns.evaluateAndPersistRank).not.toHaveBeenCalled();
  });

  it("returns 401 when getUser returns an error", async () => {
    vi.stubEnv("NEXT_PUBLIC_RANK_ACCURACY_GATE", "true");
    mockFns.getUser.mockResolvedValue({ data: { user: null }, error: { message: "x" } });

    const res = await POST();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockFns.evaluateAndPersistRank).not.toHaveBeenCalled();
  });

  it("returns gateEnabled:false without evaluating when the flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_RANK_ACCURACY_GATE", "false");
    mockFns.getUser.mockResolvedValue({ data: { user: USER }, error: null });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gateEnabled: false });
    expect(mockFns.evaluateAndPersistRank).not.toHaveBeenCalled();
  });

  it("evaluates the verified user's rank when the flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_RANK_ACCURACY_GATE", "true");
    mockFns.getUser.mockResolvedValue({ data: { user: USER }, error: null });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(mockFns.evaluateAndPersistRank).toHaveBeenCalledTimes(1);
    expect(mockFns.evaluateAndPersistRank).toHaveBeenCalledWith(USER.id);
    const body = await res.json();
    expect(body.gateEnabled).toBe(true);
    expect(body).toHaveProperty("tier");
    expect(body).toHaveProperty("maxRankTier", 0);
    expect(body).toHaveProperty("gate");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
