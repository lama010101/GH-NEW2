import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PUSH_TITLE, PUSH_ICON, PUSH_BADGE, PUSH_COLOR } from "@/core/pushBranding";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";

const mockFns = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  fcmSend: vi.fn(),
  fcmInitializeApp: vi.fn(),
  fcmGetApp: vi.fn(),
  fcmGetMessaging: vi.fn(),
  fcmCert: vi.fn(),
}));

vi.mock("web-push", () => ({
  sendNotification: mockFns.sendNotification,
  setVapidDetails: mockFns.setVapidDetails,
  WebPushError: class WebPushError extends Error {
    statusCode?: number;
  },
}));

vi.mock("firebase-admin/app", () => ({
  initializeApp: mockFns.fcmInitializeApp,
  getApp: mockFns.fcmGetApp,
  cert: mockFns.fcmCert,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: mockFns.fcmGetMessaging,
}));

vi.mock("@/core/supabaseServer", () => ({
  createSupabaseServerClient: mockFns.createSupabaseServerClient,
}));

const SUB = {
  id: "sub-row-1",
  endpoint: "https://push.example.com/ep1",
  p256dh: "p256dh-key",
  auth: "auth-secret",
};

// Two-builder mock: select-chain resolves {data: subs}; delete-chain resolves {error:null}.
function mockSubs(subs: Array<typeof SUB>) {
  const calls = { deleteEq: [] as Array<[string, unknown]> };
  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.eq = vi.fn((col: string, val: unknown) => {
    calls.deleteEq.push([col, val]);
    return Promise.resolve({ error: null });
  });
  const selectBuilder: Record<string, unknown> = {};
  selectBuilder.select = vi.fn(() => selectBuilder);
  selectBuilder.eq = vi.fn(() => selectBuilder);
  selectBuilder.then = (
    onFulfilled?: ((v: unknown) => unknown) | null,
    onRejected?: ((e: unknown) => unknown) | null
  ) => Promise.resolve({ data: subs, error: null }).then(onFulfilled, onRejected);
  mockFns.createSupabaseServerClient.mockReturnValue({
    from: vi.fn(() => selectBuilder),
  });
  // selectBuilder.delete returns the deleteBuilder so .delete().eq() routes there
  selectBuilder.delete = vi.fn(() => deleteBuilder);
  return { calls, selectBuilder, deleteBuilder };
}

const VAPID_ENV = ["VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];
const FCM_ENV = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const k of [...VAPID_ENV, ...FCM_ENV]) {
    savedEnv[k] = process.env[k];
  }
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  // FCM channel disabled by default: tests opt in via setFcmEnv().
  for (const k of FCM_ENV) {
    delete process.env[k];
  }
  mockSubs([SUB]);
  mockFns.sendNotification.mockResolvedValue(undefined);
  mockFns.fcmInitializeApp.mockReturnValue("gh-fcm-app");
  mockFns.fcmGetApp.mockReturnValue("gh-fcm-app");
  mockFns.fcmCert.mockReturnValue("cert");
  mockFns.fcmGetMessaging.mockReturnValue({ send: mockFns.fcmSend });
  mockFns.fcmSend.mockResolvedValue("fcm-message-id");
});

afterEach(() => {
  for (const k of [...VAPID_ENV, ...FCM_ENV]) {
    if (savedEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = savedEnv[k];
    }
  }
});

async function loadModule() {
  return import("./pushSender");
}

