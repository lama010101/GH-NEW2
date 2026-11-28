import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FEEDBACK_YEAR_MIN,
  feedbackYearMax,
} from "@/core/eventFeedback";

// UX-BUILD-EVENTFEEDBACK-1128-925: POST /api/event-feedback stores player
// correction CLAIMS only. These tests pin auth, validation, server-side
// current-value capture, upsert semantics, rate limiting, queue semantics,
// and the hard rule that the route never writes public.events.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const FEEDBACK_ID = "33333333-3333-4333-8333-333333333333";

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
  return { json: vi.fn().mockResolvedValue(json) } as any;
}

function createMockRequestWithInvalidJson() {
  return {
    json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
  } as any;
}

const EVENT_ROW = {
  id: EVENT_ID,
  title: "Test Event",
  event_year: 1900,
  description: "Current description",
  display_name: "Current Place",
  image_url: "https://firebasestorage.googleapis.com/example/image.webp",
};

type MockDbOptions = {
  event?: Record<string, unknown> | null;
  feedbackCount?: number;
  feedbackRows?: { id: string }[] | Error;
};

function mockDb({
  event = EVENT_ROW,
  feedbackCount = 0,
  feedbackRows = [{ id: FEEDBACK_ID }],
}: MockDbOptions = {}) {
  mockFns.dbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO public.event_feedback")) {
      if (feedbackRows instanceof Error) throw feedbackRows;
      return { rows: feedbackRows };
    }
    if (sql.includes("FROM public.events")) {
      return { rows: event ? [event] : [] };
    }
    if (sql.includes("COUNT(*)") && sql.includes("public.event_feedback")) {
      return { rows: [{ feedback_count: feedbackCount }] };
    }
    if (sql.includes("INSERT INTO public.event_review_queue")) {
      return { rows: [] };
    }
    return { rows: [] };
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    eventId: EVENT_ID,
    items: [{ field: "title", proposedValue: "Corrected Title" }],
    ...overrides,
  };
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

function callsMatching(fragment: string) {
  return mockFns.dbQuery.mock.calls.filter(([sql]) =>
    String(sql).includes(fragment)
  );
}

function feedbackInsertParams(index = 0) {
  const calls = callsMatching("INSERT INTO public.event_feedback");
  return calls[index]?.[1] as unknown[] | undefined;
}

function queueCalls() {
  return callsMatching("INSERT INTO public.event_review_queue");
}

describe("POST /api/event-feedback validation and auth", () => {
  it("returns 401 and never touches the DB or body when unauthenticated", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient(null)
    );
    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));

    expect(response.status).toBe(401);
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
    const response = await POST(createMockRequest(validBody({ eventId: "bad" })));
    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("rejects an invalid field", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ items: [{ field: "hints", proposedValue: "x" }] }))
    );
    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("rejects empty and duplicate item lists", async () => {
    const POST = await loadRoute();
    for (const items of [
      [],
      [
        { field: "title", proposedValue: "A" },
        { field: "title", proposedValue: "B" },
      ],
    ]) {
      const response = await POST(createMockRequest(validBody({ items })));
      expect(response.status).toBe(400);
    }
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("rejects more than five items", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(
        validBody({
          items: [
            { field: "title", proposedValue: "A" },
            { field: "year", proposedValue: "1800" },
            { field: "location", proposedValue: "B" },
            { field: "description", proposedValue: "C" },
            { field: "image", imageReasons: ["other"] },
            { field: "title", proposedValue: "D" },
          ],
        })
      )
    );
    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("rejects a non-integer year", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ items: [{ field: "year", proposedValue: "1900.5" }] }))
    );
    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("rejects years below FEEDBACK_YEAR_MIN and above the current UTC year", async () => {
    const POST = await loadRoute();
    for (const proposedValue of [
      String(FEEDBACK_YEAR_MIN - 1),
      String(feedbackYearMax() + 1),
    ]) {
      const response = await POST(
        createMockRequest(validBody({ items: [{ field: "year", proposedValue }] }))
      );
      expect(response.status).toBe(400);
    }
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("accepts year zero as a signed integer year", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ items: [{ field: "year", proposedValue: "0" }] }))
    );
    expect(response.status).toBe(201);
    expect(feedbackInsertParams()?.[5]).toBe("0");
  });

  it("rejects image feedback with neither a preset nor a comment", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ items: [{ field: "image" }] }))
    );
    expect(response.status).toBe(400);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });
});

