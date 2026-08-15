import { describe, it, expect, beforeEach, vi } from "vitest";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const OTHER_USER_ID = "abcdef12-3456-7890-abcd-ef1234567891";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  getDbPool: vi.fn(),
  responseCalls: [] as Array<{ body: unknown; init?: { status?: number } }>,
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/db", () => ({
  getDbPool: mockFns.getDbPool,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => {
      mockFns.responseCalls.push({ body, init });
      return {
        status: init?.status ?? 200,
        json: async () => body,
      };
    }),
  },
}));

type MockInvitation = {
  id: string;
  game_id: string;
  invitee_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  expires_at: Date;
};

type MockNotification = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: Date;
};

type MockState = {
  notifications: MockNotification[];
  invitations: MockInvitation[];
};

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

function createSupabaseClient(user: { id: string } | null, state: MockState) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("Unauthorized"),
      }),
    },
    from: (table: string) => {
      if (table !== "notifications") {
        throw new Error(`Unexpected table: ${table}`);
      }

      let mutation: Record<string, unknown> | null = null;
      let inIds: string[] | null = null;
      let eqField: string | null = null;
      let eqValue: unknown = null;

      const builder: any = {
        update: (m: Record<string, unknown>) => {
          mutation = m;
          return builder;
        },
        in: (field: string, ids: string[]) => {
          if (field !== "id") {
            throw new Error(`Unexpected .in field: ${field}`);
          }
          inIds = ids;
          return builder;
        },
        eq: (field: string, value: unknown) => {
          eqField = field;
          eqValue = value;
          return builder;
        },
        select: () => {
          const result: { data: { id: string }[] | null; error: Error | null } = {
            data: [],
            error: null,
          };

          if (mutation && inIds && eqField === "user_id") {
            const matched = state.notifications.filter(
              (n) => inIds!.includes(n.id) && n.user_id === eqValue
            );
            matched.forEach((n) => {
              Object.assign(n, mutation);
            });
            result.data = matched.map((n) => ({ id: n.id }));
          }

          return Promise.resolve(result);
        },
      };

      return builder;
    },
  };
}

function nowPlus(ms: number) {
  return new Date(Date.now() + ms);
}

function createMockPool(state: MockState) {
  function visibleForUser(userId: string) {
    return state.notifications
      .filter((n) => n.user_id === userId)
      .filter((n) => {
        if (n.type !== "lobby_invite") return true;

        const invitationId = n.payload?.invitation_id as string | undefined;
        const gameId = n.payload?.game_id as string | undefined;

        const invitation = state.invitations.find((inv) => {
          if (invitationId) return inv.id === invitationId;
          if (gameId) return inv.game_id === gameId && inv.invitee_id === userId;
          return false;
        });

        if (!invitation) return false;
        if (invitation.status !== "pending") return false;
        if (invitation.expires_at < new Date()) return false;
        return true;
      })
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const userId = params?.[0] as string | undefined;

    if (typeof sql === "string" && sql.includes("SELECT n.id, n.type") && sql.includes("LIMIT 50")) {
      if (!userId) return { rows: [] };
      const rows = visibleForUser(userId).slice(0, 50);
      return {
        rows: rows.map((n) => ({
          id: n.id,
          type: n.type,
          payload: n.payload,
          read: n.read,
          created_at: n.created_at,
        })),
      };
    }

    if (typeof sql === "string" && sql.includes("SELECT COUNT(*)::integer as count")) {
      if (!userId) return { rows: [{ count: 0 }] };
      const count = visibleForUser(userId).filter((n) => !n.read).length;
      return { rows: [{ count }] };
    }

    return { rows: [] };
  });

  return { query };
}

let currentState: MockState = { notifications: [], invitations: [] };
let currentPool: ReturnType<typeof createMockPool>;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockFns.responseCalls.length = 0;

  currentState = { notifications: [], invitations: [] };
  currentPool = createMockPool(currentState);

  mockFns.createAuthenticatedServerClient.mockReturnValue(
    createSupabaseClient({ id: USER_ID }, currentState)
  );
  mockFns.getDbPool.mockReturnValue(currentPool);
});

async function loadRoute() {
  const mod = await import("./route");
  return { GET: mod.GET, PATCH: mod.PATCH };
}

