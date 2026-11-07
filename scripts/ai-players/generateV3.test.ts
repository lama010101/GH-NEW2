import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_PLAYER_TIMER_MS } from "@/core/aiPlayers";

// AIP-BUILD-FLEETFINAL-1103-060 — E1/E2 behaviour proof for the v3 worker.
// generate-answers-v3.ts self-runs main() on import, so each test re-imports
// the module with vi.resetModules() and drives it end-to-end with every
// external surface (DB pool, fetch incl. the stimulus image, dotenv,
// process.exit, process.argv) mocked — same pattern as dailyRetry.test.ts.
// Zero network, DB, or LLM access.

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolEnd: vi.fn(async () => ({})),
  fetchImpl: vi.fn(),
  orQueue: [] as unknown[],
  recorded: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock("@/server/db", () => ({
  getDbPool: () => ({ query: mocks.poolQuery, end: mocks.poolEnd }),
}));

vi.mock("dotenv", () => ({
  config: () => ({ parsed: {} }),
  default: { config: () => ({}) },
}));

const EVENT_ROW = {
  event_id: "evt-1",
  event_year: 1969,
  latitude: 38.9,
  longitude: -77.0,
  location_name: "Washington DC",
  image_url: "https://img.example/x.jpg",
  title: "Moon landing parade",
  country: "USA",
  continent: "North America",
  description: "A test description",
};

const HINT_ROWS = [
  {
    id: "hint-1",
    tier: 1,
    type: "when",
    content: "It happened in spring",
    metadata: null,
    display_order: 1,
  },
];

const HINT_TEXT_HASH = createHash("sha256")
  .update("It happened in spring")
  .digest("hex");

const TURN1_USAGE = {
  prompt_tokens: 10,
  completion_tokens: 5,
  completion_tokens_details: { reasoning_tokens: 2 },
  total_tokens: 15,
  cost: 0.001,
};

const CRITIQUE_USAGE = {
  prompt_tokens: 20,
  completion_tokens: 10,
  completion_tokens_details: { reasoning_tokens: 4 },
  total_tokens: 30,
  cost: 0.002,
};

function orJson(body: unknown, init?: { status?: number; retryAfter?: string }) {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Too Many Requests",
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "retry-after" ? init?.retryAfter ?? null : null,
    },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function modelReply(payload: unknown, usage: unknown) {
  return orJson({
    choices: [
      {
        finish_reason: "stop",
        message: { content: JSON.stringify(payload) },
      },
    ],
    usage,
  });
}

function queries(sqlIncludes: string) {
  return mocks.recorded.filter((q) => q.sql.includes(sqlIncludes));
}

let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleErr: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let savedArgv: string[];
let savedKey: string | undefined;
let savedTimerOverride: string | undefined;

function logs(): string {
  return consoleLog.mock.calls.map((c) => c.join(" ")).join("\n");
}

function errs(): string {
  return consoleErr.mock.calls.map((c) => c.join(" ")).join("\n");
}

async function runWorker(args: string[]): Promise<void> {
  vi.resetModules();
  mocks.recorded = [];
  mocks.poolEnd.mockClear();
  process.argv = ["node", "generate-answers-v3.ts", ...args];
  await import("./generate-answers-v3");
  const start = Date.now();
  while (exitSpy.mock.calls.length === 0 && mocks.poolEnd.mock.calls.length === 0) {
    if (Date.now() - start > 15000) {
      throw new Error(`worker did not finish\nLOGS:\n${logs()}\nERRS:\n${errs()}`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  // Flush trailing statements after a mocked process.exit / pool.end.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  savedArgv = process.argv;
  savedKey = process.env.OPENROUTER_API_KEY;
  savedTimerOverride = process.env.AI_V3_TIMER_OVERRIDE_MS;
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.AI_V3_TIMER_OVERRIDE_MS;

  mocks.orQueue = [];
  mocks.poolQuery.mockReset();
  mocks.poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    mocks.recorded.push({ sql, params: params ?? [] });
    if (sql.includes("INSERT INTO ai_answer_bank_calls")) return { rows: [] };
    if (sql.includes("INSERT INTO ai_answer_bank")) return { rows: [{ id: "bank-1" }] };
    if (sql.includes("INSERT INTO ai_hint_reviews")) return { rows: [] };
    if (sql.includes("INSERT INTO eval_facts"))
      return { rows: [{ evaluation_id: "eval-1" }] };
    if (sql.includes("FROM events")) return { rows: [EVENT_ROW] };
    if (sql.includes("FROM hints")) return { rows: HINT_ROWS };
    if (sql.includes("FROM ground_truth_versions")) return { rows: [{ id: "gtv-1" }] };
    if (sql.includes("FROM eval_stimuli")) return { rows: [{ id: "stim-1" }] };
    if (sql.includes("FROM ai_model_execution_manifests"))
      return { rows: [{ id: "man-1" }] };
    if (sql.includes("FROM ai_players")) return { rows: [{ id: "player-1" }] };
    if (sql.includes("INSERT INTO ai_players")) return { rows: [{ id: "player-1" }] };
    throw new Error(`unexpected query: ${sql}`);
  });

  mocks.fetchImpl.mockReset();
  mocks.fetchImpl.mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (!u.includes("openrouter")) {
      // Stimulus image fetch (resolveStimulus).
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        text: async () => "",
      };
    }
    const next = mocks.orQueue.shift();
    if (!next) throw new Error("unexpected OpenRouter fetch");
    return next;
  });
  vi.stubGlobal("fetch", mocks.fetchImpl);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.argv = savedArgv;
  if (savedKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = savedKey;
  }
  if (savedTimerOverride === undefined) {
    delete process.env.AI_V3_TIMER_OVERRIDE_MS;
  } else {
    process.env.AI_V3_TIMER_OVERRIDE_MS = savedTimerOverride;
  }
});

