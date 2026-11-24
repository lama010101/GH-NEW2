import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OPS-GATE-AIFLEET-DAILYTRUE-1124-885 — regression proof for the Daily gate.
// Same seam style as dailyAutoplayPhases.test.ts: the module self-runs main()
// on import; spawn/pool/dailyChallenge are mocked, so "OpenRouter calls" are
// counted as worker spawns and "writes" as INSERT/UPDATE pool queries. The
// REAL fetchProvenTrueEventIds helper runs against the mocked pool — its SQL
// is matched on 'event_reliability' and can be scripted to return rows or
// throw (missing relation / query error). No network, DB, or LLM access.

type WorkerResult = { code: number | null; stdout?: string; stderr?: string };
type Player = { id: string; name: string; provider: string; model_id: string };

const mocks = vi.hoisted(() => ({
  spawnResults: [] as WorkerResult[],
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
  poolQuery: vi.fn(),
  poolEnd: vi.fn(async () => ({})),
  queries: [] as string[],
  queryParams: [] as Array<unknown[] | undefined>,
  players: [] as Player[],
  eventIds: ["evt-A", "evt-B", "evt-C"],
  provenRows: [] as Array<{ event_id: string }>,
  provenError: null as Error | null,
  deferrals: [] as Array<{
    ai_player_id: string;
    event_id: string;
    mode: string;
    retry_after_at: string | null;
  }>,
  bankRows: [] as Array<{
    ai_player_id: string;
    event_id: string;
    error: string | null;
    play_mode: string | null;
  }>,
  settingsRows: [
    { key: "ai_rpm_free", value: 600000 },
    { key: "ai_rpm_paid", value: 600000 },
    { key: "ai_backoff_base_ms", value: 1 },
    { key: "ai_backoff_max_ms", value: 10 },
  ] as Array<{ key: string; value: unknown }>,
}));

vi.mock("child_process", async () => {
  const { EventEmitter } = await import("node:events");
  const spawn = (command: unknown, args: unknown) => {
    const res = mocks.spawnResults.shift() ?? { code: 0 };
    mocks.spawnCalls.push({
      command: String(command),
      args: Array.isArray(args) ? args.map(String) : [],
    });
    const child = new EventEmitter() as unknown as Record<string, unknown>;
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = () => true;
    setImmediate(() => {
      if (res.stdout) stdout.emit("data", Buffer.from(res.stdout));
      if (res.stderr) stderr.emit("data", Buffer.from(res.stderr));
      child.emit("close", res.code);
    });
    return child;
  };
  return { spawn, default: { spawn } };
});

vi.mock("@/server/db", () => ({
  getDbPool: () => ({ query: mocks.poolQuery, end: mocks.poolEnd }),
}));

vi.mock("@/server/dailyChallenge", () => ({
  getOrCreateDailyChallenge: async () => ({ event_ids: mocks.eventIds }),
}));

vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }), default: { config: () => ({}) } }));

const PLAYER: Player = {
  id: "p-1",
  name: "TestBot",
  provider: "openrouter",
  model_id: "test/model",
};

function catalogRows() {
  return mocks.players.map((p) => ({
    model_id: p.model_id,
    is_free: true,
    is_vision: true,
    availability_status: "available",
    context_length: null,
    price_prompt_usd: 0,
    price_completion_usd: 0,
  }));
}

let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleErr: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let savedKey: string | undefined;
let savedCooldown: string | undefined;
let savedArgv: string[];

function logs(): string {
  return consoleLog.mock.calls.map((c) => c.join(" ")).join("\n");
}

function errs(): string {
  return consoleErr.mock.calls.map((c) => c.join(" ")).join("\n");
}

function writeQueries(): string[] {
  return mocks.queries.filter((q) => /^\s*(INSERT|UPDATE)/i.test(q));
}

function spawnedEventIds(): string[] {
  return mocks.spawnCalls.map((c) => c.args[2]);
}

function spawnedModes(): string[] {
  return mocks.spawnCalls.map((c) => c.args.find((a) => a.startsWith("--mode=")) ?? "");
}

