// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * UX-BUILD-CONSENTGATE-1125-893 — GA4 consent gate guard.
 * Proves Analytics renders no <Script>/gtag/dataLayer/googletagmanager
 * unless consent is 'granted', and that consent.ts defaults to 'unknown'.
 */

const consentState = { current: "unknown" as string };

vi.mock("@/core/consent", () => ({
  useConsentState: () => consentState.current,
  useConsentBannerVisible: () => true,
  writeConsent: vi.fn(),
  requestConsentReopen: vi.fn(),
  subscribeConsent: () => () => {},
  readConsent: () => "unknown",
  getConsentSnapshot: () => "unknown",
  getConsentBannerSnapshot: () => true,
  CONSENT_STORAGE_KEY: "gh_analytics_consent_v1",
  CONSENT_MAX_AGE_MS: 183 * 24 * 60 * 60 * 1000,
}));

// Render next/script as a plain <script> so assertions see the tags.
vi.mock("next/script", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { id, src, children, strategy, ...rest } = props as {
      id?: string;
      src?: string;
      children?: React.ReactNode;
      strategy?: string;
    };
    return React.createElement(
      "script",
      { id, src, "data-strategy": strategy, ...rest },
      typeof children === "string" ? children : undefined
    );
  },
}));

import { Analytics } from "@/components/Analytics";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const analyticsSrc = readFileSync(
  resolve(PROJECT_ROOT, "src/components/Analytics.tsx"),
  "utf-8"
);
const consentSrc = readFileSync(
  resolve(PROJECT_ROOT, "src/core/consent.ts"),
  "utf-8"
);

beforeEach(() => {
  consentState.current = "unknown";
  localStorage.clear();
});

describe("analytics consent gate (UX-BUILD-CONSENTGATE-1125-893)", () => {
  it("renders no <Script>, gtag, dataLayer or googletagmanager when consent is 'unknown'", () => {
    consentState.current = "unknown";
    const { container } = render(React.createElement(Analytics));
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("googletagmanager");
    expect(container.innerHTML).not.toContain("dataLayer");
    expect(container.innerHTML).not.toContain("gtag");
  });

  it("renders no <Script> when consent is 'denied'", () => {
    consentState.current = "denied";
    const { container } = render(React.createElement(Analytics));
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("googletagmanager");
  });

  it("renders the GA scripts only when consent is 'granted'", () => {
    consentState.current = "granted";
    const { container } = render(React.createElement(Analytics));
    const html = container.innerHTML;
    expect(html).toContain("googletagmanager.com/gtag/js");
    expect(html).toContain("G-DQKZDDHBZL");
  });

  it("consent.ts defaults to 'unknown' (source + real module)", async () => {
    expect(consentSrc).toContain("'unknown'");
    const actual =
      await vi.importActual<typeof import("@/core/consent")>(
        "@/core/consent"
      );
    expect(actual.readConsent()).toBe("unknown");
  });

  it("Analytics.tsx gates rendering on the consent state", () => {
    expect(analyticsSrc).toContain("useConsentState");
    expect(analyticsSrc).toContain("consent !== 'granted'");
  });
});