describe("generate-answers-v3 practice mode (E2/D2)", () => {
  it("(a) a hintRequests turn-1 reply with hints disabled writes the bad-output bank error row", async () => {
    mocks.orQueue = [
      modelReply({ hintRequests: [{ tier: 1, type: "when" }] }, TURN1_USAGE),
    ];
    await runWorker(["--mode=practice", "evt-1"]);

    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    const p = bankInserts[0].params;
    // Column order: ...error(3)...evaluation_id(12), play_mode(13), hints_off(14),
    // ...confidence(21), error_class(22) — see writeErrorResult.
    expect(p[3]).toBe("hints requested while hints disabled");
    expect(p[6]).toBe("[]"); // hints_requested
    expect(JSON.parse(String(p[7]))).toEqual({
      whenPenaltyRate: 0,
      wherePenaltyRate: 0,
      validHintCount: 0,
    });
    expect(p[13]).toBe("practice"); // play_mode
    expect(p[14]).toBe(true); // hints_off
    expect(p[19]).toBe(AI_PLAYER_TIMER_MS); // timer_ms
    expect(p[22]).toBe("transient"); // error_class = classifyOutcome
    expect(exitSpy).toHaveBeenCalledWith(1);

    // The turn-1 request payload must not offer a hint menu.
    const callRows = queries("INSERT INTO ai_answer_bank_calls");
    const turn1Call = callRows.find((q) => q.params[1] === 1);
    expect(turn1Call).toBeTruthy();
    const systemPrompt = String(
      (turn1Call!.params[2] as { messages: Array<{ content: string }> })
        .messages[0].content
    );
    expect(systemPrompt).not.toContain("hintRequests");
    expect(systemPrompt).not.toContain("Available hints");
    expect(systemPrompt).toContain('"confidence"');
  }, 25000);

  it("(c) a successful practice play writes play_mode/hints_off and the ai_hint_reviews row", async () => {
    mocks.orQueue = [
      modelReply(
        {
          finalGuess: { latitude: 40.1, longitude: -70.2, year: 1969, confidence: 0.7 },
          reasoning: "reasoning here",
        },
        TURN1_USAGE
      ),
      modelReply(
        {
          imageQualityScore: 8,
          imageQualityNotes: "sharp",
          difficultyScore: 6,
          difficultyNotes: "mid",
          authenticityScore: 9,
          authenticityNotes: "real",
          hintReviews: [
            {
              hintId: "hint-1",
              verdict: "correct",
              confidence: 0.8,
              explanation: "season fits",
              suggestedCorrection: null,
            },
          ],
        },
        CRITIQUE_USAGE
      ),
    ];
    await runWorker(["--mode=practice", "evt-1"]);

    expect(exitSpy).toHaveBeenCalledWith(0);

    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    const p = bankInserts[0].params;
    // writeResult order: error(12), hints_requested(15), hint_penalty_applied(16),
    // evaluation_id(21), play_mode(22), hints_off(23), total_cost_usd(24),
    // total_tokens(25), reasoning_tokens(26), latency_ms(27), timer_ms(28),
    // model_slug(29), confidence(30), error_class(31).
    expect(p[12]).toBeNull(); // error
    expect(p[15]).toBe("[]"); // hints_requested
    expect(JSON.parse(String(p[16]))).toEqual({
      whenPenaltyRate: 0,
      wherePenaltyRate: 0,
      validHintCount: 0,
    });
    expect(p[22]).toBe("practice");
    expect(p[23]).toBe(true);
    expect(Number(p[24])).toBeCloseTo(0.003, 6); // 0.001 + 0.002 summed
    expect(p[25]).toBe(45); // 15 + 30 total_tokens
    expect(p[26]).toBe(6); // 2 + 4 reasoning_tokens
    expect(p[27]).toBeGreaterThanOrEqual(0); // latency_ms
    expect(p[28]).toBe(AI_PLAYER_TIMER_MS);
    expect(p[29]).toBe("anthropic/claude-sonnet-4.6"); // default MODEL_ID
    expect(p[30]).toBe(0.7); // confidence
    expect(p[31]).toBeNull(); // error_class

    // eval_facts carries the summed usage across both calls.
    const evalInserts = queries("INSERT INTO eval_facts");
    expect(evalInserts).toHaveLength(1);
    const ef = evalInserts[0].params;
    expect(ef[10]).toBe(30); // prompt_tokens 10 + 20
    expect(ef[11]).toBe(15); // completion_tokens 5 + 10
    expect(ef[12]).toBe(6); // reasoning_tokens 2 + 4
    expect(ef[13]).toBe(45); // total_tokens 15 + 30
    expect(Number(ef[14])).toBeCloseTo(0.003, 6);
    expect(ef[28]).toBeNull(); // error

    // The review turn received the description + the hints with ids.
    const callRows = queries("INSERT INTO ai_answer_bank_calls");
    const turn3 = callRows.find((q) => q.params[1] === 3);
    expect(turn3).toBeTruthy();
    const reviewPayload = turn3!.params[2] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const reviewSystem = String(reviewPayload.messages[0].content);
    expect(reviewSystem).toContain("hintReviews");
    const reviewUser = reviewPayload.messages[1].content as Array<{ text?: string }>;
    const reviewText = reviewUser.map((c) => c.text ?? "").join("\n");
    expect(reviewText).toContain('id="hint-1"');
    expect(reviewText).toContain("A test description");

    // The parsed review row was inserted in ONE multi-row INSERT.
    const reviewInserts = queries("INSERT INTO ai_hint_reviews");
    expect(reviewInserts).toHaveLength(1);
    const rp = reviewInserts[0].params;
    // (event_id, ai_player_id, evaluation_id, hint_kind, hint_text_hash,
    //  verdict, confidence, explanation, suggested_correction)
    expect(rp[0]).toBe("evt-1");
    expect(rp[1]).toBe("player-1");
    expect(rp[2]).toBe("eval-1");
    expect(rp[3]).toBe("when");
    expect(rp[4]).toBe(HINT_TEXT_HASH);
    expect(rp[5]).toBe("correct");
    expect(rp[6]).toBe(0.8);
    expect(rp[7]).toBe("season fits");
    expect(rp[8]).toBeNull();
  }, 25000);
});

