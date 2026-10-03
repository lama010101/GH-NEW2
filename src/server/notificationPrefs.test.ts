import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  type NotificationChannel,
  DEFAULT_NOTIFICATION_CHANNEL,
} from "@/core/notificationTypes";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const USER_B = "abcdef12-3456-7890-abcd-ef1234567891";
const USER_C = "abcdef12-3456-7890-abcd-ef1234567892";

const mockFns = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createSupabaseServerClient: mockFns.createSupabaseServerClient,
}));

type PostgrestResult = { data: unknown; error: unknown };

// Minimal supabase-js builder mock covering both resolver chains:
// .select().eq().eq().maybeSingle() and .select().in().eq() awaited directly.
// The builder is thenable so `await chain` resolves to the canned result.
function createPostgrestBuilder(result: PostgrestResult) {
  const calls = {
    select: [] as string[],
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    maybeSingle: 0,
  };
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((cols: string) => {
    calls.select.push(cols);
    return builder;
  });
  builder.eq = vi.fn((col: string, val: unknown) => {
    calls.eq.push([col, val]);
    return builder;
  });
  builder.in = vi.fn((col: string, vals: unknown[]) => {
    calls.in.push([col, vals]);
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => {
    calls.maybeSingle += 1;
    return result;
  });
  builder.then = (
    onFulfilled?: ((v: unknown) => unknown) | null,
    onRejected?: ((e: unknown) => unknown) | null
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return { builder, calls };
}

let current: ReturnType<typeof createPostgrestBuilder>;

function mockPostgrest(result: PostgrestResult) {
  current = createPostgrestBuilder(result);
  mockFns.createSupabaseServerClient.mockReturnValue({
    from: vi.fn(() => current.builder),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockPostgrest({ data: null, error: null });
});

async function loadModule() {
  return import("./notificationPrefs");
}

describe("resolveNotificationChannel", () => {
  it("returns the stored channel when a row exists", async () => {
    mockPostgrest({ data: { channel: "in_app" }, error: null });
    const { resolveNotificationChannel } = await loadModule();

    const channel = await resolveNotificationChannel(USER_ID, "lobby_invite");

    expect(channel).toBe("in_app");
    expect(current.calls.select).toEqual(["channel"]);
    expect(current.calls.eq).toEqual([
      ["user_id", USER_ID],
      ["type", "lobby_invite"],
    ]);
    expect(current.calls.maybeSingle).toBe(1);
  });

  it("returns DEFAULT when no row exists (data null)", async () => {
    mockPostgrest({ data: null, error: null });
    const { resolveNotificationChannel } = await loadModule();

    expect(await resolveNotificationChannel(USER_ID, "lobby_invite")).toBe(
      DEFAULT_NOTIFICATION_CHANNEL
    );
  });

  it("returns DEFAULT when PostgREST returns an error object", async () => {
    mockPostgrest({
      data: null,
      error: { message: "relation does not exist" },
    });
    const { resolveNotificationChannel } = await loadModule();

    expect(await resolveNotificationChannel(USER_ID, "lobby_invite")).toBe(
      DEFAULT_NOTIFICATION_CHANNEL
    );
  });

  it("returns DEFAULT when the client throws", async () => {
    const throwing = createPostgrestBuilder({ data: null, error: null });
    (throwing.builder.maybeSingle as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("connection refused")
    );
    mockFns.createSupabaseServerClient.mockReturnValue({
      from: vi.fn(() => throwing.builder),
    });
    const { resolveNotificationChannel } = await loadModule();

    expect(await resolveNotificationChannel(USER_ID, "lobby_invite")).toBe(
      DEFAULT_NOTIFICATION_CHANNEL
    );
  });

  it("returns DEFAULT when createSupabaseServerClient itself throws", async () => {
    mockFns.createSupabaseServerClient.mockImplementation(() => {
      throw new Error("SUPABASE_SECRET_KEY_PROD is not set");
    });
    const { resolveNotificationChannel } = await loadModule();

    expect(await resolveNotificationChannel(USER_ID, "lobby_invite")).toBe(
      DEFAULT_NOTIFICATION_CHANNEL
    );
  });

  it("uses the supplied pg-style client instead of PostgREST", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ channel: "push" }] }),
    };
    const { resolveNotificationChannel } = await loadModule();

    const channel = await resolveNotificationChannel(
      USER_ID,
      "lobby_invite",
      client as any
    );

    expect(channel).toBe("push");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM notification_preferences"),
      [USER_ID, "lobby_invite"]
    );
    expect(mockFns.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns DEFAULT when the supplied client query rejects", async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error("txn aborted")),
    };
    const { resolveNotificationChannel } = await loadModule();

    expect(
      await resolveNotificationChannel(USER_ID, "lobby_invite", client as any)
    ).toBe(DEFAULT_NOTIFICATION_CHANNEL);
  });
});

