import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AIP-TEST-DAILY-RETRY-1022-A07
// Behaviour proof for the daily-autoplay retry path added by
// AIP-FIX-DAILY-RETRY-PARSEERRORS-1022-A04. daily-autoplay.ts exports nothing
// and self-runs main() on import, so each test re-imports the module with
// vi.resetModules() and drives it end-to-end with all external surfaces
// (child_process spawn, DB pool, dailyChallenge, rosterPreflight, dotenv)
// mocked. No network, DB, or LLM access.

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

const PARSE_ERROR = "Failed to parse AI final guess response: Unexpected token";
const MISSING_GUESS = "Final guess response missing finalGuess";

let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleErr: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let savedKey: string | undefined;

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
    if (sql.includes("FROM ai_answer_bank")) return { rows: [] };
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
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = savedKey;
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
    // Four scripted failures: only MAX_RETRIES+1 (=3) spawns may be consumed.
    await runAutoplay([
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
      { code: 1, stderr: PARSE_ERROR },
    ]);
    expect(mocks.spawnCalls).toHaveLength(3);
    expect(logs().match(/\[RETRY\]/g)).toHaveLength(2);
    expect(errs()).toContain("[ERROR] p-1 evt-1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 20000);

  it("(d) does NOT retry a non-matching error (OpenRouter 404 removed model)", async () => {
    await runAutoplay([
      { code: 1, stderr: "OpenRouter request failed: 404" },
      { code: 0 },
    ]);
    expect(mocks.spawnCalls).toHaveLength(1);
    expect(logs()).not.toContain("[RETRY]");
    expect(errs()).toContain("[ERROR] p-1 evt-1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 20000);
});
