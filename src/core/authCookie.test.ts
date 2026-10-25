import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// AUTH-FIX-COOKIECLEAR-IDENTITY-1013-004 — unit tests for the shared
// auth-cookie domain constant and the deletion-string helper.
// AUTH_COOKIE_DOMAIN is computed at module load from NODE_ENV, so each case
// stubs it via vi.stubEnv then re-imports after vi.resetModules().

describe("authCookie — AUTH_COOKIE_DOMAIN + authCookieDeletionStrings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns '.guess-history.com' in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { AUTH_COOKIE_DOMAIN } = await import("./authCookie");
    expect(AUTH_COOKIE_DOMAIN).toBe(".guess-history.com");
  });

  it("is undefined outside production (dev/test)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { AUTH_COOKIE_DOMAIN } = await import("./authCookie");
    expect(AUTH_COOKIE_DOMAIN).toBeUndefined();
  });

  it("production: returns host-only AND domain-scoped deletion strings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { authCookieDeletionStrings } = await import("./authCookie");
    expect(authCookieDeletionStrings("sb-abc-auth-token")).toEqual([
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/",
      "sb-abc-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.guess-history.com",
    ]);
  });

  it("dev: returns only the host-only deletion string", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { authCookieDeletionStrings } = await import("./authCookie");
    expect(authCookieDeletionStrings("sb-abc-auth-token")).toEqual([
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
      const strings = authCookieDeletionStrings(name);
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
