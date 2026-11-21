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

describe("generate-answers-v3 worker SQL hardening (AIP-FIX-WORKERHARDEN-V3-1107-098)", () => {
  const rateLimited = () =>
    orJson(
      {
        error: {
          code: 429,
          message: "slow down",
          metadata: { provider_name: "test-provider", limit_source: "account" },
        },
      },
      { status: 429, retryAfter: "1" }
    );

  it("the single-event query orders images deterministically before LIMIT 1", async () => {
    mocks.orQueue = [rateLimited()];
    await runWorker(["evt-1"]);

    const eventQueries = queries("FROM events e");
    expect(eventQueries.length).toBeGreaterThan(0);
    expect(eventQueries[0].sql).toContain(
      "ORDER BY i.display_order ASC NULLS LAST, i.created_at ASC, i.id ASC"
    );
    expect(eventQueries[0].sql).toContain("LIMIT 1");
  }, 25000);

  it("ensureAiPlayer looks up only live players, oldest first", async () => {
    mocks.orQueue = [rateLimited()];
    await runWorker(["evt-1"]);

    const playerSelects = queries("FROM ai_players");
    expect(playerSelects.length).toBeGreaterThan(0);
    expect(playerSelects[0].sql).toContain("deleted_at IS NULL");
    expect(playerSelects[0].sql).toContain("ORDER BY created_at ASC");
  }, 25000);

  it("resolveManifest inserts ON CONFLICT and re-selects the winner row", async () => {
    const base = mocks.poolQuery.getMockImplementation()!;
    let manifestSelects = 0;
    mocks.poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT INTO ai_model_execution_manifests")) {
        mocks.recorded.push({ sql, params: params ?? [] });
        return { rows: [] }; // lost the insert race
      }
      if (sql.includes("FROM ai_model_execution_manifests")) {
        manifestSelects += 1;
        mocks.recorded.push({ sql, params: params ?? [] });
        return manifestSelects % 2 === 0
          ? { rows: [{ id: "man-winner" }] }
          : { rows: [] };
      }
      return base(sql, params);
    });
    mocks.orQueue = [rateLimited()];
    await runWorker(["evt-1"]);

    // Turn-1 429 still exits 75 — resolveManifest returned the winner id.
    expect(exitSpy).toHaveBeenCalledWith(75);
    const manifestInserts = queries("INSERT INTO ai_model_execution_manifests");
    expect(manifestInserts.length).toBeGreaterThan(0);
    for (const q of manifestInserts) {
      expect(q.sql).toContain("ON CONFLICT (content_hash) DO NOTHING");
      expect(q.sql).toContain("RETURNING id");
    }
    // SELECT -> INSERT(conflict) -> SELECT(winner) sequence happened.
    const manifestSelectsRecorded = queries("FROM ai_model_execution_manifests");
    expect(manifestSelectsRecorded.length).toBeGreaterThanOrEqual(2);
  }, 25000);
});