async function waitForEnd(): Promise<void> {
  const start = Date.now();
  while (!mocks.poolEnd.mock.calls.length) {
    if (Date.now() - start > 20000) {
      throw new Error(`timed out waiting for pool.end\nLOGS:\n${logs()}\nERRORS:\n${errs()}`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

async function runDaily(
  scripted: WorkerResult[],
  opts: { provenRows?: Array<{ event_id: string }>; provenError?: Error | null } = {}
): Promise<void> {
  vi.resetModules();
  mocks.spawnResults = [...scripted];
  mocks.spawnCalls = [];
  mocks.queries = [];
  mocks.queryParams = [];
  mocks.players = [PLAYER];
  mocks.eventIds = ["evt-A", "evt-B", "evt-C"];
  mocks.provenRows = opts.provenRows ?? [];
  mocks.provenError = opts.provenError ?? null;
  mocks.deferrals = [
    { ai_player_id: "p-1", event_id: "evt-P", mode: "practice", retry_after_at: null },
  ];
  mocks.bankRows = [
    { ai_player_id: "p-1", event_id: "evt-D", error: "old error", play_mode: "daily" },
  ];
  process.argv = [savedArgv[0], savedArgv[1], "--phase=daily"];
  mocks.poolEnd.mockClear();
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    mocks.queries.push(sql);
    mocks.queryParams.push(params);
    if (sql.includes("fleet_daily_cap_usd")) return { rows: [{ value: 100 }] };
    if (sql.includes("FROM ai_players")) return { rows: mocks.players };
    if (sql.includes("FROM openrouter_models")) return { rows: catalogRows() };
    if (sql.includes("SELECT key, value FROM ai_fleet_settings")) return { rows: mocks.settingsRows };
    if (sql.includes("FROM ai_fleet_settings")) return { rows: mocks.settingsRows };
    if (sql.includes("date_trunc")) return { rows: [] };
    if (sql.includes("ai_answer_bank_calls")) return { rows: [] };
    if (sql.includes("event_reliability")) {
      if (mocks.provenError) throw mocks.provenError;
      return { rows: mocks.provenRows };
    }
    if (sql.includes("ai_play_deferrals")) {
      if (/^\s*(INSERT|UPDATE)/i.test(sql)) return { rows: [] };
      return { rows: mocks.deferrals };
    }
    if (sql.includes("FROM ai_answer_bank")) return { rows: mocks.bankRows };
    if (sql.includes("FROM events")) return { rows: [] };
    if (sql.includes("INSERT INTO ai_fleet_runs")) return { rows: [{ id: "run-1" }] };
    if (sql.includes("ai_fleet_runs") || sql.includes("ai_fleet_alerts")) return { rows: [] };
    throw new Error(`unexpected query: ${sql}`);
  });
  await import("./daily-autoplay");
  await waitForEnd();
  process.argv = savedArgv;
}

beforeEach(() => {
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  savedKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  savedCooldown = process.env.AI_DAILY_SWEEP_COOLDOWN_MS;
  process.env.AI_DAILY_SWEEP_COOLDOWN_MS = "0";
  savedArgv = process.argv;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.argv = savedArgv;
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
  if (savedCooldown === undefined) delete process.env.AI_DAILY_SWEEP_COOLDOWN_MS;
  else process.env.AI_DAILY_SWEEP_COOLDOWN_MS = savedCooldown;
});

describe("daily proven-true gate (OPS-GATE-AIFLEET-DAILYTRUE-1124-885)", () => {
  it("(i) empty proven-true pool -> zero spawns, zero writes, exit 0", async () => {
    await runDaily([], { provenRows: [] });
    expect(spawnedEventIds()).toEqual([]);
    expect(writeQueries()).toEqual([]);
    expect(logs()).toContain("proven-true pool empty");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(ii) pool of 2 proven-true ids -> only those events, daily mode only", async () => {
    // Ungated queue would be 5 items: evt-A/B/C daily (step 1) + evt-P
    // practice refresh + evt-D daily refresh (step 4). The gate must keep
    // exactly evt-A and evt-B as mode 'daily'.
    await runDaily([{ code: 0 }, { code: 0 }], {
      provenRows: [{ event_id: "evt-A" }, { event_id: "evt-B" }],
    });
    expect(spawnedEventIds().sort()).toEqual(["evt-A", "evt-B"]);
    expect(spawnedModes()).toEqual(["--mode=daily", "--mode=daily"]);
    expect(logs()).toContain("proven-true pool 2");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(iii) proven-true query error -> zero spawns, zero writes, exit 0", async () => {
    await runDaily([], {
      provenError: new Error('relation "event_reliability" does not exist'),
    });
    expect(spawnedEventIds()).toEqual([]);
    expect(writeQueries()).toEqual([]);
    expect(logs()).toContain("proven-true lookup failed");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);
});
