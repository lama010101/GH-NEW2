import { describe, it, expect, beforeEach, vi } from "vitest";
import { type CompeteSessionSnapshot } from "@/core/types";
import { type DbTransactionClient, type SessionRow } from "@/server/sessionCore";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const OTHER_USER_ID = "abcdef12-3456-7890-abcd-ef1234567891";
const INVITATION_ID = "12345678-1234-1234-1234-123456789abc";
const GAME_ID = "11111111-2222-3333-4444-555555555555";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  getTransactionClient: vi.fn(),
  loadSessionRow: vi.fn(),
  loadCompeteSessionSnapshot: vi.fn(),
  validateJoinEligibility: vi.fn(),
  responseCalls: [] as Array<{ body: unknown; init: { status?: number } }>,
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/sessionCore", () => ({
  getTransactionClient: mockFns.getTransactionClient,
  loadSessionRow: mockFns.loadSessionRow,
  loadCompeteSessionSnapshot: mockFns.loadCompeteSessionSnapshot,
  validateJoinEligibility: mockFns.validateJoinEligibility,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => {
      mockFns.responseCalls.push({ body, init: init ?? {} });
      return {
        status: init?.status ?? 200,
        json: async () => body,
      };
    }),
  },
}));

function createMockRequest(json: unknown) {
  return {
    json: vi.fn().mockResolvedValue(json),
  } as any;
}

function createMockRequestWithInvalidJson() {
  return {
    json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
  } as any;
}

function createMockClient() {
  const state = {
    invitation: null as {
      id: string;
      game_id: string;
      invitee_id: string;
      status: string;
      expires_at: Date;
    } | null,
  };

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }

    if (
      typeof sql === "string" &&
      sql.includes("SELECT id, game_id, invitee_id, status, expires_at")
    ) {
      const [invitationId, userId] = params ?? [];
      if (
        state.invitation &&
        state.invitation.id === invitationId &&
        state.invitation.invitee_id === userId
      ) {
        return { rows: [state.invitation] };
      }
      return { rows: [] };
    }

    if (
      typeof sql === "string" &&
      sql.includes("UPDATE public.game_invitations")
    ) {
      return { rows: [] };
    }

    if (
      typeof sql === "string" &&
      sql.includes("UPDATE public.notifications")
    ) {
      return { rows: [] };
    }

    return { rows: [] };
  });

  const release = vi.fn();

  return {
    query,
    release,
    setInvitation(inv: typeof state.invitation) {
      state.invitation = inv;
    },
  };
}

function authClient(user: { id: string } | null, error?: Error) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: error ?? null,
      }),
    },
  };
}

function baseSession(): SessionRow {
  return { mode: "sync", session_deadline: null } as unknown as SessionRow;
}

function baseSnapshot(): CompeteSessionSnapshot {
  return { status: "LOBBY" } as unknown as CompeteSessionSnapshot;
}

async function loadRoute() {
  const mod = await import("./route");
  return mod.POST;
}

let currentMockClient: ReturnType<typeof createMockClient>;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockFns.responseCalls.length = 0;

  currentMockClient = createMockClient();

  mockFns.createAuthenticatedServerClient.mockReturnValue(
    authClient({ id: USER_ID })
  );
  mockFns.getTransactionClient.mockResolvedValue(
    currentMockClient as unknown as DbTransactionClient
  );
  mockFns.loadSessionRow.mockResolvedValue(baseSession());
  mockFns.loadCompeteSessionSnapshot.mockResolvedValue(baseSnapshot());
  mockFns.validateJoinEligibility.mockResolvedValue({
    ok: true,
    isActiveRejoiner: false,
  });
});

function findQuery(sqlIncludes: string) {
  return currentMockClient.query.mock.calls.find(
    ([sql]) => typeof sql === "string" && sql.includes(sqlIncludes)
  );
}

