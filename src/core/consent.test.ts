// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  readConsent,
  writeConsent,
  CONSENT_STORAGE_KEY,
  CONSENT_MAX_AGE_MS,
} from "./consent";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consent store (UX-BUILD-CONSENTGATE-1125-893)", () => {
  it("defaults to 'unknown' when nothing is stored", () => {
    expect(readConsent()).toBe("unknown");
  });

  it("grant persists 'granted' with a timestamp", () => {
    writeConsent("granted");
    expect(readConsent()).toBe("granted");
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state).toBe("granted");
    expect(typeof parsed.ts).toBe("number");
  });

  it("deny persists 'denied'", () => {
    writeConsent("denied");
    expect(readConsent()).toBe("denied");
  });

  it("treats a choice older than ~6 months as 'unknown' (asks again)", () => {
    const stale = Date.now() - CONSENT_MAX_AGE_MS - 24 * 60 * 60 * 1000;
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, state: "granted", ts: stale })
    );
    expect(readConsent()).toBe("unknown");
  });

  it("keeps a fresh choice", () => {
    const fresh = Date.now() - 24 * 60 * 60 * 1000; // 1 day old
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, state: "denied", ts: fresh })
    );
    expect(readConsent()).toBe("denied");
  });

  it("returns 'unknown' and never throws when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(readConsent()).toBe("unknown");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeConsent("granted")).not.toThrow();
  });

  it("returns 'unknown' for malformed stored values", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, "{not json");
    expect(readConsent()).toBe("unknown");
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, state: "maybe", ts: Date.now() })
    );
    expect(readConsent()).toBe("unknown");
  });
});
