import { describe, it, expect, beforeEach, vi } from "vitest";
import { type NotificationChannel } from "@/core/notificationTypes";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const INVITEE_ID = "abcdef12-3456-7890-abcd-ef1234567891";
const INVITATION_ID = "12345678-1234-1234-1234-123456789abc";
const GAME_ID = "11111111-2222-3333-4444-555555555555";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  sendPushToUser: vi.fn(),
  resolveNotificationChannel: vi.fn(),
  responseCalls: [] as Array<{ body: unknown; init: { status?: number } }>,
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
  createSupabaseServerClient: mockFns.createSupabaseServerClient,
}));

vi.mock("@/server/pushSender", () => ({
  sendPushToUser: mockFns.sendPushToUser,
}));

vi.mock("@/server/notificationPrefs", () => ({
  resolveNotificationChannel: mockFns.resolveNotificationChannel,
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

// Minimal supabase-js chain mock for the service-role client:
// game_invitations.upsert().select().single(), profiles/sessions
// .select().eq().single(), notifications.insert(). Builders are memoized
// per table so tests can inspect the same spies the route used.
function createServiceClient(sessionMode: string | null = "sync") {
  const calls = {
    gameInvitationsUpsert: [] as Array<Record<string, unknown>>,
    notificationsInsert: [] as Array<Record<string, unknown>>,
  };

  const notificationsInsertMock = vi.fn(
    async (row: Record<string, unknown>) => {
      calls.notificationsInsert.push(row);
      return { error: null };
    }
  );

  const builders: Record<string, unknown> = {
    game_invitations: {
      upsert: vi.fn((row: Record<string, unknown>) => {
        calls.gameInvitationsUpsert.push(row);
        return {
          select: vi.fn(() => ({
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: INVITATION_ID }, error: null }),
          })),
        };
      }),
    },
    profiles: {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi
            .fn()
            .mockResolvedValue({ data: { display_name: "Inviter" }, error: null }),
        })),
      })),
    },
    sessions: {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi
            .fn()
            .mockResolvedValue({ data: sessionMode ? { mode: sessionMode } : null, error: null }),
        })),
      })),
    },
    notifications: {
      insert: notificationsInsertMock,
    },
  };

  const client = {
    from: vi.fn((table: string) => {
      const builder = builders[table];
      if (!builder) {
        throw new Error(`unexpected table: ${table}`);
      }
      return builder;
    }),
  };

  return { client, calls, notificationsInsertMock };
}

async function loadRoute() {
  const mod = await import("./route");
  return mod.POST;
}

let service: ReturnType<typeof createServiceClient>;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockFns.responseCalls.length = 0;

  service = createServiceClient("sync");

  mockFns.createAuthenticatedServerClient.mockReturnValue(
    authClient({ id: USER_ID })
  );
  mockFns.createSupabaseServerClient.mockReturnValue(service.client);
  mockFns.sendPushToUser.mockResolvedValue(undefined);
  mockFns.resolveNotificationChannel.mockResolvedValue("both");
});

function sendInvite() {
  return createMockRequest({ game_id: GAME_ID, invitee_id: INVITEE_ID });
}

describe("POST /api/invitations/send — lobby_invite channel enforcement", () => {
  it.each([
    ["none", false, false],
    ["push", false, true],
    ["in_app", true, false],
    ["both", true, true],
  ] as Array<[NotificationChannel, boolean, boolean]>)(
    "channel '%s' -> notification row: %s, push: %s (invitation row always created)",
    async (channel, expectInsert, expectPush) => {
      mockFns.resolveNotificationChannel.mockResolvedValue(channel);

      const POST = await loadRoute();
      const response = await POST(sendInvite());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        invitation_id: INVITATION_ID,
      });

      // The game_invitations row is always created regardless of channel.
      expect(service.calls.gameInvitationsUpsert).toHaveLength(1);
      expect(service.calls.gameInvitationsUpsert[0]).toMatchObject({
        game_id: GAME_ID,
        inviter_id: USER_ID,
        invitee_id: INVITEE_ID,
        status: "pending",
      });

      expect(mockFns.resolveNotificationChannel).toHaveBeenCalledWith(
        INVITEE_ID,
        "lobby_invite"
      );

      expect(service.calls.notificationsInsert).toHaveLength(
        expectInsert ? 1 : 0
      );
      if (expectInsert) {
        expect(service.calls.notificationsInsert[0]).toMatchObject({
          user_id: INVITEE_ID,
          type: "lobby_invite",
        });
      }

      expect(mockFns.sendPushToUser).toHaveBeenCalledTimes(expectPush ? 1 : 0);
      if (expectPush) {
        expect(mockFns.sendPushToUser).toHaveBeenCalledWith(
          INVITEE_ID,
          expect.objectContaining({
            tag: `lobby_invite:${GAME_ID}:${INVITEE_ID}`,
          })
        );
      }
    }
  );

  it("keeps the notification insert before the push send when channel is 'both'", async () => {
    mockFns.resolveNotificationChannel.mockResolvedValue("both");

    const POST = await loadRoute();
    const response = await POST(sendInvite());

    expect(response.status).toBe(200);
    expect(service.calls.notificationsInsert).toHaveLength(1);
    expect(mockFns.sendPushToUser).toHaveBeenCalledTimes(1);

    const insertOrder =
      service.notificationsInsertMock.mock.invocationCallOrder[0];
    const pushOrder = mockFns.sendPushToUser.mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(pushOrder);
  });

  it("falls back to 'both' and still delivers when the resolver throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockFns.resolveNotificationChannel.mockRejectedValue(new Error("db down"));

    const POST = await loadRoute();
    const response = await POST(sendInvite());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      invitation_id: INVITATION_ID,
    });

    expect(service.calls.gameInvitationsUpsert).toHaveLength(1);
    expect(service.calls.notificationsInsert).toHaveLength(1);
    expect(mockFns.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[invitations/send] notification prefs lookup failed, defaulting to 'both':",
      expect.any(Error)
    );

    consoleError.mockRestore();
  });
});
