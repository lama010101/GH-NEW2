import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AIP-TEST-DAILY-RETRY-1022-A07
// Behaviour proof for the daily-autoplay retry path added by
// AIP-FIX-DAILY-RETRY-PARSEERRORS-1022-A04. daily-autoplay.ts self-runs main()
// on import, so each test re-imports the module with vi.resetModules() and
// drives it end-to-end with all external surfaces (child_process spawn, DB
// pool, dailyChallenge, rosterPreflight, dotenv) mocked. Pure helpers
// (selectSweepItems, AIP-FIX-DAILY-429SWEEP-1024-001) are imported from the
// same mocked module. No network, DB, or LLM access.

type WorkerResult = { code: number; stdout?: string; stderr?: string };
type Player = { id: string; name: string; provider: string; model_id: string };

const mocks = vi.hoisted(() => ({
  spawnResults: [] as WorkerResult[],
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
  poolQuery: vi.fn(),
  poolEnd: vi.fn(async () => ({})),
  players: [] as Player[],
  eventIds: ["evt-1"],
  candidates: [] as Array<{ event_id: string; coverage: number }>,
  // High rpm so the D3 token-bucket pacing is instant in tests.
  settingsRows: [
    { key: "ai_rpm_free", value: 600000 },
    { key: "ai_rpm_paid", value: 600000 },
  ],
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

const PLAYER: Player = {
  id: "p-1",
  name: "TestBot",
  provider: "openrouter",
  model_id: "test/model",
};

const PARSE_ERROR = "Failed to parse AI final guess response: Unexpected token";
const MISSING_GUESS = "Final guess response missing finalGuess";

let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleErr: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let savedKey: string | undefined;
let savedCooldown: string | undefined;

function logs(): string {
  return consoleLog.mock.calls.map((c) => c.join(" ")).join("\n");
}

function errs(): string {
  return consoleErr.mock.calls.map((c) => c.join(" ")).join("\n");
}

async function waitForSummary(): Promise<void> {
  const start = Date.now();
  while (!logs().includes("Daily autoplay summary")) {
    if (Date.now() - start > 25000) {
      throw new Error(`timed out waiting for summary\nLOGS:\n${logs()}\nERRORS:\n${errs()}`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  // Let the trailing `if (failed > 0) process.exit(1)` run.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

// Re-imports the module (which self-runs main()) with a scripted sequence of
// worker outcomes, then waits for the run to reach its summary.
async function runAutoplay(scripted: WorkerResult[]): Promise<void> {
  vi.resetModules();
  mocks.spawnResults = [...scripted];
  mocks.spawnCalls = [];
  mocks.players = [PLAYER];
  mocks.eventIds = ["evt-1"];
  mocks.preflight = { keep: [PLAYER], skipped: [], warnings: [] };
  mocks.poolEnd.mockClear();
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM ai_players")) return { rows: mocks.players };
    if (sql.includes("FROM openrouter_models")) return { rows: catalogRows() };
    if (sql.includes("SELECT key, value FROM ai_fleet_settings")) return { rows: mocks.settingsRows };
    if (sql.includes("FROM ai_fleet_settings")) return { rows: mocks.settingsRows };
    if (sql.includes("date_trunc")) return { rows: [] }; // D3 usage query
    if (sql.includes("ai_answer_bank_calls")) return { rows: [] }; // USD spend
    if (sql.includes("ai_play_deferrals")) return { rows: [] };
    if (sql.includes("FROM ai_answer_bank")) return { rows: [] };
    if (sql.includes("FROM events")) return { rows: mocks.candidates };
    if (sql.includes("INSERT INTO ai_fleet_runs")) return { rows: [{ id: "run-1" }] };
    if (sql.includes("ai_fleet_runs") || sql.includes("ai_fleet_alerts")) return { rows: [] };
    throw new Error(`unexpected query: ${sql}`);
  });
  await import("./daily-autoplay");
  await waitForSummary();
}

beforeEach(() => {
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  savedKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  // Cross the AIP-FIX-DAILY-429SWEEP-1024-001 sweep cooldown instantly; the
  // module reads it once at import time, so this must be set before import.
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

describe("daily-autoplay v3 retry (AIP-FIX-DAILY-RETRY-PARSEERRORS-1022-A04)", () => {
  it("(a) retries after 'Failed to parse AI final guess response' and recovers", async () => {
    await runAutoplay([{ code: 1, stderr: PARSE_ERROR }, { code: 0 }]);
    expect(mocks.spawnCalls).toHaveLength(2);
    expect(mocks.spawnCalls[0].args).toContain("--model=test/model");
    expect(logs()).toContain("[RETRY] p-1 evt-1");
    expect(logs()).toContain("[OK] p-1 evt-1");
    expect(logs()).toContain("Failed: 0");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(b) retries after 'Final guess response missing finalGuess' and recovers", async () => {
    await runAutoplay([{ code: 1, stderr: MISSING_GUESS }, { code: 0 }]);
    expect(mocks.spawnCalls).toHaveLength(2);
    expect(logs()).toContain("[RETRY] p-1 evt-1");
    expect(logs()).toContain("[OK] p-1 evt-1");
    expect(logs()).toContain("Failed: 0");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(c) exhausts retries on repeated parse failures; attempt count is bounded", async () => {
    // Six scripted failures: the initial pass consumes MAX_RETRIES+1 (=3)
    // spawns, then the transient-final failure is swept (AIP-FIX-DAILY-
    // 429SWEEP-1024-001) and the sweep pass consumes 3 more — still bounded.
    await runAutoplay([
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
    ]);
    expect(mocks.spawnCalls).toHaveLength(6);
    expect(logs().match(/\[RETRY\]/g)).toHaveLength(4);
    expect(logs()).toContain("[SWEEP] 1 transient failures");
    expect(errs()).toContain("[ERROR] p-1 evt-1");
    expect(logs()).toContain("Failed after sweep: 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 30 * 1000);

  it("(d) does NOT retry a non-matching error (OpenRouter 404 removed model)", async () => {
    await runAutoplay([
      { code: 1, stderr: "OpenRouter request failed: 404" },
      { code: 0 },
    ]);
    expect(mocks.spawnCalls).toHaveLength(1);
    expect(logs()).not.toContain("[RETRY]");
    expect(logs()).not.toContain("[SWEEP]");
    expect(errs()).toContain("[ERROR] p-1 evt-1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 20000);
});

describe("daily-autoplay sweep (AIP-FIX-DAILY-429SWEEP-1024-001)", () => {
  // Imports the module with main() defused: zero active players returns before
  // any work item is created, so only the exported helper is exercised.
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

  it("selectSweepItems selects only items whose final failure was transient", async () => {
    const mod = await importForHelper();
    const results: import("./daily-autoplay").ItemResult[] = [
      { item: { player: PLAYER, eventId: "e-transient" }, ok: false, lastFailureTransient: true },
      { item: { player: PLAYER, eventId: "e-nontransient" }, ok: false, lastFailureTransient: false },
      { item: { player: PLAYER, eventId: "e-ok" }, ok: true, lastFailureTransient: false },
    ];
    const selected = mod.selectSweepItems(results);
    expect(selected).toHaveLength(1);
    expect(selected[0].item.eventId).toBe("e-transient");
  });

  it("selectSweepItems excludes non-transient failures", async () => {
    const mod = await importForHelper();
    const results: import("./daily-autoplay").ItemResult[] = [
      { item: { player: PLAYER, eventId: "e-404" }, ok: false, lastFailureTransient: false },
    ];
    expect(mod.selectSweepItems(results)).toHaveLength(0);
  });

  it("selectSweepItems returns empty for empty input", async () => {
    const mod = await importForHelper();
    expect(mod.selectSweepItems([])).toEqual([]);
  });

  it("(e) accounting: an item recovered in the sweep moves failed -> succeeded (final failed 0, no exit(1))", async () => {
    // AIP-BUILD-FLEETFINAL-1103-060 (D3): a real 429 exits 75 + defers now —
    // the sweep fixture uses a non-429 transient (HTTP 500) instead.
    await runAutoplay([
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 0 },
    ]);
    expect(mocks.spawnCalls).toHaveLength(4);
    expect(logs()).toContain("[SWEEP] 1 transient failures");
    expect(logs()).toContain("Recovered in sweep: 1");
    expect(logs()).toContain("Failed: 0");
    expect(logs()).toContain("Failed after sweep: 0");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 30 * 1000);

  it("(f) a still-transient failure in the sweep leaves final failed > 0 and exit(1)", async () => {
    await runAutoplay([
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 1, stderr: "OpenRouter request failed: 500" },
    ]);
    expect(mocks.spawnCalls).toHaveLength(6);
    expect(logs()).toContain("[SWEEP] 1 transient failures");
    expect(logs()).toContain("Recovered in sweep: 0");
    expect(logs()).toContain("Failed after sweep: 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 30 * 1000);
});
