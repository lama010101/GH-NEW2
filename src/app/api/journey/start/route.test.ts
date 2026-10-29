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

function createSupabaseClient(
  user: { id: string; is_anonymous?: boolean } | null,
  stageLookup?: { data: { id: string } | null; error?: { message: string } | null }
) {
  const maybeSingle = vi.fn().mockResolvedValue(
    stageLookup ?? { data: null, error: null }
  );
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("Unauthorized"),
      }),
    },
    from: vi.fn().mockReturnValue({ select }),
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

  it("resolves an optional stageNumber to stageId server-side", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient(
        { id: "guest-2", is_anonymous: true },
        { data: { id: "stage-1-uuid" } }
      )
    );
    mockFns.startJourneyPlaythrough.mockResolvedValue({
      gameId: "game-3",
      playthroughId: "pt-3",
      stageId: "stage-1-uuid",
      stageNumber: 1,
      drawnEventIds: ["e1"],
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ stageNumber: 1 }));

    expect(mockFns.startJourneyPlaythrough).toHaveBeenCalledWith({
      playerId: "guest-2",
      stageId: "stage-1-uuid",
      isAnonymous: true,
    });
    expect(response.status).toBe(200);
  });

  it("returns 404 when stageNumber matches no journey_stages row", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: "user-3" }, { data: null })
    );

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ stageNumber: 99 }));

    expect(mockFns.startJourneyPlaythrough).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Journey stage not found");
  });

  it("returns 400 when neither stageId nor stageNumber is provided", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: "user-4" })
    );

    const POST = await loadRoute();
    const response = await POST(createMockRequest({}));

    expect(mockFns.startJourneyPlaythrough).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("stageId is required");
  });
});
