import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AIP-BUILD-BUDGET-1103-004
// Supervisor-level proof for the real cost caps in daily-autoplay.ts.
// Same seam style as fleetHaltLatch.test.ts / dailyRetry.test.ts: the module
// self-runs main() on import (fire-and-forget), so each test re-imports it
// under vi.resetModules() with every external surface mocked — child_process
// spawn, DB pool, dailyChallenge, rosterPreflight, dotenv. Completion is
// observed via the poolEnd call; the hang-child seam proves in-flight workers
// are finished, never killed. No network, DB, or LLM access.

type WorkerResult = { code: number; stdout?: string; stderr?: string; hang?: boolean };
type Player = {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  daily_cost_cap_usd: number | string | null;
};

const mocks = vi.hoisted(() => ({
  spawnResults: [] as WorkerResult[],
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
  kills: [] as string[],
  openChildren: [] as Array<{
    emitClose: (code: number) => void;
  }>,
  poolQuery: vi.fn(),
  poolEnd: vi.fn(async () => ({})),
  players: [] as Player[],
  eventIds: ["evt-1", "evt-2"],
  preflight: {
    keep: [] as Player[],
    skipped: [] as unknown[],
    warnings: [] as string[],
  },
  spendQueue: [] as Array<Array<{ ai_player_id: string; cost: string | number }>>,
  spendError: null as Error | null,
  fleetCapRows: [] as Array<{ value: unknown }>,
  capError: null as Error | null,
  // AIP-BUILD-FLEETFINAL-1103-060: D3 rate settings rows — high rpm so the
  // token-bucket pacing is instant in tests.
  rateSettingsRows: [
    { key: "ai_rpm_free", value: 600000 },
    { key: "ai_rpm_paid", value: 600000 },
  ],
  finalizeCalls: [] as Array<{ sql: string; params: unknown[] }>,
  alertInserts: [] as Array<{ sql: string; params: unknown[] }>,
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
    child.kill = () => {
      mocks.kills.push(String(command));
      return true;
    };
    if (res.hang) {
      mocks.openChildren.push({
        emitClose: (code: number) => child.emit("close", code),
      });
    } else {
      setImmediate(() => {
        if (res.stdout) stdout.emit("data", Buffer.from(res.stdout));
        if (res.stderr) stderr.emit("data", Buffer.from(res.stderr));
        child.emit("close", res.code);
      });
    }
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

vi.mock("./rosterPreflight", () => ({
  preflightRoster: async () => mocks.preflight,
}));

vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }), default: { config: () => ({}) } }));

// AIP-BUILD-FLEETFINAL-1103-060: roster is classified via the DB catalog
// (openrouter_models), not preflightRoster — mark every test player
// free+vision+available so classifyPlayer keeps it as a player.
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

const P1: Player = {
  id: "p-1",
  name: "BotOne",
  provider: "openrouter",
  model_id: "test/model-one",
  daily_cost_cap_usd: null,
};
const P2: Player = {
  id: "p-2",
  name: "BotTwo",
  provider: "openrouter",
  model_id: "test/model-two",
  daily_cost_cap_usd: null,
};

let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleErr: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let savedKey: string | undefined;
let savedCooldown: string | undefined;

function resetState() {
  mocks.spawnResults = [];
  mocks.spawnCalls = [];
  mocks.kills = [];
  mocks.openChildren = [];
  mocks.players = [];
  mocks.eventIds = ["evt-1", "evt-2"];
  mocks.preflight = { keep: [], skipped: [], warnings: [] };
  mocks.spendQueue = [];
  mocks.spendError = null;
  mocks.fleetCapRows = [];
  mocks.capError = null;
  mocks.finalizeCalls = [];
  mocks.alertInserts = [];
  mocks.poolEnd.mockClear();
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string) => {
    // Order matters: the D3 usage query also hits ai_answer_bank_calls —
    // route it before the spend query (it's the date_trunc one).
    if (sql.includes("date_trunc")) return { rows: [] };
    if (sql.includes("ai_answer_bank_calls")) {
      if (mocks.spendError) throw mocks.spendError;
      return { rows: mocks.spendQueue.shift() ?? [] };
    }
    if (sql.includes("FROM ai_players")) return { rows: mocks.players };
    if (sql.includes("FROM openrouter_models")) return { rows: catalogRows() };
    // The D3 rate-settings read shares the table but is a different query —
    // capError simulates the CAP query failing only (settings still parse).
    if (sql.includes("SELECT key, value FROM ai_fleet_settings")) {
      return { rows: mocks.rateSettingsRows };
    }
    if (sql.includes("FROM ai_fleet_settings")) {
      if (mocks.capError) throw mocks.capError;
      return { rows: mocks.fleetCapRows };
    }
    if (sql.includes("ai_play_deferrals")) return { rows: [] };
    if (sql.includes("FROM ai_answer_bank")) return { rows: [] };
    if (sql.includes("FROM events")) return { rows: [] };
    if (sql.includes("INSERT INTO ai_fleet_runs")) return { rows: [{ id: "run-1" }] };
    if (sql.includes("UPDATE ai_fleet_runs")) {
      mocks.finalizeCalls.push({ sql, params: [] });
      return { rows: [] };
    }
    if (sql.includes("UPDATE ai_fleet_alerts")) return { rows: [] };
    if (sql.includes("INSERT INTO ai_fleet_alerts")) {
      mocks.alertInserts.push({ sql, params: [] });
      return { rows: [] };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

// poolQuery mock above needs the SQL params — wrap to record them for
// finalize/alerts assertions.
function wrapParams() {
  const base = mocks.poolQuery.getMockImplementation()!;
  mocks.poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("UPDATE ai_fleet_runs") || sql.includes("INSERT INTO ai_fleet_alerts")) {
      const r = await base(sql, params);
      const rec = sql.includes("UPDATE ai_fleet_runs")
        ? mocks.finalizeCalls[mocks.finalizeCalls.length - 1]
        : mocks.alertInserts[mocks.alertInserts.length - 1];
      rec.params = params ?? [];
      return r;
    }
    return base(sql, params);
  });
}

