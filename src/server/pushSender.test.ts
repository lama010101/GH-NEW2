import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PUSH_TITLE, PUSH_ICON, PUSH_BADGE } from "@/core/pushBranding";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";

const mockFns = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("web-push", () => ({
  sendNotification: mockFns.sendNotification,
  setVapidDetails: mockFns.setVapidDetails,
  WebPushError: class WebPushError extends Error {
    statusCode?: number;
  },
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
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const k of VAPID_ENV) {
    savedEnv[k] = process.env[k];
  }
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  mockSubs([SUB]);
  mockFns.sendNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const k of VAPID_ENV) {
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
