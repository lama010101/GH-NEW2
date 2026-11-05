import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => {
  const make = () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  };
  return { useTranslations: () => make() };
});

import GetAppCard, { GET_APP_CARD_DISMISSED_KEY } from "./GetAppCard";
import { ANDROID_APK_URL } from "@/core/appLinks";

const UA = {
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
};

function setEnv(ua: string, opts: { standalone?: boolean | undefined; displayStandalone?: boolean; capacitor?: boolean } = {}) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "platform", { value: ua.includes("iPhone") ? "iPhone" : "Win32", configurable: true });
  Object.defineProperty(window.navigator, "standalone", {
    value: opts.standalone === undefined ? (ua.includes("iPhone") ? false : undefined) : opts.standalone,
    configurable: true,
  });
  window.matchMedia = ((q: string) => ({
    matches: !!opts.displayStandalone && q.includes("standalone"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (window as unknown as { Capacitor?: unknown }).Capacitor = opts.capacitor
    ? { isNativePlatform: () => true }
    : undefined;
}

afterEach(() => {
  cleanup();
  try { localStorage.clear(); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

describe("GetAppCard — UX-BUILD-GETAPPCARD-REMOVEFULLSCREEN-1101-023", () => {
  it("renders nothing on desktop", () => {
    setEnv(UA.desktop);
    render(<GetAppCard />);
    expect(screen.queryByTestId("get-app-card")).toBeNull();
  });

  it("Android browser shows the APK link", async () => {
    setEnv(UA.android);
    render(<GetAppCard />);
    const link = (await screen.findByText("android_apk_button")).closest("a");
    expect(link?.getAttribute("href")).toBe(ANDROID_APK_URL);
  });

  it("Android inside Capacitor renders nothing", () => {
    setEnv(UA.android, { capacitor: true });
    render(<GetAppCard />);
    expect(screen.queryByTestId("get-app-card")).toBeNull();
  });

  it("Android standalone (display-mode) renders nothing", () => {
    setEnv(UA.android, { displayStandalone: true });
    render(<GetAppCard />);
    expect(screen.queryByTestId("get-app-card")).toBeNull();
  });

  it("iOS Safari non-PWA shows Add to Home Screen steps, no APK link", async () => {
    setEnv(UA.iphone);
    render(<GetAppCard />);
    const card = await screen.findByTestId("get-app-card");
    expect(card.getAttribute("data-platform")).toBe("ios");
    expect(screen.getByText("ios_intro")).toBeTruthy();
    expect(screen.getByText("pwa_step_home")).toBeTruthy();
    expect(card.querySelector("a")).toBeNull();
  });

  it("iOS installed (navigator.standalone) renders nothing", () => {
    setEnv(UA.iphone, { standalone: true });
    render(<GetAppCard />);
    expect(screen.queryByTestId("get-app-card")).toBeNull();
  });

  it("suppress prop hides the card", () => {
    setEnv(UA.android);
    render(<GetAppCard suppress />);
    expect(screen.queryByTestId("get-app-card")).toBeNull();
  });

  it("dismiss hides the card and persists to localStorage", async () => {
    setEnv(UA.android);
    const { unmount } = render(<GetAppCard />);
    fireEvent.click(await screen.findByLabelText("close"));
    expect(screen.queryByTestId("get-app-card")).toBeNull();
    expect(localStorage.getItem(GET_APP_CARD_DISMISSED_KEY)).toBe("1");
    unmount();
    render(<GetAppCard />);
    await waitFor(() => expect(screen.queryByTestId("get-app-card")).toBeNull());
  });

  it("still renders and dismisses when localStorage throws", async () => {
    setEnv(UA.android);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    render(<GetAppCard />);
    fireEvent.click(await screen.findByLabelText("close"));
    expect(screen.queryByTestId("get-app-card")).toBeNull();
  });
});
