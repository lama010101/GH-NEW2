import { describe, it, expect, vi, beforeEach } from "vitest";

// I18N-BUILD-GAMEOVERLAY-1124-865: GET /api/daily/[gameId]/snapshot mirrors
// the protected compete GET (participant auth -> snapshot -> 404) and applies
// the gh_locale server-side overlay before responding.

const GAME_ID = "55555555-5555-4555-8555-555555555555";

const mockFns = vi.hoisted(() => ({
  loadCompeteSessionSnapshot: vi.fn(),
  assertParticipantOrPartyKit: vi.fn(),
  isActiveSessionPlayer: vi.fn(),
  localizeSnapshot: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockFns.cookieGet })),
}));

vi.mock("@/server/sessionCore", () => ({
  loadCompeteSessionSnapshot: mockFns.loadCompeteSessionSnapshot,
  assertParticipantOrPartyKit: mockFns.assertParticipantOrPartyKit,
  isActiveSessionPlayer: mockFns.isActiveSessionPlayer,
}));

vi.mock("@/server/localizedSnapshot", () => ({
  localizeSnapshot: mockFns.localizeSnapshot,
}));

vi.mock("@/server/contentTranslations", () => ({
  resolveOverlayLocale: (raw: string | null | undefined) =>
    raw === "fr" ? "fr" : null,
}));

const SNAPSHOT = {
  gameId: GAME_ID,
  status: "ROUND_ACTIVE",
  rounds: [{ eventId: "e1", title: "EN title" }],
};

function createMockRequest() {
  return { headers: { get: vi.fn(() => null) } } as any;
}

async function loadRoute() {
  const mod = await import("./route");
  return mod.GET;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFns.assertParticipantOrPartyKit.mockResolvedValue({
    ok: true,
    playerId: "player-1",
  });
  mockFns.loadCompeteSessionSnapshot.mockResolvedValue(SNAPSHOT);
  mockFns.localizeSnapshot.mockImplementation(async (snap: unknown) => snap);
  mockFns.cookieGet.mockReturnValue(undefined);
});

describe("GET /api/daily/[gameId]/snapshot", () => {
  it("returns 401 when the participant check fails with 401", async () => {
    mockFns.assertParticipantOrPartyKit.mockResolvedValue({
      ok: false,
      status: 401,
      error: "authentication required",
    });

    const GET = await loadRoute();
    const response = await GET(createMockRequest(), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(401);
    expect(mockFns.loadCompeteSessionSnapshot).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not a participant", async () => {
    mockFns.assertParticipantOrPartyKit.mockResolvedValue({
      ok: false,
      status: 403,
      error: "not a participant",
    });

    const GET = await loadRoute();
    const response = await GET(createMockRequest(), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(403);
    expect(mockFns.loadCompeteSessionSnapshot).not.toHaveBeenCalled();
  });

  it("returns 404 when the session snapshot does not exist", async () => {
    mockFns.loadCompeteSessionSnapshot.mockResolvedValue(null);

    const GET = await loadRoute();
    const response = await GET(createMockRequest(), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(404);
    expect(mockFns.localizeSnapshot).not.toHaveBeenCalled();
  });

  it("returns 200 with the localized snapshot for a valid participant", async () => {
    mockFns.cookieGet.mockImplementation((name: string) =>
      name === "gh_locale" ? { value: "fr" } : undefined
    );
    const localized = { ...SNAPSHOT, rounds: [{ eventId: "e1", title: "FR title" }] };
    mockFns.localizeSnapshot.mockResolvedValue(localized);

    const GET = await loadRoute();
    const response = await GET(createMockRequest(), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(200);
    expect(mockFns.localizeSnapshot).toHaveBeenCalledWith(SNAPSHOT, "fr");
    expect(await response.json()).toEqual(localized);
  });

  it("passes null lang when no locale cookie is present", async () => {
    const GET = await loadRoute();
    const response = await GET(createMockRequest(), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(200);
    expect(mockFns.localizeSnapshot).toHaveBeenCalledWith(SNAPSHOT, null);
  });
});
