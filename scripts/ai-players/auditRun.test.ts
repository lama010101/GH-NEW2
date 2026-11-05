import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AIP-BUILD-FLEETFINAL-1103-060 (E4) — audit-run.ts coverage: auditor
// classification via the DB catalog, dry-run plan, ONE OpenRouter call per
// event upserted into ai_event_audits, 429 -> ai_play_deferrals upsert and
// the lane stops with no in-run retries. Module self-runs main() on import;
// pool + fetch + argv are mocked. No network, DB, or LLM access.

type Player = { id: string; name: string; provider: string; model_id: string };

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolEnd: vi.fn(async () => ({})),
  queries: [] as string[],
  queryParams: [] as Array<unknown[] | undefined>,
  players: [] as Player[],
  events: [] as Array<Record<string, unknown>>,
  fetchResults: [] as Array<{ status: number; body?: unknown; retryAfter?: string | null }>,
  fetchCalls: [] as Array<{ url: string; init: Record<string, unknown> }>,
}));

vi.mock("@/server/db", () => ({
  getDbPool: () => ({ query: mocks.poolQuery, end: mocks.poolEnd }),
}));

vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }), default: { config: () => ({}) } }));

const AUDITOR: Player = {
  id: "a-1",
  name: "AuditorBot",
  provider: "openrouter",
  model_id: "auditor/text-model",
};

// Text-only + free => classifyPlayer role 'auditor'.
function catalogRows() {
  return mocks.players.map((p) => ({
    model_id: p.model_id,
    is_free: true,
    is_vision: false,
    availability_status: "available",
    context_length: null,
    price_prompt_usd: 0,
    price_completion_usd: 0,
  }));
}

function eventRow(id: string) {
  return {
    event_id: id,
    title: "Test Event",
    description: "A test event.",
    event_year: 1900,
    location_name: "Nowhere",
    latitude: 1.5,
    longitude: 2.5,
    hints: [],
    audit_count: 0,
    avg_image_quality: null,
    avg_difficulty: null,
    image_quality_notes: null,
    difficulty_notes: null,
  };
}

function fakeResponse(res: { status: number; body?: unknown; retryAfter?: string | null }) {
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    headers: { get: (k: string) => (k === "retry-after" ? res.retryAfter ?? null : null) },
    text: async () => (typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? {})),
  } as unknown as Response;
}

let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleErr: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let savedKey: string | undefined;
let savedArgv: string[];

function logs(): string {
  return consoleLog.mock.calls.map((c) => c.join(" ")).join("\n");
}

function errs(): string {
  return consoleErr.mock.calls.map((c) => c.join(" ")).join("\n");
}