// AIP-BUILD-REASONINGGATE-1115-306 — bench-v1 worker proof. Same mocked
// harness; every bench reply carries message.reasoning so the provider-side
// reasoning trace exists (TURN1_USAGE reports reasoning_tokens=2).
describe("generate-answers-v3 bench-v1 mode", () => {
  const BENCH_RUN_ID = "123e4567-e89b-42d3-a456-426614174000";
  const BENCH_ARGS = [
    "--mode=practice",
    "--prompt-version=bench-v1",
    "--benchmark-run-id=" + BENCH_RUN_ID,
    "evt-1",
  ];
  const BENCH_REASONING =
    "The banner text and period dress suggest a 1960s civic event; the neoclassical facade and avenue layout place it in Washington DC.";
  const BENCH_TURN1 = {
    finalGuess: { latitude: 40.1, longitude: -70.2, year: 1969, confidence: 0.7 },
    reasoning: BENCH_REASONING,
    preReveal: {
      image_description: "A parade crowd in period dress",
      detected_clues: ["banner", "architecture"],
      year_reasoning: "vehicles and dress suggest 1960s",
      location_reasoning: "neoclassical buildings suggest DC",
    },
  };
  const BENCH_CRITIQUE = {
    imageQualityScore: 8,
    imageQualityNotes: "sharp",
    difficultyScore: 6,
    difficultyNotes: "mid",
    authenticityScore: 9,
    authenticityNotes: "real",
    postReveal: {
      difficulty_year: 7,
      difficulty_location: 6,
      hard_factors: ["generic crowd", "no landmark"],
      event_plausibility: 8,
      ai_image_depiction_score: 85,
      fame_score: 90,
      difficulty_notes: "crowd shots are ambiguous",
    },
  };

  function benchReply(payload: unknown, usage: unknown, reasoningText?: string) {
    return orJson({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify(payload),
            ...(reasoningText !== undefined ? { reasoning: reasoningText } : {}),
          },
        },
      ],
      usage,
    });
  }

  it("happy path: 2 calls, bench columns populated, prompt_version=bench-v1", async () => {
    mocks.orQueue = [
      benchReply(BENCH_TURN1, TURN1_USAGE, "provider trace text"),
      benchReply(BENCH_CRITIQUE, CRITIQUE_USAGE),
    ];
    await runWorker(BENCH_ARGS);

    expect(exitSpy).toHaveBeenCalledWith(0);
    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    const p = bankInserts[0].params;
    // 37-column bench INSERT: indices 32..36 are the new columns.
    expect(p).toHaveLength(37);
    expect(p[12]).toBeNull(); // error
    expect(p[22]).toBe("practice");
    expect(p[23]).toBe(true);
    expect(p[31]).toBeNull(); // error_class
    expect(p[32]).toBe("bench-v1"); // prompt_version
    expect(p[33]).toBe(BENCH_RUN_ID); // benchmark_run_id
    const sp = JSON.parse(String(p[34])); // structured_payload
    expect(sp.prompt_version).toBe("bench-v1");
    expect(sp.preReveal.image_description).toBe("A parade crowd in period dress");
    expect(sp.preReveal.detected_clues).toEqual(["banner", "architecture"]);
    expect(sp.postReveal.ai_image_depiction_score).toBe(85);
    expect(sp.postReveal.fame_score).toBe(90);
    expect(p[35]).toBe(85); // ai_image_depiction_score
    expect(p[36]).toBe(90); // fame_score

    // guess=turn1 + review=turn3 only (no retry needed).
    const callRows = queries("INSERT INTO ai_answer_bank_calls");
    expect(callRows).toHaveLength(2);
    expect(callRows.map((q) => q.params[1]).sort()).toEqual([1, 3]);
    const t1 = callRows.find((q) => q.params[1] === 1)!;
    const sysPrompt = String(
      (t1.params[2] as { messages: Array<{ content: string }> }).messages[0].content
    );
    expect(sysPrompt).toContain("preReveal");
    expect(sysPrompt).not.toContain("hintRequests");
    expect(sysPrompt).not.toContain("Available hints");

    // eval_facts reasoning_trace carries the provider reasoning text.
    const ef = queries("INSERT INTO eval_facts")[0].params;
    expect(ef[15]).toBe(true); // reasoning_trace_available
    expect(String(ef[16])).toContain("provider trace text");
  }, 25000);

  it("gate failure retries the guess turn once: fail then success = 3 calls", async () => {
    const bad = { hintRequests: [{ tier: 1, type: "when" }] }; // -> missing_fields
    mocks.orQueue = [
      benchReply(bad, TURN1_USAGE, "trace"),
      benchReply(BENCH_TURN1, TURN1_USAGE, "trace"),
      benchReply(BENCH_CRITIQUE, CRITIQUE_USAGE),
    ];
    await runWorker(BENCH_ARGS);

    expect(exitSpy).toHaveBeenCalledWith(0);
    const callRows = queries("INSERT INTO ai_answer_bank_calls");
    expect(callRows).toHaveLength(3);
    expect(callRows.map((q) => q.params[1]).sort()).toEqual([1, 2, 3]);
    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    expect(bankInserts[0].params[32]).toBe("bench-v1");
  }, 25000);

  it("gate failure twice writes a final error row with explicit error_class", async () => {
    const shortReasoning = { ...BENCH_TURN1, reasoning: "tiny" };
    mocks.orQueue = [
      benchReply(shortReasoning, TURN1_USAGE, "trace"),
      benchReply(shortReasoning, TURN1_USAGE, "trace"),
    ];
    await runWorker(BENCH_ARGS);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    const p = bankInserts[0].params;
    // writeErrorResult 23-column layout: error(3), error_class(22).
    expect(String(p[3]).startsWith("NO_REASONING: ")).toBe(true);
    expect(p[22]).toBe("no_reasoning");
    // guess + retry only — the review turn never ran.
    const callRows = queries("INSERT INTO ai_answer_bank_calls");
    expect(callRows).toHaveLength(2);
    expect(callRows.map((q) => q.params[1]).sort()).toEqual([1, 2]);
  }, 25000);

  it("missing_fields gate failure writes error_class=missing_fields", async () => {
    const noPreReveal = { ...BENCH_TURN1 };
    delete (noPreReveal as Record<string, unknown>).preReveal;
    mocks.orQueue = [
      benchReply(noPreReveal, TURN1_USAGE, "trace"),
      benchReply(noPreReveal, TURN1_USAGE, "trace"),
    ];
    await runWorker(BENCH_ARGS);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const p = queries("INSERT INTO ai_answer_bank (")[0].params;
    expect(String(p[3]).startsWith("MISSING_FIELDS: ")).toBe(true);
    expect(String(p[3])).toContain("preReveal");
    expect(p[22]).toBe("missing_fields");
  }, 25000);

  it("rejects hints-on / non-practice / bad prompt-version before any call", async () => {
    // daily mode => hints on => hard error before DB/fetch.
    await runWorker(["--prompt-version=bench-v1", "evt-1"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.fetchImpl).not.toHaveBeenCalled();
    expect(mocks.recorded).toHaveLength(0);

    exitSpy.mockClear();
    mocks.fetchImpl.mockClear();
    await runWorker(["--mode=practice", "--prompt-version=bench-v2", "evt-1"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.fetchImpl).not.toHaveBeenCalled();

    exitSpy.mockClear();
    mocks.fetchImpl.mockClear();
    await runWorker(["--mode=practice", "--prompt-version=bench-v1", "--timer-sec=5", "evt-1"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.fetchImpl).not.toHaveBeenCalled();
  }, 25000);
});

describe("generate-answers-v3 legacy path unchanged (bench flag absent)", () => {
  it("buildTurn1Messages(hintsOff) and buildCritiqueMessages are byte-identical to pre-change output", async () => {
    vi.resetModules();
    process.argv = ["node", "generate-answers-v3.ts"]; // no event id -> early exit
    const mod = await import("./generate-answers-v3");
    const hints = [
      {
        id: "hint-1",
        event_id: "evt-1",
        tier: 1,
        type: "when",
        content: "It happened in spring",
        metadata: null,
        display_order: 1,
      },
    ];

    // Exact pre-change turn-1 (hints OFF) messages.
    const turn1 = mod.buildTurn1Messages("https://img/x", hints, true);
    expect(JSON.stringify(turn1)).toBe(
      JSON.stringify([
        {
          role: "system",
          content:
            "You are a geospatial and historical reasoning assistant. You will be shown an image. " +
            "Your task is to determine where (latitude and longitude) and when (year) the depicted historical event occurred.\n\n" +
            "Submit a final guess. Respond with JSON only (no markdown). Use exactly this shape:\n\n" +
            "Final guess:\n" +
            '{"finalGuess": {"latitude": number, "longitude": number, "year": integer, "confidence": number 0-1 (optional)}, "reasoning": "your concise reasoning"}',
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://img/x", detail: "auto" } },
            { type: "text", text: "What is your guess?" },
          ],
        },
      ])
    );

    // Exact pre-change critique messages (with one hint -> hintReviews block).
    const critique = mod.buildCritiqueMessages(
      "https://img/x",
      { lat: 38.9, lng: -77.0, year: 1969, locationName: "Washington DC" },
      "Moon landing parade",
      "Washington DC",
      "A test description",
      hints
    );
    expect(JSON.stringify(critique)).toBe(
      JSON.stringify([
        {
          role: "system",
          content:
            "You are evaluating the provided historical image after the true answer has been revealed. " +
            "Assess three things and return a single JSON object with exactly these keys:\n" +
            "  - imageQualityScore (integer 1-10): how accurately the image depicts the known historical event.\n" +
            "  - imageQualityNotes (string): brief explanation for the image quality score.\n" +
            "  - difficultyScore (integer 1-10): how hard the image would be for a skilled player to geolocate and date correctly before seeing the answer, considering visual ambiguity, common/generic subject matter, lack of identifying landmarks, etc.\n" +
            "  - difficultyNotes (string): brief explanation for the difficulty score.\n" +
            "  - authenticityScore (integer 1-10): how confident you are that the depicted event is a real historical event, as opposed to a staged photo, movie/TV still, reenactment, or AI-generated image.\n" +
            "  - authenticityNotes (string): brief explanation for the authenticity score.\n" +
            "  - hintReviews (array): one entry per hint listed in the user prompt, each " +
            '{"hintId": string (the hint\'s id), "verdict": "correct" | "incorrect" | "unverifiable" | "partially_correct", ' +
            '"confidence": number 0-1, "explanation": string, "suggestedCorrection": string | null} ' +
            "judging whether the hint text is accurate given the image and the revealed truth.\n" +
            "\nRespond with JSON only (no markdown).",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://img/x", detail: "auto" } },
            {
              type: "text",
              text:
                "The correct answer is: latitude 38.9, longitude -77, year 1969 (Washington DC). " +
                'Event title: "Moon landing parade". Event description: "A test description".\n\n' +
                "Rate the image quality, guess difficulty, and authenticity of the depicted event. " +
                "Provide JSON with imageQualityScore, imageQualityNotes, difficultyScore, difficultyNotes, authenticityScore, and authenticityNotes, and hintReviews." +
                "\n\nThe event's hints (id — tier — type — content). Review each against the image and the revealed answer:\n" +
                '- id="hint-1" (tier 1 when): "It happened in spring"',
            },
          ],
        },
      ])
    );
  }, 25000);

  it("legacy success run writes the original 32-column row — no bench fields", async () => {
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
        },
        CRITIQUE_USAGE
      ),
    ];
    await runWorker(["--mode=practice", "evt-1"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    const bankInserts = queries("INSERT INTO ai_answer_bank (");
    expect(bankInserts).toHaveLength(1);
    // Original writeResult has exactly 32 bound params — no bench columns.
    expect(bankInserts[0].params).toHaveLength(32);
    expect(bankInserts[0].sql).not.toContain("prompt_version");
    expect(bankInserts[0].sql).not.toContain("structured_payload");
    expect(bankInserts[0].sql).not.toContain("benchmark_run_id");
  }, 25000);
});