describe("POST /api/event-feedback storage semantics", () => {
  it("returns 404 when the event does not exist", async () => {
    mockDb({ event: null });
    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));
    expect(response.status).toBe(404);
  });

  it("captures current_value server-side and ignores client-supplied trust fields", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(
        validBody({
          reporter_id: OTHER_USER_ID,
          items: [
            {
              field: "title",
              proposedValue: "Corrected Title",
              current_value: "client lie",
              reporter_id: OTHER_USER_ID,
              review_status: "supported",
            },
          ],
        })
      )
    );

    expect(response.status).toBe(201);
    const params = feedbackInsertParams();
    expect(params).toBeDefined();
    expect(params?.[0]).toBe(EVENT_ID);
    expect(params?.[1]).toBe(USER_ID);
    expect(params?.[2]).toBe(false);
    expect(params?.[3]).toBe("title");
    expect(params?.[4]).toBe("Test Event");
    expect(params?.[5]).toBe("Corrected Title");
  });

  it("sets reporter_is_anonymous=true for a guest user", async () => {
    mockFns.createAuthenticatedServerClient.mockReturnValue(
      createSupabaseClient({ id: USER_ID, is_anonymous: true })
    );
    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));
    expect(response.status).toBe(201);
    expect(feedbackInsertParams()?.[2]).toBe(true);
  });

  it("rejects an edit equal to the current server-side value with 400 and writes nothing", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ items: [{ field: "title", proposedValue: " Test Event " }] }))
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid" });
    expect(callsMatching("INSERT INTO public.event_feedback")).toHaveLength(0);
    expect(queueCalls()).toHaveLength(0);
  });

  it("rejects a year equal to the current server-side year", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(validBody({ items: [{ field: "year", proposedValue: "1900" }] }))
    );
    expect(response.status).toBe(400);
    expect(callsMatching("INSERT INTO public.event_feedback")).toHaveLength(0);
  });

  it("rate-limits when 30 rows exist and one item is submitted", async () => {
    mockDb({ feedbackCount: 30 });
    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(callsMatching("INSERT INTO public.event_feedback")).toHaveLength(0);
  });

  it("uses upsert-on-conflict so resubmission updates rather than duplicates", async () => {
    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));
    expect(response.status).toBe(201);
    const [sql] = callsMatching("INSERT INTO public.event_feedback")[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (event_id, reporter_id, field)");
    expect(sql).toContain("WHERE reporter_id IS NOT NULL");
    expect(sql).toContain("DO UPDATE SET");
    expect(sql).toContain("updated_at = now()");
  });

  it("returns only per-item outcomes on success", async () => {
    const POST = await loadRoute();
    const response = await POST(createMockRequest(validBody()));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ok: true,
      items: [{ field: "title", status: "accepted" }],
    });
  });
});

describe("POST /api/event-feedback review queue semantics", () => {
  it("upserts the queue once for text items with GREATEST(existing, 12) priority", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(
        validBody({
          items: [
            { field: "title", proposedValue: "Corrected Title" },
            { field: "description", proposedValue: "Corrected description" },
          ],
        })
      )
    );
    expect(response.status).toBe(201);
    expect(queueCalls()).toHaveLength(1);
    const [sql, params] = queueCalls()[0] as [string, unknown[]];
    expect(params).toEqual([EVENT_ID]);
    expect(sql).toContain("priority = GREATEST(event_review_queue.priority, 12)");
  });

  it("reopens a done row and clears claim fields", async () => {
    const POST = await loadRoute();
    await POST(createMockRequest(validBody()));
    const [sql] = queueCalls()[0] as [string, unknown[]];
    expect(sql).toContain("done_at = NULL");
    expect(sql).toContain("event_review_queue.done_at IS NOT NULL");
    expect(sql).toContain("THEN NULL");
  });

  it("preserves the lease fields of an actively leased not-done row", async () => {
    const POST = await loadRoute();
    await POST(createMockRequest(validBody()));
    const [sql] = queueCalls()[0] as [string, unknown[]];
    expect(sql).toContain("event_review_queue.lease_until < now()");
    expect(sql).toContain("ELSE event_review_queue.claimed_by");
    expect(sql).toContain("ELSE event_review_queue.claimed_at");
    expect(sql).toContain("ELSE event_review_queue.lease_until");
  });

  it("does not touch the queue for an image-only submission", async () => {
    const POST = await loadRoute();
    const response = await POST(
      createMockRequest(
        validBody({ items: [{ field: "image", imageReasons: ["anachronism"] }] })
      )
    );
    expect(response.status).toBe(201);
    expect(callsMatching("INSERT INTO public.event_feedback")).toHaveLength(1);
    expect(queueCalls()).toHaveLength(0);
  });
});

describe("POST /api/event-feedback events-table write prohibition", () => {
  function hasEventsWrite(source: string): boolean {
    return /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?events\b/i.test(source);
  }

  it("detects the deliberately violating fixture", () => {
    expect(hasEventsWrite("UPDATE public.events SET title = 'x'")).toBe(true);
    expect(hasEventsWrite("INSERT INTO events(id) VALUES ('x')")).toBe(true);
    expect(hasEventsWrite("DELETE FROM public.events WHERE id = 'x'")).toBe(true);
  });

  it("route source contains no INSERT, UPDATE, or DELETE against public.events", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf-8");
    expect(hasEventsWrite(source)).toBe(false);
  });
});
