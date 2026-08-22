import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RELAX_PWA_INTERSTITIAL_SKIPPED_KEY,
  isIOsSafariNonPwa,
  shouldShowRelaxPwaInterstitial,
  markRelaxPwaInterstitialSkipped,
} from "@/core/relaxPwaInterstitial";

// Helper: override navigator properties (jsdom Navigator is read-only).
function setNav(props: {
  userAgent?: string;
  platform?: string;
  standalone?: boolean;
  maxTouchPoints?: number;
}) {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (props.userAgent !== undefined) {
    Object.defineProperty(nav, "userAgent", { value: props.userAgent, configurable: true });
  }
  if (props.platform !== undefined) {
    Object.defineProperty(nav, "platform", { value: props.platform, configurable: true });
  }
  if (props.standalone !== undefined) {
    Object.defineProperty(nav, "standalone", { value: props.standalone, configurable: true });
  }
  if (props.maxTouchPoints !== undefined) {
    Object.defineProperty(nav, "maxTouchPoints", { value: props.maxTouchPoints, configurable: true });
  }
}

const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

afterEach(() => {
  // Reset to a benign default so tests don't leak.
  setNav({ userAgent: "", platform: "", standalone: undefined, maxTouchPoints: 0 });
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("relaxPwaInterstitial detection matrix", () => {
  it("(1) iOS Safari non-PWA → interstitial shows (host + invitee path use same fn)", () => {
    setNav({ userAgent: IOS_SAFARI_UA, platform: "iPhone", standalone: false });
    expect(isIOsSafariNonPwa()).toBe(true);
    expect(shouldShowRelaxPwaInterstitial()).toBe(true);
  });

  it("(2a) Android Chrome → does NOT show", () => {
    setNav({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      standalone: false,
    });
    expect(isIOsSafariNonPwa()).toBe(false);
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
  });

  it("(2b) Desktop Safari (macOS) → does NOT show", () => {
    setNav({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      standalone: false,
      maxTouchPoints: 0,
    });
    expect(isIOsSafariNonPwa()).toBe(false);
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
  });

  it("(2c) Chrome on iOS (CriOS) → does NOT show", () => {
    setNav({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      standalone: false,
    });
    expect(isIOsSafariNonPwa()).toBe(false);
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
  });

  it("(3a) iOS Safari installed as PWA (standalone=true) → does NOT show, even with skip flag unset", () => {
    setNav({ userAgent: IOS_SAFARI_UA, platform: "iPhone", standalone: true });
    expect(isIOsSafariNonPwa()).toBe(false);
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
  });

  it("(3b) iOS Safari non-PWA but skip flag set → does NOT show", () => {
    setNav({ userAgent: IOS_SAFARI_UA, platform: "iPhone", standalone: false });
    localStorage.setItem(RELAX_PWA_INTERSTITIAL_SKIPPED_KEY, "1");
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
  });

  it("(4) skip flag persists and suppresses across both flows (same device)", () => {
    // Simulate host flow skip on iOS Safari non-PWA.
    setNav({ userAgent: IOS_SAFARI_UA, platform: "iPhone", standalone: false });
    expect(shouldShowRelaxPwaInterstitial()).toBe(true); // before skip
    markRelaxPwaInterstitialSkipped();
    // Same device/browser now attempts invitee flow → suppressed by the same flag.
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
    expect(localStorage.getItem(RELAX_PWA_INTERSTITIAL_SKIPPED_KEY)).toBe("1");
  });

  it("(5) installed check takes priority over skip flag (install later clears interstitial)", () => {
    setNav({ userAgent: IOS_SAFARI_UA, platform: "iPhone", standalone: false });
    markRelaxPwaInterstitialSkipped();
    // User later installs as PWA → standalone becomes true.
    setNav({ userAgent: IOS_SAFARI_UA, platform: "iPhone", standalone: true });
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
  });

  it("(6) localStorage unavailable → does not block user (returns false)", () => {
    setNav({ userAgent: IOS_SAFARI_UA, platform: "iPhone", standalone: false });
    const getter = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(shouldShowRelaxPwaInterstitial()).toBe(false);
    expect(getter).toHaveBeenCalled();
  });
});
