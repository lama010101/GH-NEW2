import { describe, it, expect } from "vitest";
import { resolveTrustedBaseUrl } from "./trustedOrigin";

// DOMAIN-BUILD-ORIGINALLOWLIST-1116-009 — unit proof for the exact-host
// Origin allowlist used by the realtime worker's detectedBaseUrl path
// (partykit/server.ts onConnect). Substring matching previously let
// attacker-controlled origins (e.g. https://guess-history.com.evil.com)
// steer server-to-server fetches carrying x-partykit-secret.

describe("resolveTrustedBaseUrl — trusted origins", () => {
  it.each([
    "https://digthepast.org",
    "https://www.digthepast.org",
    "https://guess-history.com",
    "https://www.guess-history.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost",
  ])("accepts %s", (origin) => {
    expect(resolveTrustedBaseUrl(origin)).toBe(origin);
  });
});

describe("resolveTrustedBaseUrl — untrusted origins", () => {
  it.each([
    "https://evil.vercel.app",
    "https://guess-history.com.evil.com",
    "https://evilguess-history.com",
    "https://digthepast.org.evil.com",
    "https://evildigthepast.org",
    "http://digthepast.org",
    "https://digthepast.org/path",
    "https://user@digthepast.org",
    "https://localhost.evil.com",
    "https://x.partykit.dev",
    "null",
    "",
    "not a url",
  ])("rejects %s", (origin) => {
    expect(resolveTrustedBaseUrl(origin)).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(resolveTrustedBaseUrl(null)).toBeNull();
    expect(resolveTrustedBaseUrl(undefined)).toBeNull();
  });
});