describe("generate-answers-v3 429 deferral (E1/D3)", () => {
  it("(b) a 429 on turn 1 exits 75 with the RATE_LIMIT_DEFERRED marker and no '429' in the bank error text", async () => {
    mocks.orQueue = [
      orJson(
        {
          error: {
            code: 429,
            message: "slow down",
            metadata: { provider_name: "test-provider", limit_source: "account" },
          },
        },
        { status: 429, retryAfter: "5" }
      ),
    ];
    await runWorker(["evt-1"]);

    expect(exitSpy).toHaveBeenCalledWith(75);
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    const deferred = "RATE_LIMIT_DEFERRED retry_after_ms=5000 test-provider/account";
    expect(errs()).toContain(deferred);

    // Bank error row: the error text is REPLACED by the marker and must not
    // contain "429" (admin_fleet_model_stats classifies with ILIKE '%429%').
    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    const p = bankInserts[0].params;
    expect(p[3]).toBe(deferred);
    expect(String(p[3])).not.toContain("429");
    expect(p[22]).toBe("rate_limit_deferred"); // error_class = classifyOutcome
    expect(p[13]).toBe("daily"); // play_mode
    expect(p[14]).toBe(false); // hints_off
    expect(p[21]).toBeNull(); // confidence

    // The per-call evidence keeps the full original 429 text.
    const callRows = queries("INSERT INTO ai_answer_bank_calls");
    expect(callRows).toHaveLength(1);
    const callError = String(callRows[0].params[5]);
    expect(callError).toContain(" 429 ");
    expect(callError).toContain("retry_after_ms=5000");

    // The eval_fact error keeps the original failure text too.
    const evalInserts = queries("INSERT INTO eval_facts");
    expect(evalInserts).toHaveLength(1);
    const evalError = String(evalInserts[0].params[28]);
    expect(evalError).toContain("OpenRouter turn 1 failed");
    expect(evalError).toContain(" 429 ");
  }, 25000);

  it("(b2) a HTTP-200 body carrying error.code=429 defers the same way", async () => {
    mocks.orQueue = [
      orJson(
        {
          error: {
            code: 429,
            message: "upstream free-tier limit",
            metadata: { provider_name: "upstream-x", limit_source: "provider" },
          },
        },
        { status: 200, retryAfter: "2" }
      ),
    ];
    await runWorker(["evt-1"]);

    expect(exitSpy).toHaveBeenCalledWith(75);
    const deferred = "RATE_LIMIT_DEFERRED retry_after_ms=2000 upstream-x/provider";
    expect(errs()).toContain(deferred);
    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    expect(bankInserts[0].params[3]).toBe(deferred);
    expect(String(bankInserts[0].params[3])).not.toContain("429");
  }, 25000);
});

