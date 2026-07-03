import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock @supabase/ssr so createServerClient returns a controllable client.
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: vi.fn(),
    },
  })),
}));

// Mock next/headers cookies() to return a mock cookie store.
const mockCookieStore = {
  getAll: vi.fn(() => []),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

// Mock next/server to capture redirects.
const redirectCalls: { url: string; status: number }[] = [];
vi.mock("next/server", () => {
  const mockCookies = {
    set: vi.fn(),
  };
  return {
    NextResponse: {
      redirect: vi.fn((url: URL) => {
        const entry = { url: url.toString(), status: 307 };
        redirectCalls.push(entry);
        return {
          status: entry.status,
          headers: { get: (name: string) => (name === "location" ? entry.url : null) },
          cookies: mockCookies,
        };
      }),
      next: vi.fn(() => ({
        status: 200,
        headers: { get: () => null },
        cookies: mockCookies,
      })),
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────

function createMockRequest(
  pathname: string,
  searchParams?: Record<string, string>
) {
  const baseUrl = "https://www.guess-history.com";
  const fullUrl = new URL(baseUrl + pathname);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      fullUrl.searchParams.set(key, value);
    }
  }
  return {
    url: fullUrl.toString(),
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  } as any;
}

async function loadCallbackRoute() {
  const mod = await import("./route");
  return mod.GET;
}

async function getMockCreateServerClient() {
  const mod = await import("@supabase/ssr");
  return mod.createServerClient as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(async () => {
  vi.resetModules();
  redirectCalls.length = 0;
  mockCookieStore.getAll.mockReturnValue([]);

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  // Default: exchangeCodeForSession succeeds.
  const createServerClient = await getMockCreateServerClient();
  createServerClient.mockReturnValue({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    },
  });
});

// ── Tests ──────────────────────────────────────────────────────────

describe("OAuth callback route guards — KC-007", () => {
  describe("missing code parameter", () => {
    it("redirects to /login?error=missing_code when code is absent", async () => {
      const GET = await loadCallbackRoute();
      const req = createMockRequest("/auth/callback");
      await GET(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/login");
      expect(redirectCalls[0].url).toContain("error=missing_code");
    });

    it("redirects to /login?error=missing_code when code is empty string", async () => {
      const GET = await loadCallbackRoute();
      const req = createMockRequest("/auth/callback", {
        code: "",
      });
      await GET(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("error=missing_code");
    });
  });

  describe("valid code (PKCE flow — no state param needed)", () => {
    it("calls exchangeCodeForSession and redirects to next param", async () => {
      const GET = await loadCallbackRoute();
      const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: { exchangeCodeForSession },
      });

      const req = createMockRequest("/auth/callback", {
        code: "valid-code",
        next: "/home",
      });
      await GET(req);

      expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("/home");
    });

    it("redirects to / when no next param is provided", async () => {
      const GET = await loadCallbackRoute();
      const req = createMockRequest("/auth/callback", {
        code: "valid-code",
      });
      await GET(req);

      expect(redirectCalls).toHaveLength(1);
      // The default next is "/" — the redirect URL should end with "/".
      expect(redirectCalls[0].url).toMatch(/\/$/);
    });
  });

  describe("exchangeCodeForSession error", () => {
    it("redirects to /?error=auth_failed when exchange fails", async () => {
      const GET = await loadCallbackRoute();
      const exchangeCodeForSession = vi.fn().mockResolvedValue({
        error: { message: "Invalid grant" },
      });
      const createServerClient = await getMockCreateServerClient();
      createServerClient.mockReturnValue({
        auth: { exchangeCodeForSession },
      });

      const req = createMockRequest("/auth/callback", {
        code: "bad-code",
      });
      await GET(req);

      expect(redirectCalls).toHaveLength(1);
      expect(redirectCalls[0].url).toContain("error=auth_failed");
    });
  });
});
