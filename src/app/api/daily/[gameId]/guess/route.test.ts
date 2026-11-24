import { describe, it, expect, vi, beforeEach } from "vitest";

// I18N-BUILD-GAMEOVERLAY-1124-865: POST /api/daily/[gameId]/guess must keep
// returning { ...snapshot, results } — the snapshot goes through
// localizeSnapshot, results stays untouched.

const GAME_ID = "88888888-8888-4888-8888-888888888888";
const PLAYER_ID = "99999999-9999-4999-8999-999999999999";

const mockFns = vi.hoisted(() => ({
  submitGuess: vi.fn(),
  getRoundResults: vi.fn(),
  assertParticipantOrPartyKit: vi.fn(),
  localizeSnapshot: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("@/server/sessionCore", () => ({
  submitGuess: mockFns.submitGuess,
  getRoundResults: mockFns.getRoundResults,
  assertParticipantOrPartyKit: mockFns.assertParticipantOrPartyKit,
}));

vi.mock("@/server/localizedSnapshot", () => ({
  localizeSnapshot: mockFns.localizeSnapshot,
}));

vi.mock("@/server/contentTranslations", () => ({
  resolveOverlayLocale: (raw: string | null | undefined) =>
    raw === "fr" ? "fr" : null,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockFns.cookieGet })),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

const SNAPSHOT = {
  gameId: GAME_ID,
  status: "ROUND_ACTIVE",
  rounds: [{ eventId: "e1", title: "EN title" }],
};

const RESULTS = { roundIndex: 0, submissions: [{ playerId: PLAYER_ID }] };

function createMockRequest(json: unknown) {
  return { json: vi.fn().mockResolvedValue(json) } as any;
}

const VALID_BODY = {
  roundIndex: 0,
  year: 1969,
  lat: 0.6,
  lng: 23.4,
  hintsUsed: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFns.assertParticipantOrPartyKit.mockResolvedValue({
    ok: true,
    playerId: PLAYER_ID,
  });
  mockFns.submitGuess.mockResolvedValue(SNAPSHOT);
  mockFns.localizeSnapshot.mockImplementation(
    async (snap: Record<string, unknown>) => ({ ...snap, localized: true })
  );
  mockFns.cookieGet.mockReturnValue(undefined);
});

async function loadRoute() {
  const mod = await import("./route");
  return mod.POST;
}

describe("POST /api/daily/[gameId]/guess", () => {
  it("returns { ...localizedSnapshot, results } with results untouched", async () => {
    mockFns.submitGuess.mockResolvedValue({ ...SNAPSHOT, status: "ROUND_COMPLETE" });
    mockFns.getRoundResults.mockResolvedValue(RESULTS);

    const POST = await loadRoute();
    const response = await POST(createMockRequest(VALID_BODY), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(200);
    expect(mockFns.localizeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: GAME_ID, status: "ROUND_COMPLETE" }),
      null
    );
    const body = await response.json();
    expect(body.localized).toBe(true);
    expect(body.results).toEqual(RESULTS);
    expect(body.gameId).toBe(GAME_ID);
  });

  it("returns results: null when the round is not complete", async () => {
    const POST = await loadRoute();
    const response = await POST(createMockRequest(VALID_BODY), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(200);
    expect(mockFns.getRoundResults).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.results).toBeNull();
    expect(body.localized).toBe(true);
  });

  it("passes the resolved locale to localizeSnapshot", async () => {
    mockFns.cookieGet.mockImplementation((name: string) =>
      name === "gh_locale" ? { value: "fr" } : undefined
    );

    const POST = await loadRoute();
    const response = await POST(createMockRequest(VALID_BODY), {
      params: { gameId: GAME_ID },
    });

    expect(response.status).toBe(200);
    expect(mockFns.localizeSnapshot).toHaveBeenCalledWith(SNAPSHOT, "fr");
  });
});
