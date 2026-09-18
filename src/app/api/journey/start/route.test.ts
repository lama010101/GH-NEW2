import { describe, it, expect, vi, beforeEach } from "vitest";

// HJ-T19 (spec §13 / HJ-BUILD-GUESTGATE-INVESTPLUS-001): the route must read
// is_anonymous from its single existing auth.getUser() call and thread it
// into startJourneyPlaythrough — never a second sequential auth call — and
// must surface the guest-gate rejection as a real HTTP error, not a silent
// pass-through.

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  startJourneyPlaythrough: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/journeyCore", () => ({
  startJourneyPlaythrough: mockFns.startJourneyPlaythrough,
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

function createMockRequest(json: unknown) {
  return { json: vi.fn().mockResolvedValue(json) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function loadRoute() {
  const mod = await import("./route");
  return mod.POST;
}

describe("POST /api/journey/start", () => {
  it("returns 401 and never calls startJourneyPlaythrough when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(createSupabaseClient(null));

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ stageId: "stage-2" }));

    expect(response.status).toBe(401);
    expect(mockFns.startJourneyPlaythrough).not.toHaveBeenCalled();
  });

  it("threads isAnonymous=true for a guest and surfaces the guest-gate rejection as a 400", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: "guest-1", is_anonymous: true })
    );
    mockFns.startJourneyPlaythrough.mockRejectedValue(
      new Error("Journey stage requires a permanent account — convert your guest session first")
    );

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ stageId: "stage-2" }));

    expect(mockFns.startJourneyPlaythrough).toHaveBeenCalledWith({
      playerId: "guest-1",
      stageId: "stage-2",
      isAnonymous: true,
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("permanent account");
  });

  it("threads isAnonymous=false for a permanent-account caller", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: "user-1", is_anonymous: false })
    );
    mockFns.startJourneyPlaythrough.mockResolvedValue({
      gameId: "game-1",
      playthroughId: "pt-1",
      stageId: "stage-2",
      stageNumber: 2,
      drawnEventIds: ["e1"],
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ stageId: "stage-2" }));

    expect(mockFns.startJourneyPlaythrough).toHaveBeenCalledWith({
      playerId: "user-1",
      stageId: "stage-2",
      isAnonymous: false,
    });
    expect(response.status).toBe(200);
  });

  it("defaults isAnonymous to false when the claim is absent from the user object", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: "user-2" })
    );
    mockFns.startJourneyPlaythrough.mockResolvedValue({
      gameId: "game-2",
      playthroughId: "pt-2",
      stageId: "stage-1",
      stageNumber: 1,
      drawnEventIds: ["e1"],
    });

    const POST = await loadRoute();
    await POST(createMockRequest({ stageId: "stage-1" }));

    expect(mockFns.startJourneyPlaythrough).toHaveBeenCalledWith({
      playerId: "user-2",
      stageId: "stage-1",
      isAnonymous: false,
    });
  });
});
