import { describe, it, expect, vi, beforeEach } from "vitest";

// GUEST-GATE-SERVER-1029-004: POST /api/daily/start must reject anonymous
// users with 403 guest_conversion_required after the 401 check, keep the
// existing 401 behavior for missing sessions, and let non-anonymous users
// reach startDailyAttempt unchanged.

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  startDailyAttempt: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/dailyChallenge", () => ({
  startDailyAttempt: mockFns.startDailyAttempt,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

function createSupabaseClient(user: { id: string; is_anonymous?: boolean } | null) {
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
});

async function loadRoute() {
  const mod = await import("./route");
  return mod.POST;
}

describe("POST /api/daily/start", () => {
  it("returns 401 and never calls startDailyAttempt when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(createSupabaseClient(null));

    const POST = await loadRoute();
    const response = await POST();

    expect(response.status).toBe(401);
    expect(mockFns.startDailyAttempt).not.toHaveBeenCalled();
  });

  it("returns 403 guest_conversion_required for an anonymous user", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: "guest-1", is_anonymous: true })
    );

    const POST = await loadRoute();
    const response = await POST();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: "guest_conversion_required" });
    expect(mockFns.startDailyAttempt).not.toHaveBeenCalled();
  });

  it("starts the daily attempt for a non-anonymous user", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: "user-1", is_anonymous: false })
    );
    mockFns.startDailyAttempt.mockResolvedValue({ attemptId: "a-1" });

    const POST = await loadRoute();
    const response = await POST();

    expect(mockFns.startDailyAttempt).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
  });
});