async function waitForEnd(): Promise<void> {
  const start = Date.now();
  while (!mocks.poolEnd.mock.calls.length && !logs().includes("Audit run summary")) {
    if (Date.now() - start > 20000) {
      throw new Error(`timed out waiting for audit end\nLOGS:\n${logs()}\nERRORS:\n${errs()}`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

async function runAudit(
  fetchScripted: Array<{ status: number; body?: unknown; retryAfter?: string | null }>,
  extraArgs: string[],
  opts: { events?: Array<Record<string, unknown>> } = {}
): Promise<void> {
  vi.resetModules();
  mocks.queries = [];
  mocks.queryParams = [];
  mocks.players = [AUDITOR];
  mocks.events = opts.events ?? [eventRow("e-1")];
  mocks.fetchResults = [...fetchScripted];
  mocks.fetchCalls = [];
  process.argv = [savedArgv[0], savedArgv[1], ...extraArgs];
  mocks.poolEnd.mockClear();
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    mocks.queries.push(sql);
    mocks.queryParams.push(params);
    if (sql.includes("FROM ai_players")) return { rows: mocks.players };
    if (sql.includes("FROM openrouter_models")) return { rows: catalogRows() };
    if (sql.includes("FROM ai_fleet_settings")) {
      return {
        rows: [
          { key: "ai_rpm_free", value: 600000 },
          { key: "ai_rpm_paid", value: 600000 },
        ],
      };
    }
    if (sql.includes("date_trunc")) return { rows: [] };
    if (sql.includes("ai_answer_bank_calls")) return { rows: [] };
    if (sql.includes("SELECT event_id, ai_player_id FROM ai_event_audits")) return { rows: [] };
    if (sql.includes("FROM events")) return { rows: mocks.events };
    if (sql.includes("ai_event_audits")) return { rows: [] };
    if (sql.includes("ai_play_deferrals")) return { rows: [] };
    throw new Error(`unexpected query: ${sql}`);
  });
  vi.stubGlobal("fetch", async (url: unknown, init: unknown) => {
    mocks.fetchCalls.push({ url: String(url), init: init as Record<string, unknown> });
    const res = mocks.fetchResults.shift();
    if (!res) throw new Error("unscripted fetch");
    return fakeResponse(res);
  });
  await import("./audit-run");
  await waitForEnd();
  process.argv = savedArgv;
}

beforeEach(() => {
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  savedKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  savedArgv = process.argv;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.argv = savedArgv;
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
});

describe("audit-run (AIP-BUILD-FLEETFINAL-1103-060, E4)", () => {
  it("(a) --dry-run prints auditors + planned events, calls nothing, writes nothing", async () => {
    await runAudit([], ["--dry-run"]);
    expect(logs()).toContain("[AUDIT] Auditors: 1");
    expect(logs()).toContain("items=1 events=[e-1]");
    expect(mocks.fetchCalls).toHaveLength(0);
    expect(mocks.queries.some((q) => /^\s*(INSERT|UPDATE)/i.test(q))).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(b) a 200 response produces exactly one ai_event_audits UPSERT", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              is_real_event: "real",
              year_check: "ok",
              location_check: "ok",
              confidence: 0.8,
              reasoning: "Looks right.",
            }),
          },
        },
      ],
    };
    await runAudit([{ status: 200, body }], []);
    expect(mocks.fetchCalls).toHaveLength(1);
    expect(mocks.fetchCalls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const upserts = mocks.queries
      .map((q, i) => ({ q, params: mocks.queryParams[i] }))
      .filter(({ q }) => q.includes("INSERT INTO ai_event_audits") && q.includes("ON CONFLICT (event_id, ai_player_id)"));
    expect(upserts).toHaveLength(1);
    expect(upserts[0].params?.[0]).toBe("e-1");
    expect(upserts[0].params?.[1]).toBe("a-1");
    expect(upserts[0].params?.[2]).toBe("real");
    expect(logs()).toContain("[OK] auditor/text-model e-1");
    expect(exitSpy).toHaveBeenCalledWith(0);
  }, 20000);

  it("(c) a 429 defers via ai_play_deferrals (mode 'audit'), stops the lane, never retries", async () => {
    await runAudit([{ status: 429, retryAfter: "2" }], [], {
      events: [eventRow("e-1"), eventRow("e-2")],
    });
    expect(mocks.fetchCalls).toHaveLength(1); // no retry, and e-2 never called
    const deferrals = mocks.queries
      .map((q, i) => ({ q, params: mocks.queryParams[i] }))
      .filter(({ q }) => q.includes("INSERT INTO ai_play_deferrals"));
    expect(deferrals).toHaveLength(1);
    expect(deferrals[0].params?.[0]).toBe("a-1");
    // Candidate order is sha-256 hex of the event id — deterministic but not
    // array order; whichever sorted first is the one fetched + deferred.
    expect(["e-1", "e-2"]).toContain(deferrals[0].params?.[1]);
    // mode 'audit' is a SQL literal in UPSERT_DEFERRAL_SQL; $3 is the reason.
    expect(deferrals[0].q).toContain("'audit'");
    expect(String(deferrals[0].params?.[2])).toContain("429");
    expect(mocks.queries.some((q) => q.includes("INSERT INTO ai_event_audits"))).toBe(false);
    expect(logs()).toContain("[DEFER] auditor/text-model");
    expect(logs()).toContain("Deferred: 1");
    expect(exitSpy).toHaveBeenCalledWith(0);
  }, 20000);

  it("(d) a 401 stops the run and exits 1", async () => {
    await runAudit([{ status: 401 }], []);
    expect(mocks.fetchCalls).toHaveLength(1);
    expect(errs()).toContain("[AUTH]");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 20000);
});
