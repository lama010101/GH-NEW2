import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// EDQ-BUILD-ADMINGEN-1122-815 — route contract tests. requireAdmin,
// the pg pool, the Runware adapter and the storage sink are mocked; the
// real lib.ts pipeline + registry run end-to-end.

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const LOG_ID = "33333333-3333-4333-8333-333333333333";

const mockFns = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  dbQuery: vi.fn(),
  generateImageRunware: vi.fn(),
  storeGeneratedEventImage: vi.fn(),
}));

vi.mock("@/core/adminAuth", () => ({
  requireAdmin: mockFns.requireAdmin,
}));

vi.mock("@/server/db", () => ({
  getDbPool: () => ({ query: mockFns.dbQuery }),
}));

vi.mock("@/core/imageGen/runware", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/core/imageGen/runware")>();
  return {
    ...orig,
    generateImageRunware: mockFns.generateImageRunware,
  };
});

vi.mock("@/core/imageGen/store", () => ({
  storeGeneratedEventImage: mockFns.storeGeneratedEventImage,
}));

import { POST } from "./route";
import { RunwareHttpError } from "@/core/imageGen/runware";

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

function mockDb(spend: { spend: number; n: number } = { spend: 0, n: 0 }) {
  mockFns.dbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SUM(cost_usd)")) {
      return { rows: [{ spend: spend.spend, n: spend.n }] };
    }
    if (sql.includes("INSERT INTO image_generation_log")) {
      return { rows: [{ id: LOG_ID }] };
    }
    return { rows: [] };
  });
}

const VALID_BODY = {
  event_id: EVENT_ID,
  model_id: "bfl-flux-1-1-pro",
  prompt: "Documentary photograph of X, 1969, Y.",
  negative_prompt: "text, watermark",
};

describe("POST /api/admin/generator/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RUNWARE_API_KEY = "test-key";
    mockFns.requireAdmin.mockResolvedValue({ user: { id: ADMIN_ID } });
    mockDb();
    mockFns.generateImageRunware.mockResolvedValue({
      imageUrl: "https://provider.example/i.jpg",
      cost: 0.04,
      durationMs: 1234,
    });
    mockFns.storeGeneratedEventImage.mockResolvedValue({
      publicUrl: "https://supa.example/storage/v1/object/public/event-images/events/e/l.jpg",
      storagePath: `events/${EVENT_ID}/${LOG_ID}.jpg`,
      contentType: "image/jpeg",
      byteLength: 100,
    });
  });
  afterEach(() => {
    delete process.env.RUNWARE_API_KEY;
  });

  it("401 before any DB/provider work when requireAdmin throws", async () => {
    mockFns.requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
    expect(mockFns.generateImageRunware).not.toHaveBeenCalled();
  });

  it("403 on Forbidden", async () => {
    mockFns.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(403);
    expect(mockFns.dbQuery).not.toHaveBeenCalled();
  });

  it("400 on missing target / bad uuid / empty prompt / unknown model", async () => {
    expect((await POST(req({ model_id: "x", prompt: "p" }))).status).toBe(400);
    expect(
      (await POST(req({ ...VALID_BODY, event_id: "not-a-uuid" }))).status
    ).toBe(400);
    expect((await POST(req({ ...VALID_BODY, prompt: " " }))).status).toBe(400);
    expect(
      (await POST(req({ ...VALID_BODY, model_id: "nope" }))).status
    ).toBe(400);
    expect(mockFns.generateImageRunware).not.toHaveBeenCalled();
  });

  it("400 model_disabled for reve-image (enabled=false, airId=null)", async () => {
    const res = await POST(req({ ...VALID_BODY, model_id: "reve-image" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("model_disabled");
    expect(mockFns.generateImageRunware).not.toHaveBeenCalled();
  });

  it("400 key_not_configured when RUNWARE_API_KEY absent", async () => {
    delete process.env.RUNWARE_API_KEY;
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("key_not_configured");
    expect(mockFns.generateImageRunware).not.toHaveBeenCalled();
  });

  it("429 spend_cap_usd before provider call when daily spend >= $5", async () => {
    mockDb({ spend: 5.5, n: 3 });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(429);
    const j = await res.json();
    expect(j.error).toBe("spend_cap_usd");
    expect(mockFns.generateImageRunware).not.toHaveBeenCalled();
    // spend query ran, pending INSERT did not
    const sqls = mockFns.dbQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("SUM(cost_usd)"))).toBe(true);
    expect(sqls.some((s) => s.includes("INSERT INTO"))).toBe(false);
  });

  it("429 spend_cap_count when daily count >= 100", async () => {
    mockDb({ spend: 0.5, n: 100 });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(429);
    expect(mockFns.generateImageRunware).not.toHaveBeenCalled();
  });

  it("happy path: pending -> provider -> storage -> completed, returns public URL", async () => {
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.logId).toBe(LOG_ID);
    expect(j.imageUrl).toContain("/event-images/");
    expect(j.storagePath).toBe(`events/${EVENT_ID}/${LOG_ID}.jpg`);
    expect(j.costUsd).toBe(0.04);

    const sqls = mockFns.dbQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("INSERT INTO image_generation_log"))).toBe(true);
    expect(sqls.some((s) => s.includes("status = 'completed'"))).toBe(true);
    // provider called with the registry AIR id + default size
    const arg = mockFns.generateImageRunware.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.model).toBe("bfl:2@1");
    expect(arg.width).toBe(1024);
    expect(arg.height).toBe(1024);
    // storage scoped to the event id
    const sarg = mockFns.storeGeneratedEventImage.mock.calls[0][0] as Record<string, unknown>;
    expect(sarg.scopeId).toBe(EVENT_ID);
    expect(sarg.imageId).toBe(LOG_ID);
  });

  it("provider 401 -> 502 provider_http_401 + log marked failed", async () => {
    mockFns.generateImageRunware.mockRejectedValue(
      new RunwareHttpError(401, "bad key")
    );
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j.error).toBe("provider_http_401");
    expect(j.providerStatus).toBe(401);
    const sqls = mockFns.dbQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("status = 'failed'"))).toBe(true);
    expect(sqls.some((s) => s.includes("status = 'completed'"))).toBe(false);
  });

  it("candidate_id-only target is accepted and scopes storage to candidate", async () => {
    const CAND = "44444444-4444-4444-8444-444444444444";
    const res = await POST(
      req({ candidate_id: CAND, model_id: "bfl-flux-1-schnell", prompt: "p" })
    );
    expect(res.status).toBe(200);
    const sarg = mockFns.storeGeneratedEventImage.mock.calls[0][0] as Record<string, unknown>;
    expect(sarg.scopeId).toBe(CAND);
  });
});

describe("route source-order guard", () => {
  const src = readFileSync(resolve(__dirname, "route.ts"), "utf-8");

  it("requireAdmin() is the first awaited call — before pool/provider use", () => {
    const adminIdx = src.indexOf("await requireAdmin()");
    expect(adminIdx).toBeGreaterThan(-1);
    for (const needle of [
      "getDbPool()",
      "pool.query",
      "generateAndStoreImage(",
      "getAdminSpendToday(",
      "request.json()",
    ]) {
      const idx = src.indexOf(needle);
      if (idx === -1) continue;
      expect(idx, `${needle} must come after requireAdmin`).toBeGreaterThan(adminIdx);
    }
  });
});
