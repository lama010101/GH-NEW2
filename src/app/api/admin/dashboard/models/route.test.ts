import { describe, it, expect, vi, beforeEach } from "vitest";

// EDQ-SEC-EVENTSLEAK-1123-822: GET /api/admin/dashboard/models must run
// requireAdmin() as its first awaited call and return 401 Unauthorized
// before calling OpenRouter when there is no session.

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  fetchOpenRouterModels: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/openrouter", () => ({
  fetchOpenRouterModels: mockFns.fetchOpenRouterModels,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

function createSupabaseClient(session: unknown) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
    },
    from: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFns.createAuthenticatedServerClient.mockReturnValue(
    createSupabaseClient(null)
  );
});

async function loadRoute() {
  const mod = await import("./route");
  return mod.GET;
}

describe("GET /api/admin/dashboard/models", () => {
  it("returns 401 and never calls OpenRouter when unauthenticated", async () => {
    const GET = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockFns.fetchOpenRouterModels).not.toHaveBeenCalled();
  });
});
