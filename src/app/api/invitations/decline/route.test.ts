import { describe, it, expect, beforeEach, vi } from "vitest";
import { type DbTransactionClient } from "@/server/sessionCore";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const OTHER_USER_ID = "abcdef12-3456-7890-abcd-ef1234567891";
const INVITATION_ID = "12345678-1234-1234-1234-123456789abc";
const GAME_ID = "11111111-2222-3333-4444-555555555555";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  getTransactionClient: vi.fn(),
  responseCalls: [] as Array<{ body: unknown; init: { status?: number } }>,
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/sessionCore", () => ({
  getTransactionClient: mockFns.getTransactionClient,
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
    } | null,
    notifications: [] as Array<{
      id: string;
      user_id: string;
      type: string;
      read: boolean;
      payload: { invitation_id?: string; game_id?: string };
    }>,
  };

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }

    if (
      typeof sql === "string" &&
      sql.includes("SELECT id, game_id, invitee_id, status")
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
      sql.includes("UPDATE public.game_invitations") &&
      sql.includes("status = 'declined'")
    ) {
      const [invitationId] = params ?? [];
      if (state.invitation && state.invitation.id === invitationId) {
        state.invitation.status = "declined";
      }
      return { rows: [] };
    }

    if (
      typeof sql === "string" &&
      sql.includes("UPDATE public.notifications") &&
      sql.includes("SET read = true")
    ) {
      const [userId, invitationId, gameId] = params ?? [];
      for (const n of state.notifications) {
        if (
          n.user_id === userId &&
          n.type === "lobby_invite" &&
          (n.payload.invitation_id === invitationId ||
            (!n.payload.invitation_id && n.payload.game_id === gameId))
        ) {
          n.read = true;
        }
      }
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
    addNotification(n: (typeof state.notifications)[number]) {
      state.notifications.push(n);
    },
    getState() {
      return state;
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
});

function findQuery(sqlIncludes: string) {
  return currentMockClient.query.mock.calls.find(
    ([sql]) => typeof sql === "string" && sql.includes(sqlIncludes)
  );
}

describe("POST /api/invitations/decline", () => {
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
    expect(currentMockClient.getState().invitation?.status).toBe("pending");
  });

  it("returns 409 and rolls back when the invitation is no longer pending", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "accepted",
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Invitation is no longer pending",
      code: "INVITATION_NO_LONGER_VALID",
    });
    expect(findQuery("BEGIN")).toBeDefined();
    expect(findQuery("ROLLBACK")).toBeDefined();
    expect(findQuery("COMMIT")).toBeUndefined();
    expect(findQuery("UPDATE public.game_invitations")).toBeUndefined();
    expect(findQuery("UPDATE public.notifications")).toBeUndefined();
    expect(currentMockClient.getState().invitation?.status).toBe("accepted");
  });

  it("declines the invitation, syncs the notification read state, and commits on the happy path", async () => {
    currentMockClient.setInvitation({
      id: INVITATION_ID,
      game_id: GAME_ID,
      invitee_id: USER_ID,
      status: "pending",
    });

    currentMockClient.addNotification({
      id: "notif-001",
      user_id: USER_ID,
      type: "lobby_invite",
      read: false,
      payload: { invitation_id: INVITATION_ID, game_id: GAME_ID },
    });

    const POST = await loadRoute();
    const response = await POST(createMockRequest({ invitation_id: INVITATION_ID }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(currentMockClient.getState().invitation?.status).toBe("declined");

    const notifications = currentMockClient.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].read).toBe(true);

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