describe("resolveNotificationChannelsBatch", () => {
  it("maps stored rows and fills missing users with DEFAULT", async () => {
    mockPostgrest({
      data: [
        { user_id: USER_ID, channel: "none" },
        { user_id: USER_C, channel: "push" },
      ],
      error: null,
    });
    const { resolveNotificationChannelsBatch } = await loadModule();

    const result = await resolveNotificationChannelsBatch(
      [USER_ID, USER_B, USER_C],
      "lobby_invite"
    );

    expect(result.get(USER_ID)).toBe("none");
    expect(result.get(USER_B)).toBe(DEFAULT_NOTIFICATION_CHANNEL);
    expect(result.get(USER_C)).toBe("push");
    expect(current.calls.select).toEqual(["user_id, channel"]);
    expect(current.calls.in).toEqual([
      ["user_id", [USER_ID, USER_B, USER_C]],
    ]);
    expect(current.calls.eq).toEqual([["type", "lobby_invite"]]);
  });

  it("returns all DEFAULTs when PostgREST returns an error object", async () => {
    mockPostgrest({ data: null, error: { message: "boom" } });
    const { resolveNotificationChannelsBatch } = await loadModule();

    const result = await resolveNotificationChannelsBatch(
      [USER_ID, USER_B],
      "lobby_invite"
    );

    expect(result.get(USER_ID)).toBe(DEFAULT_NOTIFICATION_CHANNEL);
    expect(result.get(USER_B)).toBe(DEFAULT_NOTIFICATION_CHANNEL);
  });

  it("returns all DEFAULTs when the client throws", async () => {
    const throwing = createPostgrestBuilder({ data: null, error: null });
    (throwing.builder.eq as ReturnType<typeof vi.fn>).mockReturnValue({
      then: (_ok: unknown, bad: (e: Error) => unknown) =>
        bad(new Error("connection refused")),
    });
    mockFns.createSupabaseServerClient.mockReturnValue({
      from: vi.fn(() => throwing.builder),
    });
    const { resolveNotificationChannelsBatch } = await loadModule();

    const result = await resolveNotificationChannelsBatch(
      [USER_ID, USER_B],
      "lobby_invite"
    );

    expect(result.get(USER_ID)).toBe(DEFAULT_NOTIFICATION_CHANNEL);
    expect(result.get(USER_B)).toBe(DEFAULT_NOTIFICATION_CHANNEL);
  });

  it("returns an empty Map for empty input without querying", async () => {
    const { resolveNotificationChannelsBatch } = await loadModule();

    const result = await resolveNotificationChannelsBatch([], "lobby_invite");

    expect(result.size).toBe(0);
    expect(mockFns.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("uses the supplied pg-style client instead of PostgREST", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ user_id: USER_B, channel: "in_app" }],
      }),
    };
    const { resolveNotificationChannelsBatch } = await loadModule();

    const result = await resolveNotificationChannelsBatch(
      [USER_ID, USER_B],
      "lobby_invite",
      client as any
    );

    expect(result.get(USER_ID)).toBe(DEFAULT_NOTIFICATION_CHANNEL);
    expect(result.get(USER_B)).toBe("in_app");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM notification_preferences"),
      ["lobby_invite", [USER_ID, USER_B]]
    );
    expect(mockFns.createSupabaseServerClient).not.toHaveBeenCalled();
  });
});

describe("shouldSendPush / shouldInsertInApp truth table", () => {
  it.each([
    ["none", false, false],
    ["push", true, false],
    ["in_app", false, true],
    ["both", true, true],
  ] as Array<[NotificationChannel, boolean, boolean]>)(
    "channel '%s' -> shouldSendPush=%s, shouldInsertInApp=%s",
    async (channel, expectPush, expectInApp) => {
      mockPostgrest({ data: { channel }, error: null });
      const { shouldSendPush, shouldInsertInApp } = await loadModule();

      expect(await shouldSendPush(USER_ID, "lobby_invite")).toBe(expectPush);
      expect(await shouldInsertInApp(USER_ID, "lobby_invite")).toBe(expectInApp);
    }
  );
});