describe("generate-answers-v3 pure helpers", () => {
  async function importForHelpers() {
    vi.resetModules();
    process.argv = ["node", "generate-answers-v3.ts"]; // no event id -> early exit
    return await import("./generate-answers-v3");
  }

  it("buildTurn1Messages omits the hint menu when hintsOff", async () => {
    const mod = await importForHelpers();
    const hints = [
      {
        id: "h1",
        event_id: "evt-1",
        tier: 1,
        type: "when",
        content: "c",
        metadata: null,
        display_order: 1,
      },
    ];
    const off = mod.buildTurn1Messages("https://img/x", hints, true) as Array<{
      role: string;
      content: unknown;
    }>;
    const offSystem = String(off[0].content);
    expect(offSystem).not.toContain("hintRequests");
    expect(offSystem).not.toContain("Available hints");
    expect(offSystem).toContain('"confidence"');

    const on = mod.buildTurn1Messages("https://img/x", hints, false) as Array<{
      role: string;
      content: unknown;
    }>;
    const onSystem = String(on[0].content);
    expect(onSystem).toContain("hintRequests");
    expect(onSystem).toContain("Available hints");
    expect(onSystem).toContain('"confidence"');
  });

  it("parseTurn1Response treats hintRequests as an error only when hintsOff", async () => {
    const mod = await importForHelpers();
    const body = JSON.stringify({ hintRequests: [{ tier: 1, type: "when" }] });
    const off = mod.parseTurn1Response(body, true);
    expect(off.kind).toBe("error");
    expect(off.kind === "error" ? off.error : "").toBe(
      "hints requested while hints disabled"
    );
    const on = mod.parseTurn1Response(body, false);
    expect(on.kind).toBe("hints");

    const guess = mod.parseTurn1Response(
      JSON.stringify({
        finalGuess: { latitude: 1, longitude: 2, year: 1900, confidence: 1.4 },
      }),
      true
    );
    expect(guess.kind).toBe("guess");
    // Out-of-range confidence collapses to null.
    expect(guess.kind === "guess" ? guess.finalGuess.confidence : "x").toBeNull();
  });

  it("isRateLimitErrorText matches the E1 failure shapes", async () => {
    const mod = await importForHelpers();
    expect(mod.isRateLimitErrorText("OpenRouter request failed: 429 Too Many Requests x")).toBe(true);
    expect(mod.isRateLimitErrorText('PROVIDER_ERROR: {"code":429,"message":"x"}')).toBe(true);
    expect(mod.isRateLimitErrorText("failed: 429")).toBe(true);
    expect(mod.isRateLimitErrorText("TRUNCATED_LENGTH: finish_reason=length")).toBe(false);
    expect(mod.isRateLimitErrorText("Failed to parse AI turn 1 response")).toBe(false);
    expect(mod.isRateLimitErrorText(null)).toBe(false);
  });

  it("buildRateLimitDeferredText never emits '429'", async () => {
    const mod = await importForHelpers();
    const text = mod.buildRateLimitDeferredText(
      "OpenRouter request failed: 429 Too Many Requests {} retry_after_ms=8000",
      { error: { code: 429, metadata: { provider_name: "prov", limit_source: "acc" } } }
    );
    expect(text).toBe("RATE_LIMIT_DEFERRED retry_after_ms=8000 prov/acc");
    expect(text).not.toContain("429");

    const fallback = mod.buildRateLimitDeferredText("x: 429", null);
    expect(fallback).toBe("RATE_LIMIT_DEFERRED retry_after_ms=unknown unknown/unknown");
  });
});