describe("sendPushToUser", () => {
  it("passes default TTL 86400 and urgency 'normal' to sendNotification", async () => {
    const { sendPushToUser } = await loadModule();
    await sendPushToUser(USER_ID, { body: "hello", url: "/x", tag: "t" });

    expect(mockFns.sendNotification).toHaveBeenCalledTimes(1);
    const [, , options] = mockFns.sendNotification.mock.calls[0];
    expect(options).toEqual({ TTL: 86400, urgency: "normal" });
  });

  it("passes explicit ttl/urgency overrides to sendNotification", async () => {
    const { sendPushToUser } = await loadModule();
    await sendPushToUser(USER_ID, { body: "b", ttl: 900, urgency: "high" });

    const [, , options] = mockFns.sendNotification.mock.calls[0];
    expect(options).toEqual({ TTL: 900, urgency: "high" });
  });

  it("wires title/icon/badge defaults into the JSON body, with no ttl/urgency keys", async () => {
    const { sendPushToUser } = await loadModule();
    await sendPushToUser(USER_ID, {
      body: "you were invited",
      url: "/compete/abc",
      tag: "lobby_invite:x",
      ttl: 900,
      urgency: "high",
    });

    const [, payloadString] = mockFns.sendNotification.mock.calls[0];
    const body = JSON.parse(payloadString);
    expect(body).toEqual({
      title: PUSH_TITLE,
      body: "you were invited",
      icon: PUSH_ICON,
      badge: PUSH_BADGE,
      url: "/compete/abc",
      tag: "lobby_invite:x",
    });
    expect(body).not.toHaveProperty("ttl");
    expect(body).not.toHaveProperty("urgency");
  });

  it("honours caller-supplied title/icon/badge over defaults", async () => {
    const { sendPushToUser } = await loadModule();
    await sendPushToUser(USER_ID, {
      title: "Custom",
      icon: "/i.png",
      badge: "/b.png",
      body: "b",
    });

    const body = JSON.parse(mockFns.sendNotification.mock.calls[0][1]);
    expect(body.title).toBe("Custom");
    expect(body.icon).toBe("/i.png");
    expect(body.badge).toBe("/b.png");
  });

  it("deletes the subscription row on 410", async () => {
    const err = Object.assign(new Error("Gone"), { statusCode: 410 });
    mockFns.sendNotification.mockRejectedValue(err);
    const { calls, deleteBuilder } = mockSubs([SUB]);
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, { body: "b" });

    expect(calls.deleteEq).toEqual([["id", SUB.id]]);
    expect(deleteBuilder.eq).toHaveBeenCalledTimes(1);
  });

  it("deletes the subscription row on 404", async () => {
    const err = Object.assign(new Error("Not Found"), { statusCode: 404 });
    mockFns.sendNotification.mockRejectedValue(err);
    const { calls } = mockSubs([SUB]);
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, { body: "b" });

    expect(calls.deleteEq).toEqual([["id", SUB.id]]);
  });

  it("normalizes a bare-email VAPID_SUBJECT to mailto: before setVapidDetails", async () => {
    process.env.VAPID_SUBJECT = "lama010101@gmail.com";
    const { sendPushToUser } = await loadModule();
    await sendPushToUser(USER_ID, { body: "hi" });
    expect(mockFns.setVapidDetails).toHaveBeenCalledWith(
      "mailto:lama010101@gmail.com",
      "test-public-key",
      "test-private-key"
    );
    expect(mockFns.sendNotification).toHaveBeenCalled();
  });

  it("logs one send-attempt line per subscription on success", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendPushToUser } = await loadModule();
    await sendPushToUser(USER_ID, { body: "hi" });
    const attempts = info.mock.calls
      .map((c) => c[0])
      .filter((m) => typeof m === "string" && m.includes("send attempt"));
    expect(attempts).toContain(
      `[pushSender] send attempt user=${USER_ID} sub=${SUB.id} result=success`
    );
    info.mockRestore();
  });

  it("logs a failed send-attempt line with status when sendNotification throws", async () => {
    const err = Object.assign(new Error("Gone"), { statusCode: 410 });
    mockFns.sendNotification.mockRejectedValueOnce(err);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendPushToUser } = await loadModule();
    await sendPushToUser(USER_ID, { body: "hi" });
    const attempts = errorSpy.mock.calls
      .map((c) => c[0])
      .filter((m) => typeof m === "string" && m.includes("send attempt"));
    expect(attempts).toContain(
      `[pushSender] send attempt user=${USER_ID} sub=${SUB.id} result=failed`
    );
    errorSpy.mockRestore();
    info.mockRestore();
  });

  it("sends nothing when VAPID keys are unconfigured", async () => {
    delete process.env.VAPID_SUBJECT;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, { body: "b" });

    expect(mockFns.sendNotification).not.toHaveBeenCalled();
    expect(mockFns.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("sends nothing when the user has no subscriptions", async () => {
    mockSubs([]);
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, { body: "b" });

    expect(mockFns.sendNotification).not.toHaveBeenCalled();
  });
});

