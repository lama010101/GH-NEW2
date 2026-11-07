import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AIP-BUILD-FLEETFINAL-1103-060 — phase coverage for the D3/D7 supervisor
// rewrite: --phase=daily|coverage|audit|all, eligibility roster, deferral
// upserts on worker exit 75 / RATE_LIMIT_DEFERRED, per-model cooldown lanes,
// non-429 transient retries kept at 1s/4s, sweep excluding deferred items.
// Same seam style as dailyRetry.test.ts: module self-runs main() on import;
// spawn/pool/dailyChallenge mocked. No network, DB, or LLM access.

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
  eventIds: ["evt-1"],
  candidates: [] as Array<{ event_id: string; coverage: number }>,
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
    const argList = Array.isArray(args) ? args.map(String) : [];
    const res = mocks.spawnResults.shift() ?? { code: 0 };
    mocks.spawnCalls.push({ command: String(command), args: argList });
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

async function waitForSummary(needle = "autoplay summary"): Promise<void> {
  const start = Date.now();
  while (!logs().includes(needle) && !mocks.poolEnd.mock.calls.length) {
    if (Date.now() - start > 20000) {
      throw new Error(`timed out waiting for summary\nLOGS:\n${logs()}\nERRORS:\n${errs()}`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

async function runAutoplay(
  scripted: WorkerResult[],
  extraArgs: string[] = [],
  opts: { settingsRows?: Array<{ key: string; value: unknown }>; eventIds?: string[] } = {}
): Promise<void> {
  vi.resetModules();
  mocks.spawnResults = [...scripted];
  mocks.spawnCalls = [];
  mocks.queries = [];
  mocks.queryParams = [];
  mocks.players = [PLAYER];
  mocks.eventIds = opts.eventIds ?? ["evt-1"];
  mocks.settingsRows = opts.settingsRows ?? [
    { key: "ai_rpm_free", value: 600000 },
    { key: "ai_rpm_paid", value: 600000 },
    { key: "ai_backoff_base_ms", value: 1 },
    { key: "ai_backoff_max_ms", value: 10 },
  ];
  process.argv = [savedArgv[0], savedArgv[1], ...extraArgs];
  mocks.poolEnd.mockClear();
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    mocks.queries.push(sql);
    mocks.queryParams.push(params);
    if (sql.includes("FROM ai_players")) return { rows: mocks.players };
    if (sql.includes("FROM openrouter_models")) return { rows: catalogRows() };
    if (sql.includes("SELECT key, value FROM ai_fleet_settings")) return { rows: mocks.settingsRows };
    if (sql.includes("FROM ai_fleet_settings")) return { rows: mocks.settingsRows };
    if (sql.includes("date_trunc")) return { rows: [] };
    if (sql.includes("ai_answer_bank_calls")) return { rows: [] };
    if (sql.includes("ai_play_deferrals")) return { rows: [] };
    if (sql.includes("FROM daily_challenges")) return { rows: [{ event_ids: mocks.eventIds }] };
    if (sql.includes("FROM ai_answer_bank")) return { rows: [] };
    if (sql.includes("FROM events")) return { rows: mocks.candidates };
    if (sql.includes("INSERT INTO ai_fleet_runs")) return { rows: [{ id: "run-1" }] };
    if (sql.includes("ai_fleet_runs") || sql.includes("ai_fleet_alerts")) return { rows: [] };
    throw new Error(`unexpected query: ${sql}`);
  });
  await import("./daily-autoplay");
  await waitForSummary();
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
  mocks.candidates = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  process.argv = savedArgv;
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
  if (savedCooldown === undefined) delete process.env.AI_DAILY_SWEEP_COOLDOWN_MS;
  else process.env.AI_DAILY_SWEEP_COOLDOWN_MS = savedCooldown;
});

describe("daily-autoplay phases (AIP-BUILD-FLEETFINAL-1103-060)", () => {
  it("(a) --phase=coverage --dry-run prints a practice work plan without spawns or writes", async () => {
    mocks.candidates = [
      { event_id: "cand-1", coverage: 0 },
      { event_id: "cand-2", coverage: 0 },
    ];
    await runAutoplay([], ["--phase=coverage", "--dry-run"]);
    expect(mocks.spawnCalls).toHaveLength(0);
    expect(logs()).toContain("items=2 practice=2");
    expect(logs()).toContain("cand-1");
    expect(logs()).toContain("[DRY-RUN] projected requests");
    // No writes: deferral/bank/fleet-run inserts never ran.
    expect(mocks.queries.some((q) => /^\s*(INSERT|UPDATE)/i.test(q))).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(b) spawn passes --mode and a worker exiting 75 upserts a deferral, not a failure", async () => {
    await runAutoplay([
      {
        code: 75,
        stderr: "RATE_LIMIT_DEFERRED retry_after_ms=45000 Parasail/upstream_provider_shared_pool",
      },
    ]);
    expect(mocks.spawnCalls).toHaveLength(1);
    expect(mocks.spawnCalls[0].args).toContain("--mode=daily");
    const upserts = mocks.queries.filter((q) => q.includes("INSERT INTO ai_play_deferrals"));
    expect(upserts).toHaveLength(1);
    expect(logs()).toContain("[DEFER] p-1 evt-1");
    expect(logs()).toContain("Deferred (rate limit): 1");
    expect(logs()).toContain("Failed: 0");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(c) a model at its cooldown cap skips subsequent same-model spawns (deferral, no spawn)", async () => {
    await runAutoplay(
      [{ code: 75, stderr: "RATE_LIMIT_DEFERRED retry_after_ms=1 provider/upstream" }],
      [],
      {
        eventIds: ["evt-1", "evt-2", "evt-3"],
        settingsRows: [
          { key: "ai_rpm_free", value: 600000 },
          { key: "ai_max_cooldowns_per_model", value: 1 },
          { key: "ai_backoff_base_ms", value: 1 },
          { key: "ai_backoff_max_ms", value: 10 },
        ],
      }
    );
    expect(mocks.spawnCalls).toHaveLength(1); // items 2+3 deferred without spawning
    const upserts = mocks.queries
      .map((q, i) => ({ q, params: mocks.queryParams[i] }))
      .filter(({ q }) => q.includes("INSERT INTO ai_play_deferrals"));
    expect(upserts).toHaveLength(3); // the 429 item + 2 cooldown-exhausted items
    expect(
      upserts.filter(({ params }) => params?.[3] === "model_cooldown_exhausted")
    ).toHaveLength(2);
    expect(logs()).toContain("Deferred (rate limit): 3");
    expect(logs()).toContain("Failed: 0");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(d) a non-429 transient still retries with the 1s/4s profile", async () => {
    await runAutoplay([
      { code: 1, stderr: "OpenRouter request failed: 500" },
      { code: 0 },
    ]);
    expect(mocks.spawnCalls).toHaveLength(2);
    expect(logs()).toContain("[RETRY] p-1 evt-1");
    expect(logs()).toContain("retrying in 1000ms");
    expect(logs()).toContain("[OK] p-1 evt-1");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 20000);

  it("(e) the sweep re-runs non-429 transients but never deferred items", async () => {
    await runAutoplay(
      [
        { code: 1, stderr: "OpenRouter request failed: 500" }, // evt-1 x3
        { code: 1, stderr: "OpenRouter request failed: 500" },
        { code: 1, stderr: "OpenRouter request failed: 500" },
        { code: 75, stderr: "RATE_LIMIT_DEFERRED retry_after_ms=1 provider/upstream" }, // evt-2
        { code: 0 }, // evt-1 sweep
      ],
      [],
      { eventIds: ["evt-1", "evt-2"] }
    );
    // 3 transient attempts + 1 deferred + 1 sweep retry — no 6th spawn for evt-2.
    expect(mocks.spawnCalls).toHaveLength(5);
    expect(logs()).toContain("[SWEEP] 1 transient failures");
    expect(logs()).toContain("Recovered in sweep: 1");
    expect(logs()).toContain("Deferred (rate limit): 1");
    expect(logs()).toContain("Failed after sweep: 0");
    expect(exitSpy).not.toHaveBeenCalled();
  }, 30 * 1000); // real 1s+4s retries + sweep — needs headroom over the 3 transient attempts
});
