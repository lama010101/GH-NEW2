import { describe, it, expect, vi } from "vitest";
import { resolvePushNotificationUrl } from "./usePushNotifications";

vi.mock("@/core/supabaseBrowser", () => ({
  supabaseBrowser: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  readSession: vi.fn(async () => null),
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