const FCM_ROW = { id: "fcm-row-1", token: "fcm-device-token-abcdef123456" };

// Per-table client mock: push_subscriptions and fcm_tokens get independent
// select/delete chains so the FCM channel can be inspected on its own.
function mockBothTables({
  subs = [SUB],
  fcmTokens = [FCM_ROW],
}: {
  subs?: Array<typeof SUB>;
  fcmTokens?: Array<typeof FCM_ROW>;
} = {}) {
  const calls = {
    fcmDeleteEq: [] as Array<[string, unknown]>,
    fromTables: [] as string[],
  };

  const makeThenable = (data: unknown[]) => {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.then = (
      onFulfilled?: ((v: unknown) => unknown) | null,
      onRejected?: ((e: unknown) => unknown) | null
    ) => Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    return b;
  };

  const makeDelete = (sink: Array<[string, unknown]>) => {
    const b: Record<string, unknown> = {};
    b.eq = vi.fn((col: string, val: unknown) => {
      sink.push([col, val]);
      return Promise.resolve({ error: null });
    });
    return b;
  };

  mockFns.createSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) => {
      calls.fromTables.push(table);
      if (table === "fcm_tokens") {
        const sel = makeThenable(fcmTokens);
        sel.delete = vi.fn(() => makeDelete(calls.fcmDeleteEq));
        return sel;
      }
      const sel = makeThenable(subs);
      sel.delete = vi.fn(() => makeDelete([]));
      return sel;
    }),
  });
  return calls;
}

function setFcmEnv() {
  process.env.FIREBASE_PROJECT_ID = "proj-test";
  process.env.FIREBASE_CLIENT_EMAIL = "svc@example.com";
  process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----";
}

describe("sendPushToUser FCM channel", () => {
  it("sends an FCM notification+data message per token with android options", async () => {
    setFcmEnv();
    mockBothTables();
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, {
      body: "you were invited",
      url: "/compete/abc",
      tag: "lobby_invite:x",
      ttl: 900,
      urgency: "high",
    });

    expect(mockFns.fcmSend).toHaveBeenCalledTimes(1);
    const msg = mockFns.fcmSend.mock.calls[0][0];
    expect(msg.token).toBe(FCM_ROW.token);
    expect(msg.notification).toEqual({ title: PUSH_TITLE, body: "you were invited" });
    expect(msg.data).toEqual({ url: "/compete/abc", tag: "lobby_invite:x" });
    expect(msg.android.priority).toBe("high");
    expect(msg.android.ttl).toBe(900_000);
    expect(msg.android.notification).toEqual({
      channelId: "gh_default",
      icon: "ic_stat_notification",
      color: PUSH_COLOR,
      tag: "lobby_invite:x",
    });
  });

  it("deletes the fcm_tokens row on registration-token-not-registered", async () => {
    setFcmEnv();
    const calls = mockBothTables();
    mockFns.fcmSend.mockRejectedValue(
      Object.assign(new Error("unregistered"), {
        code: "messaging/registration-token-not-registered",
      })
    );
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, { body: "b" });

    expect(calls.fcmDeleteEq).toEqual([["id", FCM_ROW.id]]);
  });

  it("skips the FCM channel silently when Firebase env is missing", async () => {
    const calls = mockBothTables();
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, { body: "b" });

    expect(mockFns.fcmSend).not.toHaveBeenCalled();
    expect(mockFns.fcmInitializeApp).not.toHaveBeenCalled();
    expect(calls.fromTables).not.toContain("fcm_tokens");
    // Web channel still runs independently.
    expect(mockFns.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("still delivers web push when the FCM send throws", async () => {
    setFcmEnv();
    const calls = mockBothTables();
    mockFns.fcmSend.mockRejectedValue(new Error("fcm boom"));
    const { sendPushToUser } = await loadModule();

    await sendPushToUser(USER_ID, { body: "b" });

    expect(mockFns.sendNotification).toHaveBeenCalledTimes(1);
    expect(mockFns.fcmSend).toHaveBeenCalledTimes(1);
    expect(calls.fcmDeleteEq).toEqual([]);
  });
});
