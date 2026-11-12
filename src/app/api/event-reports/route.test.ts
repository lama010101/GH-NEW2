import { describe, it, expect, vi, beforeEach } from "vitest";

// EVT-BUILD-REPORTAPI-1112-108: POST /api/event-reports must 401 before any
// DB call or body parsing, allow guests (reporter_is_anonymous=true), validate
// eventId/reason/details, 404 unknown events, soft-rate-limit at 10 reports
// per 24h, dedupe open reports via ON CONFLICT, and never leak DB errors.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";

const mockFns = vi.hoisted(() => ({
  createAuthenticatedServerClient: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock("@/core/supabaseServer", () => ({
  createAuthenticatedServerClient: mockFns.createAuthenticatedServerClient,
}));

vi.mock("@/server/db", () => ({
  dbPool: { query: mockFns.dbQuery },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

function createSupabaseClient(
  user: { id: string; is_anonymous?: boolean } | null
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("Unauthorized"),
      }),
    },
  };
}

function createMockRequest(json: unknown) {
  return {
    json: vi.fn().mockResolvedValue(json),
  } as any;
}

function createMockRequestWithInvalidJson() {
  return {
    json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
  } as any;
}

const EVENT_ROW = {
  id: EVENT_ID,
  title: "Test Event",
  event_year: 1969,
  status: "validated",
  retired_at: null,
};

type MockDbOptions = {
  event?: Record<string, unknown> | null;
  reportCount?: number;
  insertRows?: { id: string }[] | Error;
};

function mockDb({
  event = EVENT_ROW,
  reportCount = 0,
  insertRows = [{ id: REPORT_ID }],
}: MockDbOptions = {}) {
  mockFns.dbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM public.events")) {
      return { rows: event ? [event] : [] };
    }
    if (sql.includes("COUNT(*)")) {
      return { rows: [{ report_count: reportCount }] };
    }
    if (sql.includes("INSERT INTO public.event_reports")) {
      if (insertRows instanceof Error) throw insertRows;
      return { rows: insertRows };
    }
    return { rows: [] };
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { eventId: EVENT_ID, reason: "wrong_year", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFns.createAuthenticatedServerClient.mockReturnValue(
    createSupabaseClient({ id: USER_ID, is_anonymous: false })
  );
  mockDb();
});

async function loadRoute() {
  const mod = await import("./route");
  return mod.POST;
}

function insertCallParams() {
  const call = mockFns.dbQuery.mock.calls.find(([sql]) =>
    String(sql).includes("INSERT INTO public.event_reports")
  );
  return call?.[1] as unknown[] | undefined;
}

describe("POST /api/event-reports", () => {
  it("returns 401 and never touches the DB or body when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient(null)
    );

    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const POST = await loadRoute();
    const response = await POST(createMockRequestWithInvalidJson());

    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("returns 400 when eventId is not a UUID", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ eventId: "not-a-uuid" }))
    );

    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("returns 400 when reason is not in the enum", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ reason: "bogus_reason" }))
    );

    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("returns 400 when details exceeds 1000 characters", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ details: "x".repeat(1001) }))
    );

    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("returns 404 when the event does not exist", async () => {
    mockDb({ event: null });

    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));

    expect(response.status).toBe(404);
    expect(mockFns.dbQuery).toHaveBeenCalledTimes(1);
  });

  it("returns 429 rate_limited at 10 reports in 24h", async () => {
    mockDb({ reportCount: 10 });

    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(insertCallParams()).toBeUndefined();
  });

  it("returns 200 deduped when ON CONFLICT swallows the insert", async () => {
    mockDb({ insertRows: [] });

    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deduped: true });
  });

  it("returns 201 and takes reporter_id from the session, ignoring body reporter_id", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ reporter_id: OTHER_USER_ID }))
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, id: REPORT_ID });

    const params = insertCallParams();
    expect(params).toBeDefined();
    expect(params?.[0]).toBe(EVENT_ID);
    expect(params?.[1]).toBe(USER_ID);
    expect(params?.[2]).toBe(false);
    expect(params?.[3]).toBe("wrong_year");
  });

  it("sets reporter_is_anonymous=true for a guest user", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: USER_ID, is_anonymous: true })
    );

    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));

    expect(response.status).toBe(201);
    const params = insertCallParams();
    expect(params?.[1]).toBe(USER_ID);
    expect(params?.[2]).toBe(true);
  });

  it("returns the generic 500 message when the DB fails", async () => {
    mockDb({ insertRows: new Error("relation event_reports does not exist") });

    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to save report" });
  });
});