describe("GET /api/notifications", () => {
  it("returns 401 and reads nothing when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient(null, currentState)
    );

    const { GET } = await loadRoute();
    const response = await GET({} as any);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(currentPool.query).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct shape and scoped notifications", async () => {
    currentState.notifications = [
      {
        id: "10000000-0000-0000-0000-000000000001",
        user_id: USER_ID,
        type: "generic",
        payload: { message: "hello" },
        read: false,
        created_at: new Date("2026-08-15T06:00:00.000Z"),
      },
      {
        id: "10000000-0000-0000-0000-000000000002",
        user_id: USER_ID,
        type: "generic",
        payload: { message: "older" },
        read: true,
        created_at: new Date("2026-08-15T05:00:00.000Z"),
      },
    ];

    const { GET } = await loadRoute();
    const response = await GET({} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toHaveLength(2);
    expect(body.unread_count).toBe(1);
    expect(body.notifications[0]).toEqual({
      id: "10000000-0000-0000-0000-000000000001",
      type: "generic",
      payload: { message: "hello" },
      read: false,
      created_at: "2026-08-15T06:00:00.000Z",
    });
    expect(body.notifications[1].read).toBe(true);
    expect(body.notifications[1].created_at).toBe("2026-08-15T05:00:00.000Z");
  });

  it("returns unread_count independent of the LIMIT on returned rows", async () => {
    const notifications: MockNotification[] = [];
    for (let i = 0; i < 55; i++) {
      notifications.push({
        id: `20000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
        user_id: USER_ID,
        type: "generic",
        payload: { index: i },
        read: false,
        created_at: new Date(Date.UTC(2026, 7, 15, 5, 0, i)),
      });
    }
    currentState.notifications = notifications;

    const { GET } = await loadRoute();
    const response = await GET({} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toHaveLength(50);
    expect(body.unread_count).toBe(55);
  });

  it("excludes expired or non-pending lobby_invite notifications from the feed", async () => {
    const validInviteId = "30000000-0000-0000-0000-000000000001";
    const expiredInviteId = "30000000-0000-0000-0000-000000000002";
    const cancelledInviteId = "30000000-0000-0000-0000-000000000003";
    const gameId = "40000000-0000-0000-0000-000000000000";

    currentState.invitations = [
      {
        id: validInviteId,
        game_id: gameId,
        invitee_id: USER_ID,
        status: "pending",
        expires_at: nowPlus(86400000),
      },
      {
        id: expiredInviteId,
        game_id: gameId,
        invitee_id: USER_ID,
        status: "pending",
        expires_at: new Date(Date.now() - 1000),
      },
      {
        id: cancelledInviteId,
        game_id: gameId,
        invitee_id: USER_ID,
        status: "cancelled",
        expires_at: nowPlus(86400000),
      },
    ];

    currentState.notifications = [
      {
        id: "50000000-0000-0000-0000-000000000001",
        user_id: USER_ID,
        type: "lobby_invite",
        payload: { invitation_id: validInviteId },
        read: false,
        created_at: nowPlus(1000),
      },
      {
        id: "50000000-0000-0000-0000-000000000002",
        user_id: USER_ID,
        type: "lobby_invite",
        payload: { invitation_id: expiredInviteId },
        read: false,
        created_at: nowPlus(2000),
      },
      {
        id: "50000000-0000-0000-0000-000000000003",
        user_id: USER_ID,
        type: "lobby_invite",
        payload: { invitation_id: cancelledInviteId },
        read: false,
        created_at: nowPlus(3000),
      },
      {
        id: "50000000-0000-0000-0000-000000000004",
        user_id: USER_ID,
        type: "generic",
        payload: {},
        read: true,
        created_at: nowPlus(4000),
      },
    ];

    const { GET } = await loadRoute();
    const response = await GET({} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.notifications.map((n: any) => n.id);
    expect(ids).toContain("50000000-0000-0000-0000-000000000001");
    expect(ids).toContain("50000000-0000-0000-0000-000000000004");
    expect(ids).not.toContain("50000000-0000-0000-0000-000000000002");
    expect(ids).not.toContain("50000000-0000-0000-0000-000000000003");

    const selectCall = currentPool.query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("SELECT n.id, n.type")
    );
    expect(selectCall?.[0]).toContain("game_invitations");
    expect(selectCall?.[0]).toContain("status = 'pending'");
    expect(selectCall?.[0]).toContain("expires_at >= now()");
  });

  it("scopes queries to the requesting user and does not leak another user's notifications", async () => {
    currentState.notifications = [
      {
        id: "60000000-0000-0000-0000-000000000001",
        user_id: USER_ID,
        type: "generic",
        payload: {},
        read: false,
        created_at: nowPlus(1000),
      },
      {
        id: "60000000-0000-0000-0000-000000000002",
        user_id: OTHER_USER_ID,
        type: "generic",
        payload: {},
        read: false,
        created_at: nowPlus(2000),
      },
    ];

    const { GET } = await loadRoute();
    const response = await GET({} as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe("60000000-0000-0000-0000-000000000001");

    const listCall = currentPool.query.mock.calls.find(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("SELECT n.id, n.type") &&
        sql.includes("LIMIT 50")
    );
    const countCall = currentPool.query.mock.calls.find(
      ([sql]) =>
        typeof sql === "string" && sql.includes("SELECT COUNT(*)::integer as count")
    );
    expect(listCall?.[1]).toEqual([USER_ID]);
    expect(countCall?.[1]).toEqual([USER_ID]);
  });
});

describe("PATCH /api/notifications", () => {
  it("returns 400 and writes nothing when ids is not an array", async () => {
    const { PATCH } = await loadRoute();
    const response = await PATCH(createMockRequest({ ids: "not-an-array" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ids is required and must be a non-empty array",
    });
    expect(currentPool.query).not.toHaveBeenCalled();
  });

  it("returns 400 and writes nothing when ids is an empty array", async () => {
    const { PATCH } = await loadRoute();
    const response = await PATCH(createMockRequest({ ids: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ids is required and must be a non-empty array",
    });
    expect(currentPool.query).not.toHaveBeenCalled();
  });

  it("returns 400 and writes nothing when ids contains a malformed UUID", async () => {
    const { PATCH } = await loadRoute();
    const response = await PATCH(
      createMockRequest({ ids: ["70000000-0000-0000-0000-000000000001", "not-a-uuid"] })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Each id must be a valid UUID",
    });
  });

  it("returns 400 and writes nothing when the request body is not valid JSON", async () => {
    const { PATCH } = await loadRoute();
    const response = await PATCH(createMockRequestWithInvalidJson());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ids is required and must be a non-empty array",
    });
  });

  it("marks only the specified notifications as read and returns the updated count", async () => {
    const id1 = "80000000-0000-0000-0000-000000000001";
    const id2 = "80000000-0000-0000-0000-000000000002";
    const id3 = "80000000-0000-0000-0000-000000000003";

    currentState.notifications = [
      { id: id1, user_id: USER_ID, type: "generic", payload: {}, read: false, created_at: nowPlus(1000) },
      { id: id2, user_id: USER_ID, type: "generic", payload: {}, read: false, created_at: nowPlus(2000) },
      { id: id3, user_id: USER_ID, type: "generic", payload: {}, read: false, created_at: nowPlus(3000) },
    ];

    const { PATCH } = await loadRoute();
    const response = await PATCH(createMockRequest({ ids: [id1, id3] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 2 });

    const n1 = currentState.notifications.find((n) => n.id === id1);
    const n2 = currentState.notifications.find((n) => n.id === id2);
    const n3 = currentState.notifications.find((n) => n.id === id3);
    expect(n1?.read).toBe(true);
    expect(n2?.read).toBe(false);
    expect(n3?.read).toBe(true);
  });

  it("does not mark another user's notification as read and returns updated: 0", async () => {
    const otherUserNotificationId = "90000000-0000-0000-0000-000000000001";

    currentState.notifications = [
      {
        id: otherUserNotificationId,
        user_id: OTHER_USER_ID,
        type: "generic",
        payload: {},
        read: false,
        created_at: nowPlus(1000),
      },
    ];

    const { PATCH } = await loadRoute();
    const response = await PATCH(createMockRequest({ ids: [otherUserNotificationId] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 0 });

    const notification = currentState.notifications[0];
    expect(notification.read).toBe(false);
    expect(notification.user_id).toBe(OTHER_USER_ID);
  });

  it("returns 401 and writes nothing when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient(null, currentState)
    );

    const { PATCH } = await loadRoute();
    const response = await PATCH(
      createMockRequest({ ids: ["90000000-0000-0000-0000-000000000002"] })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