describe("POST /api/invitations/accept", () => {
  it("returns 401 and writes nothing when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      authClient(null, new Error("Unauthorized"))
    );

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockFns.getTransactionClient).not.toHaveBeenCalled();
    expect(currentMockClient.query).not.toHaveBeenCalled();
  });

  it("returns 400 and writes nothing when invitation_id is missing", async () => {
    const POST = await loadRoute();
    const response = await POST(createMockRequest({}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invitation_id is required and must be a valid UUID",
    });
    expect(mockFns.getTransactionClient).not.toHaveBeenCalled();
    expect(currentMockClient.query).not.toHaveBeenCalled();
  });

  it("returns 400 and writes nothing when invitation_id is malformed", async () => {
    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invitation_id is required and must be a valid UUID",
    });
    expect(mockFns.getTransactionClient).not.toHaveBeenCalled();
    expect(currentMockClient.query).not.toHaveBeenCalled();
  });

  it("returns 400 and writes nothing when the request body is not valid JSON", async () => {
    const POST = await loadRoute();
    const response = await POST(createMockRequestWithInvalidJson());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invitation_id is required and must be a valid UUID",
    });
    expect(mockFns.getTransactionClient).not.toHaveBeenCalled();
    expect(currentMockClient.query).not.toHaveBeenCalled();
  });

  it("returns 404 and rolls back when the invitation does not belong to the authenticated user", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: OTHER_USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Invitation not found" });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
    expect(findQuery("UPDATE public.game_invitations")).toBeUndefined();
    expect(findQuery("UPDATE public.notifications")).toBeUndefined();
  });

  it("returns 409 and rolls back when the invitation is no longer pending", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "accepted",
      expires_at: new Date(Date.now() + 86400000),
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Invitation is no longer valid",
      code: "INVITATION_NO_LONGER_VALID",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
    expect(findQuery("UPDATE public.game_invitations")).toBeUndefined();
    expect(findQuery("UPDATE public.notifications")).toBeUndefined();
  });

  it("returns 409 and rolls back when the invitation has expired", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() - 1000),
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Invitation is no longer valid",
      code: "INVITATION_NO_LONGER_VALID",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
    expect(findQuery("UPDATE public.game_invitations")).toBeUndefined();
    expect(findQuery("UPDATE public.notifications")).toBeUndefined();
  });

  it("returns 404 and rolls back when the session does not exist", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });
    mockFns.loadSessionRow.mockResolvedValue(null);

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Session not found" });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
    expect(findQuery("UPDATE public.game_invitations")).toBeUndefined();
    expect(findQuery("UPDATE public.notifications")).toBeUndefined();
  });

  it("returns 409 PLAYER_KICKED and rolls back when validateJoinEligibility says the player was kicked", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });
    mockFns.validateJoinEligibility.mockResolvedValue({
      ok: false,
      error: "You were removed from this game by the host",
      code: "PLAYER_KICKED",
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "You were removed from this game by the host",
      code: "PLAYER_KICKED",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
    expect(findQuery("UPDATE public.game_invitations")).toBeUndefined();
    expect(findQuery("UPDATE public.notifications")).toBeUndefined();
  });

  it("returns 409 SESSION_FULL and rolls back when the session is full", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });
    mockFns.validateJoinEligibility.mockResolvedValue({
      ok: false,
      error: "Session is full (8 players max)",
      code: "SESSION_FULL",
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Session is full (8 players max)",
      code: "SESSION_FULL",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
  });

  it("returns 409 SESSION_FULL with the async 30-player cap message for a full Relax session", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });
    mockFns.validateJoinEligibility.mockResolvedValue({
      ok: false,
      error: "Session is full (30 players max)",
      code: "SESSION_FULL",
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Session is full (30 players max)",
      code: "SESSION_FULL",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
  });

  it("returns 409 GAME_IN_PROGRESS and rolls back when the session is already in progress", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });
    mockFns.validateJoinEligibility.mockResolvedValue({
      ok: false,
      error: "Game already in progress",
      code: "GAME_IN_PROGRESS",
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Game already in progress",
      code: "GAME_IN_PROGRESS",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
  });

  it("returns 409 DEADLINE_PASSED and rolls back when the async session deadline has passed", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });
    mockFns.validateJoinEligibility.mockResolvedValue({
      ok: false,
      error: "Session deadline has passed",
      code: "DEADLINE_PASSED",
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Session deadline has passed",
      code: "DEADLINE_PASSED",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
  });

  it("accepts the invitation, syncs the notification read state, and commits on the happy path", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000),
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, game_id: GAME_ID });

    expect(mockFns.validateJoinEligibility).toHaveBeenCalledWith(
      currentMockClient,
      GAME_ID,
      USER_ID,
      expect.objectContaining({ mode: "sync" }),
      expect.objectContaining({ status: "LOBBY" })
    );

    expect(currentMockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(currentMockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE public.game_invitations"),
      [INVITATION_ID]
    );
    expect(currentMockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE public.notifications"),
      [USER_ID, INVITATION_ID, GAME_ID]
    );
    expect(currentMockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(findQuery("ROLLBACK")).toBeUndefined();
    expect(currentMockClient.release).toHaveBeenCalled();
  });
});
