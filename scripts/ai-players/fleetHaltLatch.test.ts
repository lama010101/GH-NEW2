import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AIP-FIX-FLEETHALT-MERGE-1102-051
// Behaviour proof for the module-level fleet-halt latch in daily-autoplay.ts.
// Same seam style as dailyRetry.test.ts: the module self-runs main() on
// import, so each test re-imports it under vi.resetModules() with every
// external surface (child_process spawn, DB pool, dailyChallenge,
// rosterPreflight, dotenv) mocked. With zero active players main() exits
// before any work item exists, so only the exported helpers are exercised —
// processOne is driven through its injected runWorker seam for mid-flight
// latching. No network, DB, or LLM access.

type WorkerResult = { code: number; stdout?: string; stderr?: string };
type Player = { id: string; name: string; provider: string; model_id: string };

const mocks = vi.hoisted(() => ({
  spawnResults: [] as WorkerResult[],
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
  poolQuery: vi.fn(),
  poolEnd: vi.fn(async () => ({})),
  players: [] as Player[],
  eventIds: ["evt-1"],
  preflight: {
    keep: [] as Player[],
    skipped: [] as unknown[],
    warnings: [] as string[],
  },
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

vi.mock("./rosterPreflight", () => ({
  preflightRoster: async () => mocks.preflight,
}));

vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }), default: { config: () => ({}) } }));

const PLAYER: Player = {
  id: "p-1",
  name: "TestBot",
  provider: "openrouter",
  model_id: "test/model",
};

const ITEM = { player: PLAYER, eventId: "evt-1" };

let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleErr: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let savedKey: string | undefined;
let savedCooldown: string | undefined;

// Imports the module with main() defused: zero active players returns before
// any work item is created, so only the exported helpers are exercised.
async function importForHelper(): Promise<typeof import("./daily-autoplay")> {
  vi.resetModules();
  mocks.spawnResults = [];
  mocks.spawnCalls = [];
  mocks.players = [];
  mocks.preflight = { keep: [], skipped: [], warnings: [] };
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM ai_players")) return { rows: mocks.players };
    throw new Error(`unexpected query: ${sql}`);
  });
  return await import("./daily-autoplay");
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
  if (savedKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = savedKey;
  }
  if (savedCooldown === undefined) {
    delete process.env.AI_DAILY_SWEEP_COOLDOWN_MS;
  } else {
    process.env.AI_DAILY_SWEEP_COOLDOWN_MS = savedCooldown;
  }
});

describe("fleet-halt latch (AIP-FIX-FLEETHALT-MERGE-1102-051)", () => {
  it("(i) after latchFleetHalt() processOne spawns no worker and awaits no delay", async () => {
    const mod = await importForHelper();
    expect(mod.isFleetHaltLatched()).toBe(false);
    mod.latchFleetHalt();
    expect(mod.isFleetHaltLatched()).toBe(true);
    const start = Date.now();
    const res = await mod.processOne(ITEM);
    expect(mocks.spawnCalls).toHaveLength(0);
    expect(Date.now() - start).toBeLessThan(1000); // no RETRY_DELAYS_MS sleep
    expect(res).toEqual({ ok: false, lastFailureTransient: false, lastError: "FLEET_HALTED" });
  }, 20000);

  it("(i-b) a pending retry is cancelled — latch mid-flight stops the next spawn", async () => {
    const mod = await importForHelper();
    let calls = 0;
    const worker = async () => {
      calls++;
      return { code: 1, stdout: "", stderr: "socket hang up" }; // transient
    };
    const pending = mod.processOne(ITEM, worker);
    setTimeout(() => mod.latchFleetHalt(), 20); // lands during the 1000ms retry delay
    const res = await pending;
    expect(calls).toBe(1); // retry attempt never spawned
    expect(res.lastError).toBe("FLEET_HALTED");
    expect(mocks.spawnCalls).toHaveLength(0); // injected seam: real spawn untouched
  }, 20000);

  it("(i-c) a halt declared while a worker runs cancels before classification", async () => {
    const mod = await importForHelper();
    let calls = 0;
    const start = Date.now();
    const res = await mod.processOne(ITEM, async () => {
      calls++;
      mod.latchFleetHalt(); // halt lands during this attempt
      return { code: 1, stdout: "", stderr: "socket hang up" };
    });
    expect(calls).toBe(1); // transient stderr must NOT trigger a retry
    expect(Date.now() - start).toBeLessThan(1000); // and no retry delay ran
    expect(res).toEqual({ ok: false, lastFailureTransient: false, lastError: "FLEET_HALTED" });
  }, 20000);

  it("(ii) a FLEET_HALTED item is excluded from summarizeResults counts", async () => {
    const mod = await importForHelper();
    const results: import("./daily-autoplay").ItemResult[] = [
      { item: { player: PLAYER, eventId: "e-ok" }, ok: true, lastFailureTransient: false, lastError: null },
      { item: { player: PLAYER, eventId: "e-err" }, ok: false, lastFailureTransient: false, lastError: "OpenRouter request failed: 401" },
      { item: { player: PLAYER, eventId: "e-halt" }, ok: false, lastFailureTransient: false, lastError: "FLEET_HALTED" },
    ];
    const counts = mod.summarizeResults(results);
    expect(counts.plays_attempted).toBe(2); // cancelled item not attempted
    expect(counts.plays_ok).toBe(1);
    expect(counts.plays_failed).toBe(1); // cancelled item not failed
    expect(counts.failed_auth).toBe(1);
    expect(counts.failed_other).toBe(0); // cancelled must not land in 'other'
  });

  it("(ii-b) a RATE_LIMIT_DEFERRED item is attempted but never a failure (AIP-BUILD-FLEETFINAL-1103-060)", async () => {
    // D3: deferred items are counted separately via ai_play_deferrals — they
    // must not land in plays_failed or any failed_* bucket (nor 'other').
    const mod = await importForHelper();
    const results: import("./daily-autoplay").ItemResult[] = [
      { item: { player: PLAYER, eventId: "e-ok" }, ok: true, lastFailureTransient: false, lastError: null },
      { item: { player: PLAYER, eventId: "e-def" }, ok: false, lastFailureTransient: false, lastError: "RATE_LIMIT_DEFERRED retry_after_ms=45000 Parasail/upstream_provider_shared_pool" },
      { item: { player: PLAYER, eventId: "e-rl" }, ok: false, lastFailureTransient: false, lastError: "OpenRouter request failed: 429" },
    ];
    const counts = mod.summarizeResults(results);
    expect(counts.plays_attempted).toBe(3); // deferred item was attempted
    expect(counts.plays_ok).toBe(1);
    expect(counts.plays_failed).toBe(1); // only the plain 429 failed
    expect(counts.failed_rate_limit).toBe(1);
    expect(counts.failed_other).toBe(0);
    expect(counts.failed_auth).toBe(0);
  });

  it("(iii) resetFleetHaltLatch() restores normal behaviour", async () => {
    const mod = await importForHelper();
    mod.latchFleetHalt();
    mod.resetFleetHaltLatch();
    expect(mod.isFleetHaltLatched()).toBe(false);
    mocks.spawnResults = [{ code: 0 }];
    const res = await mod.processOne(ITEM);
    expect(res.ok).toBe(true);
    expect(res.lastError).toBeNull();
    expect(mocks.spawnCalls).toHaveLength(1);
  }, 20000);
});
