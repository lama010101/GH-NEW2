import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock @supabase/ssr so createServerClient returns a controllable client.
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

// Mock partykitAuth so verifyPartyKitSecret returns false by default.
vi.mock("@/server/partykitAuth", () => ({
  verifyPartyKitSecret: vi.fn(() => false),
}));

// Mock next/server to capture redirects and pass-through responses.
// We avoid importing the real NextResponse/NextRequest because they
// require a full Next.js server runtime.
const redirectCalls: { url: string; status: number }[] = [];
const nextCalls: { request?: unknown }[] = [];

vi.mock("next/server", () => {
  const mockCookies = {
    set: vi.fn(),
    getAll: vi.fn(() => []),
  };
  return {
    NextResponse: {
      redirect: vi.fn((url: URL, status?: number) => {
        const entry = { url: url.toString(), status: status ?? 307 };
        redirectCalls.push(entry);
        return {
          status: entry.status,
          headers: { get: (name: string) => (name === "location" ? entry.url : null) },
          cookies: mockCookies,
        };
      }),
      next: vi.fn((opts?: { request?: unknown }) => {
        nextCalls.push(opts ?? {});
        return {
          status: 200,
          headers: { get: () => null },
          cookies: mockCookies,
        };
      }),
    },
    // NextRequest is only used as a type in the middleware signature.
    // We pass a plain object cast to any at call sites.
  };
});

// ── Helpers ────────────────────────────────────────────────────────

function createMockRequest(
  pathname: string,
  options?: {
    searchParams?: Record<string, string>;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  }
) {
  const baseUrl = "https://www.guess-history.com";
  const fullUrl = new URL(baseUrl + pathname);
  if (options?.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      fullUrl.searchParams.set(key, value);
    }
  }
  return {
    url: fullUrl.toString(),
    nextUrl: fullUrl,
    cookies: {
      getAll: () =>
        Object.entries(options?.cookies ?? {}).map(([name, value]) => ({ name, value })),
      get: (name: string) => {
        const v = options?.cookies?.[name];
        return v !== undefined ? { value: v } : undefined;
      },
      set: vi.fn(),
    },
    headers: {
      get: (name: string) => options?.headers?.[name.toLowerCase()] ?? null,
    },
  } as any;
}

async function loadMiddleware() {
  const mod = await import("./middleware");
  return mod.middleware;
}

async function getMockCreateServerClient() {
  const mod = await import("@supabase/ssr");
  return mod.createServerClient as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(async () => {
  vi.resetModules();
  redirectCalls.length = 0;
  nextCalls.length = 0;

  // Set up env vars that middleware reads.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  // Default: getUser returns no user.
  const createServerClient = await getMockCreateServerClient();
  createServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  });
});

// ── Tests ──────────────────────────────────────────────────────────

describe("middleware redirect logic — KC-007", () => {
  describe("authenticated user visiting /login", () => {
    it("redirects to /home when no ?next param", async () => {
      const middleware = await loadMiddleware();
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-1" } },
          }),
        },
      });

      const req = createMockRequest("/login");
      await middleware(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/home");
      expect(redirectCalls[0].status).toBe(302);
    });

    it("redirects to ?next param when next is a valid internal path", async () => {
      const middleware = await loadMiddleware();
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-1" } },
          }),
        },
      });

      const req = createMockRequest("/login", {
        searchParams: { next: "/account" },
      });
      await middleware(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/account");
    });

    it("redirects to /home when ?next is '/' (root)", async () => {
      const middleware = await loadMiddleware();
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-1" } },
          }),
        },
      });

      const req = createMockRequest("/login", {
        searchParams: { next: "/" },
      });
      await middleware(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/home");
    });

    it("redirects to /home when ?next is an external URL (open redirect prevention)", async () => {
      const middleware = await loadMiddleware();
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-1" } },
          }),
        },
      });

      const req = createMockRequest("/login", {
        searchParams: { next: "https://evil.com" },
      });
      await middleware(req);

      expect(redirectCalls).toHaveLength(1);
      // The middleware checks startsWith("/") — "https://evil.com" does not
      // start with "/", so it falls back to "/home".
      expect(redirectCalls[0].url).toContain("/home");
    });
  });

  describe("authenticated user visiting / (landing page)", () => {
    it("redirects to /home", async () => {
      const middleware = await loadMiddleware();
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-1" } },
          }),
        },
      });

      const req = createMockRequest("/");
      await middleware(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/home");
      expect(redirectCalls[0].status).toBe(307);
    });
  });

  describe("unauthenticated user visiting protected route", () => {
    it("redirects to /login with ?next param preserving the original path", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/home");
      await middleware(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/login");
      expect(redirectCalls[0].url).toContain("next=%2Fhome");
    });

    it("redirects to /login when visiting /account", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/account");
      await middleware(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/login");
      expect(redirectCalls[0].url).toContain("next=%2Faccount");
    });
  });

  describe("unauthenticated user visiting public paths", () => {
    it("passes through /login without redirect", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/login");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
      expect(nextCalls).toHaveLength(1);
    });

    it("passes through /help without redirect", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/help");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
      expect(nextCalls).toHaveLength(1);
    });

    it("passes through /auth/callback without redirect", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/auth/callback");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
      expect(nextCalls).toHaveLength(1);
    });

    it("passes through /api/events without redirect", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/api/events");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
      expect(nextCalls).toHaveLength(1);
    });

    it("passes through static assets (.png, .css, etc.)", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/images/logo.png");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
    });

    it("passes through _next/ paths", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/_next/static/chunk.js");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
    });
  });

  describe("authenticated user visiting protected route", () => {
    it("passes through /home without redirect", async () => {
      const middleware = await loadMiddleware();
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-1" } },
          }),
        },
      });

      const req = createMockRequest("/home");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
      expect(nextCalls).toHaveLength(1);
    });

    it("passes through /account without redirect", async () => {
      const middleware = await loadMiddleware();
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-1" } },
          }),
        },
      });

      const req = createMockRequest("/account");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
    });
  });

  describe("root path public landing", () => {
    it("passes through / for an unauthenticated visitor", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/");
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
    });

    it("passes through / even with a stale admin query param", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/", {
        searchParams: { admin: "any-token" },
      });
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
    });

    it("passes through / even with a stale gh_admin_bypass cookie", async () => {
      const middleware = await loadMiddleware();

      const req = createMockRequest("/", {
        cookies: { gh_admin_bypass: "1" },
      });
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
    });
  });

  describe("PartyKit secret bypass", () => {
    it("passes through when valid x-partykit-secret header is present", async () => {
      const { verifyPartyKitSecret } = await import("@/server/partykitAuth");
      (verifyPartyKitSecret as any).mockReturnValue(true);

      const middleware = await loadMiddleware();
      const req = createMockRequest("/api/compete/update", {
        headers: { "x-partykit-secret": "valid-secret" },
      });
      await middleware(req);

      expect(redirectCalls).toHaveLength(0);
    });
  });
});