// Resets module + mock state; each test then sets mocks and imports the
// module, which fires main() under that configuration.
function startRun(): void {
  vi.resetModules();
  resetState();
  wrapParams();
}

async function waitFor(pred: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) {
      const out = consoleLog.mock.calls.map((c) => c.join(" ")).join("\n");
      const err = consoleErr.mock.calls.map((c) => c.join(" ")).join("\n");
      throw new Error(`waitFor timeout\nLOGS:\n${out}\nERRORS:\n${err}`);
    }
    await new Promise((r) => setImmediate(r));
  }
}

async function runDone(): Promise<void> {
  await waitFor(() => mocks.poolEnd.mock.calls.length > 0);
}

beforeEach(() => {
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  savedKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  savedCooldown = process.env.AI_DAILY_SWEEP_COOLDOWN_MS;
  process.env.AI_DAILY_SWEEP_COOLDOWN_MS = "0";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
  if (savedCooldown === undefined) delete process.env.AI_DAILY_SWEEP_COOLDOWN_MS;
  else process.env.AI_DAILY_SWEEP_COOLDOWN_MS = savedCooldown;
});

describe("daily-autoplay budget caps (AIP-BUILD-BUDGET-1103-004)", () => {
  it("fleet cap reached => stops dispatch, in-flight finishes unkilled, halted/budget, exit 0", async () => {
    startRun();
    mocks.players = [P1, P2];
    mocks.preflight = { keep: [P1, P2], skipped: [], warnings: [] };
    mocks.eventIds = ["evt-1"];
    mocks.fleetCapRows = [{ value: 2.0 }];
    mocks.spendQueue = [
      [{ ai_player_id: "p-1", cost: "0.5" }],
      [{ ai_player_id: "p-1", cost: "2.5" }],
    ];
    mocks.spawnResults = [{ code: 0, hang: true }];

    await import("./daily-autoplay"); // fires main()
    // Wait until both spend checks ran (2nd triggers halt) — spawn#1 hangs in-flight.
    await waitFor(() => mocks.spawnCalls.length === 1);
    await waitFor(() => {
      // second spend query consumed -> halt decided on the other worker
      return mocks.spendQueue.length === 0;
    });
    await new Promise((r) => setImmediate(r));
    expect(mocks.kills).toHaveLength(0); // in-flight child NOT killed
    mocks.openChildren[0].emitClose(0); // let the in-flight child finish
    await runDone();

    expect(mocks.spawnCalls).toHaveLength(1); // no further dispatch after cap
    const fin = mocks.finalizeCalls[0];
    expect(fin.params[1]).toBe("halted");
    expect(fin.params[2]).toBe("budget");
    expect(String(mocks.alertInserts[0]?.params[0])).toContain(
      "Fleet daily cap $2.00 reached"
    );
    expect(mocks.alertInserts[0]?.sql).toContain("'budget'");
    expect(exitSpy).not.toHaveBeenCalled(); // budget stop exits 0
  }, 20000);

  it("model cap reached => only that model skipped, counted in plays_skipped_budget", async () => {
    startRun();
    const capped: Player = { ...P1, daily_cost_cap_usd: 1.0 };
    mocks.players = [capped, P2];
    mocks.preflight = { keep: [capped, P2], skipped: [], warnings: [] };
    mocks.eventIds = ["evt-1"];
    mocks.fleetCapRows = [{ value: 10 }];
    mocks.spendQueue = [
      [{ ai_player_id: "p-1", cost: "1.5" }],
      [{ ai_player_id: "p-2", cost: "0.1" }],
      [{ ai_player_id: "p-1", cost: "1.5" }],
      [{ ai_player_id: "p-2", cost: "0.1" }],
    ];
    mocks.spawnResults = [{ code: 0 }];
    await import("./daily-autoplay");
    await runDone();

    expect(mocks.spawnCalls).toHaveLength(1); // only p-2 dispatched
    expect(mocks.spawnCalls[0].args.join(" ")).toContain("test/model-two");
    const fin = mocks.finalizeCalls[0];
    expect(fin.params[1]).toBe("ok");
    expect(fin.params[2]).toBeNull();
    expect(fin.params[11]).toBe(1); // plays_skipped_budget
    expect(fin.params[5]).toBe(0); // plays_failed — skip is NOT a failure
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("spend-query failure => fail-open, item still dispatched", async () => {
    startRun();
    mocks.players = [P1];
    mocks.preflight = { keep: [P1], skipped: [], warnings: [] };
    mocks.eventIds = ["evt-1"];
    mocks.fleetCapRows = [{ value: 2.0 }];
    mocks.spendError = new Error("relation gone");
    mocks.spawnResults = [{ code: 0 }];
    await import("./daily-autoplay");
    await runDone();

    expect(mocks.spawnCalls).toHaveLength(1);
    expect(mocks.finalizeCalls[0].params[1]).toBe("ok");
    expect(
      consoleErr.mock.calls.some((c) =>
        String(c[0]).includes("[BUDGET] spend query failed (fail-open)")
      )
    ).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("cap-query failure => default $2 cap applied, item under default still dispatched", async () => {
    startRun();
    mocks.players = [P1];
    mocks.preflight = { keep: [P1], skipped: [], warnings: [] };
    mocks.eventIds = ["evt-1"];
    mocks.capError = new Error("settings table gone");
    mocks.spendQueue = [[{ ai_player_id: "p-1", cost: "0.1" }]];
    mocks.spawnResults = [{ code: 0 }];
    await import("./daily-autoplay");
    await runDone();

    expect(mocks.spawnCalls).toHaveLength(1);
    expect(mocks.finalizeCalls[0].params[1]).toBe("ok");
    expect(
      consoleErr.mock.calls.some((c) =>
        String(c[0]).includes("[BUDGET] cap query failed (default")
      )
    ).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("cap-query failure + spend over default $2 => no dispatch, halted/budget", async () => {
    startRun();
    mocks.players = [P1];
    mocks.preflight = { keep: [P1], skipped: [], warnings: [] };
    mocks.eventIds = ["evt-1"];
    mocks.capError = new Error("settings table gone");
    mocks.spendQueue = [[{ ai_player_id: "p-1", cost: "2.5" }]];
    mocks.spawnResults = [{ code: 0 }];
    await import("./daily-autoplay");
    await runDone();

    expect(mocks.spawnCalls).toHaveLength(0);
    const fin = mocks.finalizeCalls[0];
    expect(fin.params[1]).toBe("halted");
    expect(fin.params[2]).toBe("budget");
    expect(String(mocks.alertInserts[0]?.params[0])).toContain(
      "Fleet daily cap $2.00 reached"
    );
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("401 fleet-halt latch still wins over budget behaviour", async () => {
    startRun();
    mocks.players = [P1, P2];
    mocks.preflight = { keep: [P1, P2], skipped: [], warnings: [] };
    mocks.eventIds = ["evt-1", "evt-2"];
    mocks.fleetCapRows = [{ value: 10 }];
    mocks.spendQueue = Array.from({ length: 10 }, () => [
      { ai_player_id: "p-1", cost: "0.1" },
      { ai_player_id: "p-2", cost: "0.1" },
    ]);
    mocks.spawnResults = Array.from({ length: 8 }, () => ({
      code: 1,
      stderr: "OpenRouter request failed: 401",
    }));
    await import("./daily-autoplay");
    await runDone();

    const kinds = mocks.alertInserts.map((a) => a.sql);
    expect(kinds.some((s) => s.includes("'auth_fleet'"))).toBe(true);
    expect(kinds.some((s) => s.includes("'budget'"))).toBe(false);
    const fin = mocks.finalizeCalls[0];
    expect(fin.params[1]).toBe("halted");
    expect(fin.params[2]).toBe("auth_fleet");
    expect(exitSpy).toHaveBeenCalledWith(1); // auth halt keeps exit 1
    expect(fin.params[11]).toBe(0); // nothing budget-skipped
  }, 20000);
});
