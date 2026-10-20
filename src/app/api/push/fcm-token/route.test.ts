import { describe, it, expect, beforeEach, vi } from "vitest";

const USER_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const TOKEN = "fcm-device-token-0123456789abcdef";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  jsonCalls: [] as Array<{ body: unknown; status: number }>,
  responseCalls: [] as Array<{ body: unknown; status: number }>,
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
  createSupabaseServerClient: mockFns.createSupabaseServerClient,
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    status: number;
    body: unknown;
    constructor(body?: unknown, init?: { status?: number }) {
      this.body = body ?? null;
      this.status = init?.status ?? 200;
      mockFns.responseCalls.push({ body: this.body, status: this.status });
    }
    static json(body: unknown, init?: { status?: number }) {
      const status = init?.status ?? 200;
      mockFns.jsonCalls.push({ body, status });
      return { status, body };
    }
  }
  return { NextResponse: MockNextResponse };
});

function createMockRequest(json: unknown) {
  return {
    json: vi.fn().mockResolvedValue(json),
  } as any;
}

function authClient(user: { id: string } | null, error?: Error) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: error ?? null,
      }),
    },
  };
}

// Generic chainable for the fcm_tokens table: .delete().eq().neq() records
// every call, .upsert(row, opts) records payload. All terminate in a resolved
// {error:null} promise so await sites behave like PostgREST success.
function createServiceClient() {
  const calls = {
    chain: [] as Array<[string, unknown[]]>,
    upsertRows: [] as Array<Record<string, unknown>>,
    upsertOpts: [] as Array<Record<string, unknown> | undefined>,
    fromTables: [] as string[],
  };

  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["delete", "eq", "neq", "select", "in", "or", "order", "limit"]) {
      b[m] = vi.fn((...args: unknown[]) => {
        calls.chain.push([m, args]);
        return b;
      });
    }
    b.upsert = vi.fn((row: Record<string, unknown>, opts?: Record<string, unknown>) => {
      calls.upsertRows.push(row);
      calls.upsertOpts.push(opts);
      return Promise.resolve({ error: null });
    });
    b.then = (
      onFulfilled?: ((v: unknown) => unknown) | null,
      onRejected?: ((e: unknown) => unknown) | null
    ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
    return b;
  };

  mockFns.createSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) => {
      calls.fromTables.push(table);
      return makeBuilder();
    }),
  });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFns.jsonCalls.length = 0;
  mockFns.responseCalls.length = 0;
});

async function loadRoute() {
  return import("./route");
}

describe("POST /api/push/fcm-token", () => {
  it("returns 401 when there is no session", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(authClient(null));
    const { POST } = await loadRoute();

    const res = await POST(createMockRequest({ token: TOKEN, platform: "android" }));

    expect(res.status).toBe(401);
    expect(mockFns.jsonCalls[0].body).toEqual({ error: "Unauthorized" });
    expect(mockFns.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("upserts on (user_id, token) and refreshes updated_at", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(authClient({ id: USER_ID }));
    const calls = createServiceClient();
    const { POST } = await loadRoute();

    const res = await POST(createMockRequest({ token: TOKEN, platform: "android" }));

    expect(res.status).toBe(200);
    expect(calls.upsertRows).toHaveLength(1);
    expect(calls.upsertRows[0].user_id).toBe(USER_ID);
    expect(calls.upsertRows[0].token).toBe(TOKEN);
    expect(calls.upsertRows[0].updated_at).toBeTypeOf("string");
    expect(calls.upsertOpts[0]).toEqual({ onConflict: "user_id,token", ignoreDuplicates: false });
  });

  it("deletes the same token from other users before upserting", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(authClient({ id: USER_ID }));
    const calls = createServiceClient();
    const { POST } = await loadRoute();

    await POST(createMockRequest({ token: TOKEN, platform: "android" }));

    const deleteIdx = calls.chain.findIndex(([m]) => m === "delete");
    const eqCall = calls.chain.find(
      ([m, args]) => m === "eq" && (args as unknown[])[0] === "token"
    );
    const neqCall = calls.chain.find(([m]) => m === "neq");

    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(eqCall).toBeDefined();
    expect((eqCall as [string, unknown[]])[1][1]).toBe(TOKEN);
    expect(neqCall).toBeDefined();
    expect((neqCall as [string, unknown[]])[1]).toEqual(["user_id", USER_ID]);
  });

  it("rejects invalid tokens and non-android platform", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(authClient({ id: USER_ID }));
    const calls = createServiceClient();
    const { POST } = await loadRoute();

    const tooShort = await POST(createMockRequest({ token: "short", platform: "android" }));
    expect(tooShort.status).toBe(400);

    const wrongPlatform = await POST(createMockRequest({ token: TOKEN, platform: "ios" }));
    expect(wrongPlatform.status).toBe(400);

    expect(calls.upsertRows).toHaveLength(0);
  });
});

describe("DELETE /api/push/fcm-token", () => {
  it("returns 204 and scopes the delete to user_id + token with a session", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(authClient({ id: USER_ID }));
    const calls = createServiceClient();
    const { DELETE } = await loadRoute();

    const res = await DELETE(createMockRequest({ token: TOKEN }));

    expect(res.status).toBe(204);
    const eqCols = calls.chain
      .filter(([m]) => m === "eq")
      .map(([, args]) => (args as unknown[])[0]);
    expect(eqCols).toEqual(["token", "user_id"]);
  });

  it("returns 204 and deletes by token alone without a session", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(authClient(null));
    const calls = createServiceClient();
    const { DELETE } = await loadRoute();

    const res = await DELETE(createMockRequest({ token: TOKEN }));

    expect(res.status).toBe(204);
    const eqCols = calls.chain
      .filter(([m]) => m === "eq")
      .map(([, args]) => (args as unknown[])[0]);
    expect(eqCols).toEqual(["token"]);
  });

  it("returns 204 without touching the DB when no token is given", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(authClient(null));
    const calls = createServiceClient();
    const { DELETE } = await loadRoute();

    const res = await DELETE(createMockRequest({}));

    expect(res.status).toBe(204);
    expect(calls.fromTables).toHaveLength(0);
  });
});
