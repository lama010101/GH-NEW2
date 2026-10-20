import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resolvePushNotificationUrl } from "./usePushNotifications";

const mocks = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  createChannel: vi.fn(),
  addListener: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  requestPermissions: vi.fn(),
  onAuthStateChange: vi.fn(),
  readSession: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: mocks.checkPermissions,
    createChannel: mocks.createChannel,
    addListener: mocks.addListener,
    register: mocks.register,
    unregister: mocks.unregister,
    requestPermissions: mocks.requestPermissions,
  },
}));

vi.mock("@/core/supabaseBrowser", () => ({
  supabaseBrowser: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      refreshSession: mocks.refreshSession,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  },
  readSession: mocks.readSession,
}));

describe("resolvePushNotificationUrl", () => {
  it("accepts same-app relative paths", () => {
    expect(resolvePushNotificationUrl("/compete/abc")).toBe("/compete/abc");
    expect(resolvePushNotificationUrl("/")).toBe("/");
    expect(resolvePushNotificationUrl("/home?tab=1")).toBe("/home?tab=1");
  });

  it("rejects protocol-relative URLs", () => {
    expect(resolvePushNotificationUrl("//evil.com/x")).toBeNull();
    expect(resolvePushNotificationUrl("///")).toBeNull();
  });

  it("rejects absolute URLs and any scheme", () => {
    expect(resolvePushNotificationUrl("https://evil.com/x")).toBeNull();
    expect(resolvePushNotificationUrl("http://example.com")).toBeNull();
    expect(resolvePushNotificationUrl("javascript:alert(1)")).toBeNull();
    expect(resolvePushNotificationUrl("data:text/html,x")).toBeNull();
  });

  it("rejects non-string and empty input", () => {
    expect(resolvePushNotificationUrl("")).toBeNull();
    expect(resolvePushNotificationUrl(null)).toBeNull();
    expect(resolvePushNotificationUrl(undefined)).toBeNull();
    expect(resolvePushNotificationUrl(123)).toBeNull();
    expect(resolvePushNotificationUrl({})).toBeNull();
  });
});

describe("setupNativePush auth-state handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  async function mountNative(permission: NotificationPermission) {
    vi.resetModules();
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.checkPermissions.mockResolvedValue({ receive: permission });
    mocks.createChannel.mockResolvedValue(undefined);
    mocks.addListener.mockResolvedValue({ remove: vi.fn() });
    mocks.register.mockResolvedValue(undefined);
    mocks.readSession.mockResolvedValue(null);
    let authCallback: ((event: string) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((cb: (event: string) => void) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const { usePushNotifications } = await import("./usePushNotifications");
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    return {
      fireAuthEvent: (event: string) => act(() => authCallback?.(event)),
    };
  }

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls PushNotifications.register once on SIGNED_IN when permission is granted", async () => {
    const { fireAuthEvent } = await mountNative("granted");
    expect(mocks.register).not.toHaveBeenCalled();
    fireAuthEvent("SIGNED_IN");
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it.each(["denied", "default"] as const)(
    "does not register on SIGNED_IN when permission is %s",
    async (permission) => {
      const { fireAuthEvent } = await mountNative(permission);
      fireAuthEvent("SIGNED_IN");
      expect(mocks.register).not.toHaveBeenCalled();
    }
  );

  it("debounces a second SIGNED_IN within 5s and registers again after the window", async () => {
    const { fireAuthEvent } = await mountNative("granted");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    fireAuthEvent("SIGNED_IN");
    expect(mocks.register).toHaveBeenCalledTimes(1);
    nowSpy.mockReturnValue(1_004_999);
    fireAuthEvent("SIGNED_IN");
    expect(mocks.register).toHaveBeenCalledTimes(1);
    nowSpy.mockReturnValue(1_006_000);
    fireAuthEvent("SIGNED_IN");
    expect(mocks.register).toHaveBeenCalledTimes(2);
  });

  it("does not register on TOKEN_REFRESHED or INITIAL_SESSION", async () => {
    const { fireAuthEvent } = await mountNative("granted");
    fireAuthEvent("TOKEN_REFRESHED");
    fireAuthEvent("INITIAL_SESSION");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("keeps SIGNED_OUT deregistration behavior unchanged", async () => {
    const { fireAuthEvent } = await mountNative("granted");
    window.localStorage.setItem("gh_fcm_token", "tok-123");
    fireAuthEvent("SIGNED_OUT");
    expect(window.localStorage.getItem("gh_fcm_token")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/fcm-token",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("performs no supabase call inside the auth callback", async () => {
    const { fireAuthEvent } = await mountNative("granted");
    mocks.readSession.mockClear();
    fireAuthEvent("SIGNED_IN");
    fireAuthEvent("TOKEN_REFRESHED");
    fireAuthEvent("INITIAL_SESSION");
    fireAuthEvent("SIGNED_OUT");
    for (const spy of [
      mocks.readSession,
      mocks.getSession,
      mocks.getUser,
      mocks.refreshSession,
      mocks.signOut,
      mocks.from,
    ]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
