import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// DOMAIN-MIGRATE-DIGTHEPAST-1114-001 — unit tests for the host-derived
// auth-cookie domain helper and the deletion-string helper.
// authCookieDomainForHost() reads NODE_ENV at call time, so each case stubs
// it via vi.stubEnv; the dynamic import keeps module state isolated.

describe("authCookie — authCookieDomainForHost + authCookieDeletionStrings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns '.digthepast.org' for digthepast.org and www.digthepast.org in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDomainForHost } = await import("./authCookie");
    expect(authCookieDomainForHost("digthepast.org")).toBe(".digthepast.org");
    expect(authCookieDomainForHost("www.digthepast.org")).toBe(".digthepast.org");
  });

  it("returns '.guess-history.com' for guess-history.com and www.guess-history.com in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDomainForHost } = await import("./authCookie");
    expect(authCookieDomainForHost("guess-history.com")).toBe(".guess-history.com");
    expect(authCookieDomainForHost("www.guess-history.com")).toBe(".guess-history.com");
  });

  it("returns undefined for a *.vercel.app preview host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDomainForHost } = await import("./authCookie");
    expect(
      authCookieDomainForHost("gh-new2-git-main-lolos-projects-dc7e07be.vercel.app")
    ).toBeUndefined();
  });

  it("returns undefined for localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDomainForHost } = await import("./authCookie");
    expect(authCookieDomainForHost("localhost")).toBeUndefined();
    expect(authCookieDomainForHost("localhost:3000")).toBeUndefined();
  });

  it("returns undefined for lookalike hosts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDomainForHost } = await import("./authCookie");
    expect(authCookieDomainForHost("evil-digthepast.org")).toBeUndefined();
    expect(authCookieDomainForHost("digthepast.org.evil.com")).toBeUndefined();
    expect(authCookieDomainForHost("evil-guess-history.com")).toBeUndefined();
    expect(authCookieDomainForHost("guess-history.com.evil.com")).toBeUndefined();
  });

  it("strips a :port suffix and lowercases before matching", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDomainForHost } = await import("./authCookie");
    expect(authCookieDomainForHost("www.digthepast.org:443")).toBe(".digthepast.org");
    expect(authCookieDomainForHost("WWW.GUESS-HISTORY.COM:8443")).toBe(".guess-history.com");
  });

  it("returns undefined for a missing host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDomainForHost } = await import("./authCookie");
    expect(authCookieDomainForHost(undefined)).toBeUndefined();
    expect(authCookieDomainForHost(null)).toBeUndefined();
    expect(authCookieDomainForHost("")).toBeUndefined();
  });

  it("returns undefined outside production for every host", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { authCookieDomainForHost } = await import("./authCookie");
    for (const host of [
      "digthepast.org",
      "www.digthepast.org",
      "guess-history.com",
      "www.guess-history.com",
      "localhost",
    ]) {
      expect(authCookieDomainForHost(host)).toBeUndefined();
    }
  });

  it("production digthepast.org host: deletion strings carry domain=.digthepast.org", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDeletionStrings } = await import("./authCookie");
    expect(authCookieDeletionStrings("sb-abc-auth-token", "www.digthepast.org")).toEqual([
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.digthepast.org",
    ]);
  });

  it("production guess-history.com host: deletion strings carry domain=.guess-history.com", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDeletionStrings } = await import("./authCookie");
    expect(authCookieDeletionStrings("sb-abc-auth-token", "www.guess-history.com")).toEqual([
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.guess-history.com",
    ]);
  });

  it("production unmatched host: deletion strings are host-only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDeletionStrings } = await import("./authCookie");
    for (const host of ["localhost", "preview-123.vercel.app", "evil-digthepast.org"]) {
      expect(authCookieDeletionStrings("sb-abc-auth-token", host)).toEqual([
        "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
      ]);
    }
  });

  it("dev: returns only the host-only deletion string regardless of host", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { authCookieDeletionStrings } = await import("./authCookie");
    expect(authCookieDeletionStrings("sb-abc-auth-token", "www.digthepast.org")).toEqual([
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
    ]);
    expect(authCookieDeletionStrings("sb-abc-auth-token", "www.guess-history.com")).toEqual([
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
    ]);
  });

  it("handles chunked cookie names (.0/.1) and the PKCE verifier name", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDeletionStrings } = await import("./authCookie");
    for (const name of [
      "sb-gzvixlvkwjsrtmtybtkf-auth-token.0",
      "sb-gzvixlvkwjsrtmtybtkf-auth-token.1",
      "sb-gzvixlvkwjsrtmtybtkf-auth-token-code-verifier",
    ]) {
      const strings = authCookieDeletionStrings(name, "www.guess-history.com");
      expect(strings).toHaveLength(2);
      expect(strings[0]).toBe(
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      );
      expect(strings[1]).toBe(
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.guess-history.com`
      );
    }
  });
});
