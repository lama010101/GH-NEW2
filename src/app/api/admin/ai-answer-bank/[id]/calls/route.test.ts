import { describe, it, expect, vi, beforeEach } from "vitest";

// EDQ-SEC-EVENTSLEAK-1123-822: GET /api/admin/ai-answer-bank/[id]/calls must
// run requireAdmin() as its first awaited call and return 401 Unauthorized
// before touching the DB when there is no session.

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/db", () => ({
  getDbPool: vi.fn(() => ({ query: mockFns.dbQuery })),
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

describe("GET /api/admin/ai-answer-bank/[id]/calls", () => {
  it("returns 401 and never queries the DB when unauthenticated", async () => {
    const GET = await loadRoute();
    const response = await GET({} as any, {
      params: { id: "22222222-2222-4222-8222-222222222222" },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });
});
