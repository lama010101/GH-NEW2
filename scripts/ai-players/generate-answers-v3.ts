import { config } from "dotenv";
import { createHash } from "crypto";
import { getDbPool } from "@/server/db";
import { evaluateRound } from "@/core/rules";
import type { EventRecord, EventHint, Location } from "@/core/types";
import { TIER_PENALTY_RATE } from "@/core/hintPenalties";
import { AI_PLAYER_TIMER_MS as DAILY_TIMER_MS, AI_WORKER_CRITIQUE_CAP_MS } from "@/core/aiPlayers";
import { classifyOutcome, parseRetryAfterMs } from "@/core/aiRateBudget";
import { RATE_LIMIT_DEFERRED_MARKER } from "@/core/aiFailureCauses";
import { parseHintReviews, type HintReviewRow } from "@/core/aiHintReview";
import { sumUsage, type UsageTotals } from "@/core/aiUsage";
import { assertPracticeHintsOff } from "@/core/aiWorkQueue";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4.6";
const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_AI_PLAYER_NAME = "Claude Sonnet 4.6";

// Live Daily default timer — single-sourced in src/core/aiPlayers.ts.

// AIP-BUILD-AITIMERWORKERS-1011-004: enforced deadline = --timer-sec=<n> flag
// (seconds), else the test-only AI_V3_TIMER_OVERRIDE_MS (ms), else the core
// 90s constant.
const DEADLINE_MS = (() => {
  const flagArg = process.argv.slice(2).find((a) => a.startsWith("--timer-sec="));
  if (flagArg) {
    const parsed = Number(flagArg.slice("--timer-sec=".length));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 1000);
  }
  const override = process.env.AI_V3_TIMER_OVERRIDE_MS;
  if (!override) return DAILY_TIMER_MS;
  const parsed = Number(override);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DAILY_TIMER_MS;
})();

// Critique turn hard cap — excluded from the answer-timer budget accounting
// but bounded so it can never hang a worker. Single-sourced in
// src/core/aiPlayers.ts so the supervisor's hard-kill budget shares it
// (AIP-FIX-AITIMERKILL-1011-008).
const CRITIQUE_TIMEOUT_MS = AI_WORKER_CRITIQUE_CAP_MS;

const DETAIL_MODE = "auto";

const MAX_TOKENS_FIRST_ATTEMPT = 4096;
const MAX_TOKENS_RETRY = 8192;
const MAX_TOKEN_ATTEMPTS = [MAX_TOKENS_FIRST_ATTEMPT, MAX_TOKENS_RETRY] as const;

type HintRequest = { tier: number; type: string };
type SuppliedHint = { id: string; tier: number; type: string; content: string };

type FinalGuess = {
  latitude: number;
  longitude: number;
  year: number;
  /** Model self-rated confidence 0-1; null when absent/invalid (E2). */
  confidence: number | null;
};

type TurnResult =
  | { kind: "guess"; finalGuess: FinalGuess; reasoning: string | null }
  | { kind: "hints"; hintRequests: HintRequest[] }
  | { kind: "error"; error: string };

type OpenRouterUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
};

type OpenRouterCallResult = {
  content: string;
  rawResponse: unknown;
  error?: string;
  requestStartedAt: Date;
  responseReceivedAt: Date;
  usage: OpenRouterUsage;
  reasoning: string | null;
  reasoningAvailable: boolean;
  maxTokensUsed: number;
};

type ManifestRequest = {
  provider: string;
  model_id: string;
  messages: unknown[];
  temperature: number;
  max_tokens: number;
};

function parseArgs(): {
  eventId: string;
  modelId: string;
  provider: string;
  playerName: string;
  mode: string;
  noHints: boolean;
} {
  const args = process.argv.slice(2);
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq > 2 ? arg.slice(2, eq) : arg.slice(2);
      const value = eq > 2 ? arg.slice(eq + 1) : "";
      flags.set(key, value);
    } else {
      positional.push(arg);
    }
  }
  return {
    eventId: positional[0] ?? "",
    modelId: flags.get("model") ?? DEFAULT_MODEL_ID,
    provider: flags.get("provider") ?? DEFAULT_PROVIDER,
    playerName: flags.get("player-name") ?? DEFAULT_AI_PLAYER_NAME,
    mode: flags.get("mode") ?? "daily",
    noHints: flags.has("no-hints"),
  };
}

const parsedArgs = parseArgs();
const MODEL_ID = parsedArgs.modelId;
const PROVIDER = parsedArgs.provider;
const AI_PLAYER_NAME = parsedArgs.playerName;
// E2/D2: --mode=practice forces hints OFF; --no-hints also forces hints OFF.
// The raw string is validated inside main() before any write can run.
const MODE: "daily" | "practice" = parsedArgs.mode === "practice" ? "practice" : "daily";
const HINTS_OFF = MODE === "practice" || parsedArgs.noHints;

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("OPENROUTER_API_KEY is missing. Set it in the environment or .env.local and rerun.");
    process.exit(1);
    return;
  }

  const eventId = parsedArgs.eventId;
  if (!eventId) {
    console.error(
      "Usage: tsx scripts/ai-players/generate-answers-v3.ts [--model=<slug>] [--provider=<provider>] [--player-name=<name>] [--timer-sec=<seconds>] [--mode=daily|practice] [--no-hints] <event-id>"
    );
    process.exit(1);
    return;
  }

  if (parsedArgs.mode !== "daily" && parsedArgs.mode !== "practice") {
    console.error(`Invalid --mode=${parsedArgs.mode} (expected daily|practice)`);
    process.exit(1);
    return;
  }

  const pool = getDbPool();

  const eventResult = await pool.query<{
    event_id: string;
    event_year: number;
    latitude: number;
    longitude: number;
    location_name: string | null;
    image_url: string | null;
    title: string | null;
    country: string | null;
    continent: string | null;
    description: string | null;
  }>(
    `SELECT
      e.id AS event_id,
      e.event_year,
      l.latitude,
      l.longitude,
      l.display_name AS location_name,
      i.url AS image_url,
      e.title,
      e.description,
      l.country,
      l.continent
     FROM events e
     JOIN locations l ON l.event_id = e.id
     LEFT JOIN images i ON i.event_id = e.id
     WHERE e.id = $1
       AND e.status = 'validated'
       AND l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL
     ORDER BY i.display_order ASC NULLS LAST, i.created_at ASC, i.id ASC
     LIMIT 1`,
    [eventId]
  );

  if (eventResult.rows.length === 0) {
    console.error(`No validated event found with id ${eventId}`);
    process.exit(1);
    return;
  }

  const row = eventResult.rows[0];
  if (!row.image_url) {
    console.error(`Event ${eventId} has no image_url`);
    process.exit(1);
    return;
  }

  const hintsResult = await pool.query<{
    id: string;
    tier: number;
    type: string;
    content: string;
    metadata: Record<string, unknown> | null;
    display_order: number;
  }>(
    `SELECT id, tier, type, content, metadata, display_order
     FROM hints
     WHERE event_id = $1
     ORDER BY tier, type, display_order`,
    [eventId]
  );
  const hints: EventHint[] = hintsResult.rows.map((h) => ({
    id: h.id,
    event_id: eventId,
    tier: h.tier,
    type: h.type,
    content: h.content,
    metadata: h.metadata,
    display_order: h.display_order,
  }));

  const trueAnswer = {
    lat: row.latitude,
    lng: row.longitude,
    year: row.event_year,
    locationName: row.location_name,
  };

  const location: Location = {
    id: row.event_id,
    name: row.location_name ?? "",
    lat: row.latitude,
    lng: row.longitude,
  };

  const eventRecord: EventRecord = {
    id: row.event_id,
    title: row.title ?? "",
    description: row.description ?? "",
    year: row.event_year,
    location,
    region: row.continent ?? row.country ?? "",
    imageUrl: row.image_url,
    thumbUrl: null,
    hints,
  };

  console.log("True answer:", JSON.stringify(trueAnswer));

  const groundTruthVersionId = await resolveGroundTruthVersion(pool, row);
  const stimulusId = await resolveStimulus(pool, row.image_url, DETAIL_MODE);

  const referenceYear = new Date().getFullYear();
  const turnStart = Date.now();
  const calls: Array<{
    turn_index: number;
    request_payload: unknown;
    response_payload: unknown;
    duration_ms: number;
    error: string | null;
  }> = [];

  // D6: usage/cost columns on eval_facts and ai_answer_bank are the SUM across
  // every call made so far (guess turn, optional hint turn, review turn).
  const usageSoFar = (): UsageTotals => sumUsage(calls.map((c) => c.response_payload));
  const latencySoFarMs = (): number => calls.reduce((acc, c) => acc + c.duration_ms, 0);

  const turn1Messages = buildTurn1Messages(row.image_url, hints, HINTS_OFF);
  const turn1 = await callOpenRouter(apiKey, turn1Messages, 1, calls, Math.max(DEADLINE_MS - (Date.now() - turnStart), 1));
  // Manifest provenance: record the max_tokens of the attempt that produced
  // this content (a retry means MAX_TOKENS_RETRY), not a fixed first-attempt budget.
  const turn1ManifestId = await resolveManifest(pool, {
    provider: PROVIDER,
    model_id: MODEL_ID,
    messages: turn1Messages,
    temperature: 0.2,
    max_tokens: turn1.maxTokensUsed,
  });
  let finalGuess: FinalGuess | null = null;
  let finalReasoning: string | null = null;
  let suppliedHints: SuppliedHint[] = [];
  let finalCall: OpenRouterCallResult = turn1;
  let finalManifestId: string = turn1ManifestId;
  let timedOut = false;
  let timeToGuessMs: number | null = null;

  if (turn1.error) {
    if (turn1.error.startsWith("TIMEOUT_DEADLINE:")) {
      // Timer budget exhausted mid-call — record a timeout row, not an error row.
      timedOut = true;
      console.log(`Timer deadline hit during turn 1 call: ${turn1.error}`);
    } else {
    // E1: a 429 defers the play — the eval_fact keeps the original error text
    // while the bank row carries the RATE_LIMIT_DEFERRED marker (which must not
    // contain "429": admin_fleet_model_stats classifies with ILIKE '%429%'),
    // then exit 75 for the supervisor. Never retried in-worker.
    const deferredText = isRateLimitErrorText(turn1.error)
      ? buildRateLimitDeferredText(turn1.error, turn1.rawResponse)
      : null;
    const evaluationId = await writeErrorEvalFact(pool, {
      eventId: row.event_id,
      aiPlayerId: await ensureAiPlayer(pool),
      manifestId: turn1ManifestId,
      groundTruthVersionId,
      stimulusId,
      callResult: turn1,
      suppliedHints: [],
      imageQualityScore: null,
      imageQualityNotes: null,
      critiqueError: `OpenRouter turn 1 failed: ${turn1.error}`,
      difficultyScore: null,
      difficultyNotes: null,
      authenticityScore: null,
      authenticityNotes: null,
      authenticityError: null,
      finalGuess: null,
      error: `OpenRouter turn 1 failed: ${turn1.error}`,
      usageTotals: usageSoFar(),
    });
    // AIP-FIX-TRUNCATION-REASONINGBUDGET-1010-002: still-truncated responses are
    // recorded in eval_facts (above) but write no ai_answer_bank row.
    if (!turn1.error.startsWith("TRUNCATED_LENGTH:")) {
      await writeErrorResult(pool, evaluationId, row.event_id, calls, deferredText ?? `OpenRouter turn 1 failed: ${turn1.error}`);
    }
    if (deferredText !== null) {
      console.error(deferredText);
      process.exit(75);
      return;
    }
    console.error(`OpenRouter turn 1 failed: ${turn1.error}`);
    process.exit(1);
    return;
    }
  }

  const turn1Parse = timedOut
    ? ({ kind: "hints", hintRequests: [] } as TurnResult)
    : parseTurn1Response(turn1.content, HINTS_OFF);
  if (turn1Parse.kind === "error") {
    const deferredText = isRateLimitErrorText(turn1Parse.error)
      ? buildRateLimitDeferredText(turn1Parse.error, turn1.rawResponse)
      : null;
    const evaluationId = await writeErrorEvalFact(pool, {
      eventId: row.event_id,
      aiPlayerId: await ensureAiPlayer(pool),
      manifestId: turn1ManifestId,
      groundTruthVersionId,
      stimulusId,
      callResult: turn1,
      suppliedHints: [],
      imageQualityScore: null,
      imageQualityNotes: null,
      critiqueError: null,
      difficultyScore: null,
      difficultyNotes: null,
      authenticityScore: null,
      authenticityNotes: null,
      authenticityError: null,
      finalGuess: null,
      error: turn1Parse.error,
      usageTotals: usageSoFar(),
    });
    await writeErrorResult(pool, evaluationId, row.event_id, calls, deferredText ?? turn1Parse.error);
    if (deferredText !== null) {
      console.error(deferredText);
      process.exit(75);
      return;
    }
    console.error(turn1Parse.error);
    process.exit(1);
    return;
  }

  if (turn1Parse.kind === "guess") {
    finalGuess = turn1Parse.finalGuess;
    finalReasoning = turn1Parse.reasoning;
    timeToGuessMs = Date.now() - turnStart;
  } else {
    const elapsedAfterTurn1 = Date.now() - turnStart;
    if (elapsedAfterTurn1 >= DEADLINE_MS || HINTS_OFF) {
      // HINTS_OFF: kind 'hints' can only come from the synthetic timedOut
      // result above — parseTurn1Response never yields it and suppliedHints
      // stays [] (D2 practice = hints OFF).
      timedOut = true;
      console.log(`Timeout after turn 1 at ${elapsedAfterTurn1}ms`);
    } else {
      const hintRequests = turn1Parse.hintRequests;
      const { supplied, missing } = resolveHintRequests(hints, hintRequests);
      suppliedHints = supplied;

      if (missing.length > 0) {
        console.warn(
          `Requested hint tier/type not found: ${missing.map((m) => `tier=${m.tier} type=${m.type}`).join(", ")}`
        );
      }

      const turn2Messages = buildTurn2Messages(turn1Messages, turn1.content, supplied);
      const turn2 = await callOpenRouter(apiKey, turn2Messages, 2, calls, Math.max(DEADLINE_MS - (Date.now() - turnStart), 1));
      const turn2ManifestId = await resolveManifest(pool, {
        provider: PROVIDER,
        model_id: MODEL_ID,
        messages: turn2Messages,
        temperature: 0.2,
        max_tokens: turn2.maxTokensUsed,
      });
      finalManifestId = turn2ManifestId;
      finalCall = turn2;

      if (turn2.error) {
        if (turn2.error.startsWith("TIMEOUT_DEADLINE:")) {
          // Timer budget exhausted mid-call — record a timeout row, not an error row.
          timedOut = true;
          console.log(`Timer deadline hit during turn 2 call: ${turn2.error}`);
        } else {
        const deferredText = isRateLimitErrorText(turn2.error)
          ? buildRateLimitDeferredText(turn2.error, turn2.rawResponse)
          : null;
        const evaluationId = await writeErrorEvalFact(pool, {
          eventId: row.event_id,
          aiPlayerId: await ensureAiPlayer(pool),
          manifestId: finalManifestId,
          groundTruthVersionId,
          stimulusId,
          callResult: finalCall,
          suppliedHints,
          imageQualityScore: null,
          imageQualityNotes: null,
          critiqueError: `OpenRouter turn 2 failed: ${turn2.error}`,
          difficultyScore: null,
          difficultyNotes: null,
          authenticityScore: null,
          authenticityNotes: null,
          authenticityError: null,
          finalGuess: null,
          error: `OpenRouter turn 2 failed: ${turn2.error}`,
          usageTotals: usageSoFar(),
        });
        // AIP-FIX-TRUNCATION-REASONINGBUDGET-1010-002: still-truncated responses are
        // recorded in eval_facts (above) but write no ai_answer_bank row.
        if (!turn2.error.startsWith("TRUNCATED_LENGTH:")) {
          await writeErrorResult(pool, evaluationId, row.event_id, calls, deferredText ?? `OpenRouter turn 2 failed: ${turn2.error}`);
        }
        if (deferredText !== null) {
          console.error(deferredText);
          process.exit(75);
          return;
        }
        console.error(`OpenRouter turn 2 failed: ${turn2.error}`);
        process.exit(1);
        return;
        }
      }

      if (!timedOut) {
      const turn2Parse = parseFinalGuessResponse(turn2.content);
      if (turn2Parse.kind === "error") {
        const deferredText = isRateLimitErrorText(turn2Parse.error)
          ? buildRateLimitDeferredText(turn2Parse.error, turn2.rawResponse)
          : null;
        const evaluationId = await writeErrorEvalFact(pool, {
          eventId: row.event_id,
          aiPlayerId: await ensureAiPlayer(pool),
          manifestId: finalManifestId,
          groundTruthVersionId,
          stimulusId,
          callResult: finalCall,
          suppliedHints,
          imageQualityScore: null,
          imageQualityNotes: null,
          critiqueError: null,
          difficultyScore: null,
          difficultyNotes: null,
          authenticityScore: null,
          authenticityNotes: null,
          authenticityError: null,
          finalGuess: null,
          error: turn2Parse.error,
          usageTotals: usageSoFar(),
        });
        await writeErrorResult(pool, evaluationId, row.event_id, calls, deferredText ?? turn2Parse.error);
        if (deferredText !== null) {
          console.error(deferredText);
          process.exit(75);
          return;
        }
        console.error(turn2Parse.error);
        process.exit(1);
        return;
      }
      if (turn2Parse.kind !== "guess") {
        const err = "Unexpected turn 2 response kind";
        const deferredText = isRateLimitErrorText(err)
          ? buildRateLimitDeferredText(err, turn2.rawResponse)
          : null;
        const evaluationId = await writeErrorEvalFact(pool, {
          eventId: row.event_id,
          aiPlayerId: await ensureAiPlayer(pool),
          manifestId: finalManifestId,
          groundTruthVersionId,
          stimulusId,
          callResult: finalCall,
          suppliedHints,
          imageQualityScore: null,
          imageQualityNotes: null,
          critiqueError: null,
          difficultyScore: null,
          difficultyNotes: null,
          authenticityScore: null,
          authenticityNotes: null,
          authenticityError: null,
          finalGuess: null,
          error: err,
          usageTotals: usageSoFar(),
        });
        await writeErrorResult(pool, evaluationId, row.event_id, calls, deferredText ?? err);
        if (deferredText !== null) {
          console.error(deferredText);
          process.exit(75);
          return;
        }
        console.error(err, turn2Parse.kind);
        process.exit(1);
        return;
      }

      finalGuess = turn2Parse.finalGuess;
      finalReasoning = turn2Parse.reasoning;
      timeToGuessMs = Date.now() - turnStart;
      }
    }
  }

  if (!timedOut && finalGuess) {
    const elapsed = timeToGuessMs ?? Date.now() - turnStart;
    if (elapsed > DEADLINE_MS) {
      timedOut = true;
      console.log(`Timeout after final guess at ${elapsed}ms`);
    }
  }

  const critiqueMessages = buildCritiqueMessages(
    row.image_url,
    trueAnswer,
    row.title ?? "",
    row.location_name ?? "",
    row.description ?? null,
    hints
  );
  const critique = await callOpenRouter(apiKey, critiqueMessages, 3, calls, CRITIQUE_TIMEOUT_MS);
  const critiqueManifestId = await resolveManifest(pool, {
    provider: PROVIDER,
    model_id: MODEL_ID,
    messages: critiqueMessages,
    temperature: 0.2,
    max_tokens: critique.maxTokensUsed,
  });

  // E1: a 429 on the review turn defers the whole play — same eval_fact + bank
  // error row (marker text), exit 75. The bank row keeps the UNIQUE slot so a
  // later retry overwrites it cleanly. Never retried in-worker.
  if (critique.error && isRateLimitErrorText(critique.error)) {
    const deferredText = buildRateLimitDeferredText(critique.error, critique.rawResponse);
    const evaluationId = await writeErrorEvalFact(pool, {
      eventId: row.event_id,
      aiPlayerId: await ensureAiPlayer(pool),
      manifestId: critiqueManifestId,
      groundTruthVersionId,
      stimulusId,
      callResult: critique,
      suppliedHints,
      imageQualityScore: null,
      imageQualityNotes: null,
      critiqueError: `OpenRouter turn 3 failed: ${critique.error}`,
      difficultyScore: null,
      difficultyNotes: null,
      authenticityScore: null,
      authenticityNotes: null,
      authenticityError: null,
      finalGuess: null,
      error: `OpenRouter turn 3 failed: ${critique.error}`,
      usageTotals: usageSoFar(),
    });
    await writeErrorResult(pool, evaluationId, row.event_id, calls, deferredText);
    console.error(deferredText);
    process.exit(75);
    return;
  }

  const critiqueParse = critique.error
    ? { imageQualityScore: null as number | null, imageQualityNotes: null as string | null, difficultyScore: null as number | null, difficultyNotes: null as string | null, authenticityScore: null as number | null, authenticityNotes: null as string | null, error: `OpenRouter turn 3 failed: ${critique.error}` }
    : parseCritiqueResponse(critique.content);

  let imageQualityScore: number | null = null;
  let imageQualityNotes: string | null = null;
  let difficultyScore: number | null = null;
  let difficultyNotes: string | null = null;
  let authenticityScore: number | null = null;
  let authenticityNotes: string | null = null;
  let critiqueError: string | null = null;
  let authenticityError: string | null = null;

  if (critiqueParse.error) {
    critiqueError = critiqueParse.error;
    console.warn(`Critique error: ${critiqueParse.error}`);
  } else {
    imageQualityScore = critiqueParse.imageQualityScore;
    imageQualityNotes = critiqueParse.imageQualityNotes;
    difficultyScore = critiqueParse.difficultyScore;
    difficultyNotes = critiqueParse.difficultyNotes;
    authenticityScore = critiqueParse.authenticityScore;
    authenticityNotes = critiqueParse.authenticityNotes;
    if (critiqueParse.authenticityError) {
      authenticityError = critiqueParse.authenticityError;
      console.warn(`Authenticity/difficulty error: ${critiqueParse.authenticityError}`);
    }
  }

  // D5/E2: per-hint reviews are parsed off the RAW review text by
  // src/core/aiHintReview.ts. Parse problems append a note to critiqueError —
  // a hint-review failure never fails the play.
  let hintReviewRows: HintReviewRow[] = [];
  if (!critique.error && hints.length > 0) {
    try {
      hintReviewRows = parseHintReviews(critique.content, hints);
      if (hintReviewRows.length === 0) {
        const note = "hint review parse: no valid hintReviews entries in review response";
        critiqueError = critiqueError === null ? note : `${critiqueError}; ${note}`;
      }
    } catch (hintReviewErr) {
      const note = `hint review parse failed: ${hintReviewErr instanceof Error ? hintReviewErr.message : String(hintReviewErr)}`;
      critiqueError = critiqueError === null ? note : `${critiqueError}; ${note}`;
    }
  }

  if (timedOut || !finalGuess) {
    const timeoutMs = DEADLINE_MS;
    const result = evaluateRound(
      eventRecord,
      { year: null, location: null },
      0,
      true,
      0,
      0,
      referenceYear
    );

    const aiPlayerId = await ensureAiPlayer(pool);
    const evaluationId = await writeEvalFact(pool, {
      eventId: row.event_id,
      aiPlayerId,
      humanPlayerId: null,
      manifestId: finalManifestId,
      groundTruthVersionId,
      stimulusId,
      callResult: finalCall,
      finalGuess: null,
      suppliedHints: [],
      imageQualityScore,
      imageQualityNotes,
      critiqueError,
      difficultyScore,
      difficultyNotes,
      authenticityScore,
      authenticityNotes,
      authenticityError,
      error: null,
      usageTotals: usageSoFar(),
    });

    // D2 code-side guard: a practice row must carry hints_off, no hints and
    // zero penalties (a no-op for daily rows).
    assertPracticeHintsOff({
      play_mode: MODE,
      hints_off: HINTS_OFF,
      hints_requested: [],
      hint_penalty_applied: { whenPenaltyRate: 0, wherePenaltyRate: 0, validHintCount: 0 },
    });

    const answerBankId = await writeResult(pool, {
      evaluationId,
      eventId: row.event_id,
      aiPlayerId,
      result,
      referenceYear,
      reasoning: null,
      hintsRequested: [],
      hintPenaltyApplied: { whenPenaltyRate: 0, wherePenaltyRate: 0, validHintCount: 0 },
      timeToGuessMs: timeoutMs,
      imageQualityScore,
      imageQualityNotes,
      critiqueError,
      rawLlmResponse: finalCall.rawResponse,
      confidence: null,
      usageTotals: usageSoFar(),
      latencyMs: latencySoFarMs(),
    });
    await writeCalls(pool, answerBankId, calls);
    await insertHintReviews(pool, row.event_id, aiPlayerId, evaluationId, hintReviewRows);

    console.log("Stored timeout result for event", row.event_id, "ai_player", aiPlayerId, "time_to_guess_ms", timeoutMs);
    await pool.end();
    process.exit(0);
  }

  let whenPenaltyRate = 0;
  let wherePenaltyRate = 0;
  for (const h of suppliedHints) {
    const p = TIER_PENALTY_RATE[h.tier] ?? 0;
    if (h.type === "when") whenPenaltyRate += p;
    if (h.type === "where") wherePenaltyRate += p;
  }
  whenPenaltyRate = Math.min(whenPenaltyRate, 100);
  wherePenaltyRate = Math.min(wherePenaltyRate, 100);

  const result = evaluateRound(
    eventRecord,
    { year: finalGuess.year, location: { lat: finalGuess.latitude, lng: finalGuess.longitude } },
    0,
    false,
    whenPenaltyRate,
    wherePenaltyRate,
    referenceYear
  );

  const aiPlayerId = await ensureAiPlayer(pool);

  const hintsRequestedPayload = suppliedHints.map((h) => ({
    id: h.id,
    tier: h.tier,
    type: h.type,
    content: h.content,
  }));

  const hintPenaltyAppliedPayload = {
    whenPenaltyRate,
    wherePenaltyRate,
    validHintCount: suppliedHints.length,
  };

  const finalGuessResponsePayload =
    turn1Parse.kind === "guess" ? calls[0]?.response_payload : calls[1]?.response_payload ?? null;

  const evaluationId = await writeEvalFact(pool, {
    eventId: row.event_id,
    aiPlayerId,
    humanPlayerId: null,
    manifestId: finalManifestId,
    groundTruthVersionId,
    stimulusId,
    callResult: finalCall,
    finalGuess,
    suppliedHints: hintsRequestedPayload,
    imageQualityScore,
    imageQualityNotes,
    critiqueError,
    difficultyScore,
    difficultyNotes,
    authenticityScore,
    authenticityNotes,
    authenticityError,
    error: null,
    usageTotals: usageSoFar(),
  });

  // D2 code-side guard: a practice row must carry hints_off, no hints and
  // zero penalties (a no-op for daily rows).
  assertPracticeHintsOff({
    play_mode: MODE,
    hints_off: HINTS_OFF,
    hints_requested: hintsRequestedPayload,
    hint_penalty_applied: hintPenaltyAppliedPayload,
  });

  const answerBankId = await writeResult(pool, {
    evaluationId,
    eventId: row.event_id,
    aiPlayerId,
    result,
    referenceYear,
    reasoning: finalReasoning,
    hintsRequested: hintsRequestedPayload,
    hintPenaltyApplied: hintPenaltyAppliedPayload,
    timeToGuessMs: timeToGuessMs ?? DEADLINE_MS,
    imageQualityScore,
    imageQualityNotes,
    critiqueError,
    rawLlmResponse: finalGuessResponsePayload,
    confidence: finalGuess.confidence,
    usageTotals: usageSoFar(),
    latencyMs: latencySoFarMs(),
  });
  await writeCalls(pool, answerBankId, calls);
  await insertHintReviews(pool, row.event_id, aiPlayerId, evaluationId, hintReviewRows);

  console.log("Stored v3 answer for event", row.event_id, "ai_player", aiPlayerId, "evaluation_id", evaluationId);
  await pool.end();
  process.exit(0);
}

export function buildTurn1Messages(imageUrl: string, hints: EventHint[], hintsOff: boolean): unknown[] {
  const finalGuessShape =
    `{"finalGuess": {"latitude": number, "longitude": number, "year": integer, "confidence": number 0-1 (optional)}, "reasoning": "your concise reasoning"}`;

  // E2/D2: hintsOff (practice) drops the hint menu entirely — no
  // available-hints block, no hintRequests shape; the finalGuess JSON shape is
  // the only acceptable reply.
  let systemPrompt: string;
  if (hintsOff) {
    systemPrompt =
      `You are a geospatial and historical reasoning assistant. You will be shown an image. ` +
      `Your task is to determine where (latitude and longitude) and when (year) the depicted historical event occurred.\n\n` +
      `Submit a final guess. Respond with JSON only (no markdown). Use exactly this shape:\n\n` +
      `Final guess:\n` +
      finalGuessShape;
  } else {
    const availableHints = hints.map((h) => `tier ${h.tier} ${h.type}`).join("\n") || "none";
    systemPrompt =
      `You are a geospatial and historical reasoning assistant. You will be shown an image. ` +
      `Your task is to determine where (latitude and longitude) and when (year) the depicted historical event occurred.\n\n` +
      `You may either:\n` +
      `1. Submit a final guess immediately, OR\n` +
      `2. Request one or more hints by tier and type.\n\n` +
      `Available hints for this event (tier and type only; content is hidden until requested):\n${availableHints}\n\n` +
      `Respond with JSON only (no markdown). Use exactly one of the following shapes:\n\n` +
      `Final guess:\n` +
      finalGuessShape +
      `\n\n` +
      `Request hints:\n` +
      `{"hintRequests": [{"tier": integer, "type": "where" | "when"}]}\n\n` +
      `If you request hints, you will receive the requested hint content and must then submit a final guess.`;
  }

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl, detail: DETAIL_MODE } },
        { type: "text", text: hintsOff ? "What is your guess?" : "What is your guess or hint request?" },
      ],
    },
  ];
}

function buildTurn2Messages(
  priorMessages: unknown[],
  assistantTurn1Content: string,
  suppliedHints: SuppliedHint[]
): unknown[] {
  const hintsText = suppliedHints.map((h) => `- Tier ${h.tier} ${h.type}: "${h.content}"`).join("\n");

  const userPrompt =
    `You requested the following hints. Their content is now revealed:\n${hintsText}\n\n` +
    `Now submit your final guess. Respond with JSON only:\n` +
    `{"finalGuess": {"latitude": number, "longitude": number, "year": integer, "confidence": number 0-1 (optional)}, "reasoning": "your concise reasoning"}`;

  return [
    ...priorMessages,
    { role: "assistant", content: assistantTurn1Content },
    { role: "user", content: userPrompt },
  ];
}

export function buildCritiqueMessages(
  imageUrl: string,
  trueAnswer: { lat: number; lng: number; year: number; locationName: string | null },
  title: string,
  locationName: string | null,
  description: string | null,
  allHints: SuppliedHint[]
): unknown[] {
  // D4/D5: the former critique turn is the structured REVIEW turn — the only
  // turn that sees the reveal and every hint of the event (with ids).
  const hasHints = allHints.length > 0;
  const systemPrompt =
    `You are evaluating the provided historical image after the true answer has been revealed. ` +
    `Assess three things and return a single JSON object with exactly these keys:\n` +
    `  - imageQualityScore (integer 1-10): how accurately the image depicts the known historical event.\n` +
    `  - imageQualityNotes (string): brief explanation for the image quality score.\n` +
    `  - difficultyScore (integer 1-10): how hard the image would be for a skilled player to geolocate and date correctly before seeing the answer, considering visual ambiguity, common/generic subject matter, lack of identifying landmarks, etc.\n` +
    `  - difficultyNotes (string): brief explanation for the difficulty score.\n` +
    `  - authenticityScore (integer 1-10): how confident you are that the depicted event is a real historical event, as opposed to a staged photo, movie/TV still, reenactment, or AI-generated image.\n` +
    `  - authenticityNotes (string): brief explanation for the authenticity score.\n` +
    (hasHints
      ? `  - hintReviews (array): one entry per hint listed in the user prompt, each ` +
        `{"hintId": string (the hint's id), "verdict": "correct" | "incorrect" | "unverifiable" | "partially_correct", ` +
        `"confidence": number 0-1, "explanation": string, "suggestedCorrection": string | null} ` +
        `judging whether the hint text is accurate given the image and the revealed truth.\n`
      : "") +
    `\nRespond with JSON only (no markdown).`;

  const locationText = locationName ? ` (${locationName})` : "";
  const descriptionText = description ? ` Event description: "${description}".` : "";
  const hintListText = hasHints
    ? `\n\nThe event's hints (id — tier — type — content). Review each against the image and the revealed answer:\n` +
      allHints.map((h) => `- id="${h.id}" (tier ${h.tier} ${h.type}): "${h.content}"`).join("\n")
    : "";
  const userPrompt =
    `The correct answer is: latitude ${trueAnswer.lat}, longitude ${trueAnswer.lng}, year ${trueAnswer.year}${locationText}. ` +
    `Event title: "${title || "unknown"}".${descriptionText}\n\n` +
    `Rate the image quality, guess difficulty, and authenticity of the depicted event. Provide JSON with imageQualityScore, imageQualityNotes, difficultyScore, difficultyNotes, authenticityScore, and authenticityNotes` +
    (hasHints ? `, and hintReviews.` : `.`) +
    hintListText;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl, detail: DETAIL_MODE } },
        { type: "text", text: userPrompt },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// E1/D3 429 deferral helpers — a 429 in ANY turn writes the usual error
// eval_fact + bank error row (bank error text swapped for the
// RATE_LIMIT_DEFERRED marker) and exits 75. Never retried in-worker.
// ---------------------------------------------------------------------------

/** Detects a rate-limit failure from the worker's own error text (E1). */
export function isRateLimitErrorText(errorText: string | null | undefined): boolean {
  if (typeof errorText !== "string" || errorText.length === 0) return false;
  return (
    errorText.includes(" 429 ") ||
    errorText.includes(": 429") ||
    errorText.includes('code":429') ||
    errorText.includes('code":"429')
  );
}

/** error.metadata.{provider_name,limit_source} from an OpenRouter error body. */
function extractErrorMetadata(raw: unknown): { providerName: string | null; limitSource: string | null } {
  if (typeof raw !== "object" || raw === null) return { providerName: null, limitSource: null };
  const err = (raw as Record<string, unknown>).error;
  if (typeof err !== "object" || err === null) return { providerName: null, limitSource: null };
  const meta = (err as Record<string, unknown>).metadata;
  if (typeof meta !== "object" || meta === null) return { providerName: null, limitSource: null };
  const m = meta as Record<string, unknown>;
  return {
    providerName: typeof m.provider_name === "string" && m.provider_name.length > 0 ? m.provider_name : null,
    limitSource: typeof m.limit_source === "string" && m.limit_source.length > 0 ? m.limit_source : null,
  };
}

/**
 * The bank-row error text / stderr line for a deferred play:
 * `RATE_LIMIT_DEFERRED retry_after_ms=<int|unknown> <provider_name|unknown>/<limit_source|unknown>`
 * CRITICAL: must never contain "429" — admin_fleet_model_stats classifies the
 * bank error column with ILIKE '%429%'.
 */
export function buildRateLimitDeferredText(errorText: string, rawResponse: unknown): string {
  const retryAfterMs = parseRetryAfterMs(errorText);
  const meta = extractErrorMetadata(rawResponse);
  return `${RATE_LIMIT_DEFERRED_MARKER} retry_after_ms=${retryAfterMs === null ? "unknown" : Math.round(retryAfterMs)} ${meta.providerName ?? "unknown"}/${meta.limitSource ?? "unknown"}`;
}

/** Retry-After header (seconds or HTTP-date) -> ms, via the shared parser. */
function retryAfterMsFromHeaders(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (value === null) return null;
  const parsed = parseRetryAfterMs(`Retry-After: ${value}`);
  return parsed === null ? null : Math.round(parsed);
}

async function callOpenRouter(
  apiKey: string,
  messages: unknown[],
  turnIndex: number,
  calls: Array<{
    turn_index: number;
    request_payload: unknown;
    response_payload: unknown;
    duration_ms: number;
    error: string | null;
  }>,
  abortMs: number
): Promise<OpenRouterCallResult> {
  const requestStartedAt = new Date();
  const callStartMs = Date.now();
  // AIP-FIX-TRUNCATION-REASONINGBUDGET-1010-002: reasoning models can consume the
  // entire max_tokens budget on reasoning, yielding finish_reason=length with
  // empty content. First attempt at 4096; on truncation/empty content retry once
  // at 8192. Still-truncated responses surface as a distinct TRUNCATED_LENGTH
  // error class (no ai_answer_bank row written upstream).
  for (let attemptIndex = 0; attemptIndex < MAX_TOKEN_ATTEMPTS.length; attemptIndex++) {
    const maxTokens = MAX_TOKEN_ATTEMPTS[attemptIndex];
    const isLastAttempt = attemptIndex === MAX_TOKEN_ATTEMPTS.length - 1;
    const requestBody = {
      model: MODEL_ID,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    };

    const start = Date.now();
    let response: Response;
    // AbortSignal.timeout caps one call at the remaining budget; an aborted
    // call is a TIMEOUT_DEADLINE (timeout row upstream), not a provider error.
    // remainingMs/responseText live outside try so the catch / parse branch can
    // reference them; the body read is inside try because the signal also
    // covers the streamed body (a mid-body abort must hit the same catch).
    let responseText = "";
    const remainingMs = Math.max(abortMs - (Date.now() - callStartMs), 1);
    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://guess-history.com",
          "X-Title": "Guess-History AI Players",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(remainingMs),
      });
      responseText = await response.text();
    } catch (networkErr) {
      const responseReceivedAt = new Date();
      const durationMs = Date.now() - start;
      const errName = networkErr instanceof Error ? networkErr.name : "";
      const isAbort = errName === "AbortError" || errName === "TimeoutError";
      const errorMsg = isAbort
        ? `TIMEOUT_DEADLINE: fetch aborted after ${durationMs}ms (budget ${remainingMs}ms)`
        : `fetch failed: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`;
      calls.push({
        turn_index: turnIndex,
        request_payload: requestBody,
        response_payload: { rawText: "" },
        duration_ms: durationMs,
        error: errorMsg,
      });
      return {
        content: "",
        rawResponse: { rawText: "" },
        error: errorMsg,
        requestStartedAt,
        responseReceivedAt,
        usage: nullUsage(),
        reasoning: null,
        reasoningAvailable: false,
        maxTokensUsed: maxTokens,
      };
    }

    // Read the body once: text first, then JSON.parse — a non-JSON error page
    // still produces a calls row instead of an unusable-body exception.
    let rawResponse: unknown;
    try {
      rawResponse = JSON.parse(responseText);
    } catch {
      rawResponse = { rawText: responseText };
    }
    const responseReceivedAt = new Date();
    const durationMs = Date.now() - start;

    if (!response.ok) {
      let errorMsg = `OpenRouter request failed: ${response.status} ${response.statusText} ${responseText}`;
      // E1: surface the Retry-After hint on a 429 so the supervisor can park
      // the model for exactly that long (parsed at the deferral site).
      if (response.status === 429) {
        const retryAfterMs = retryAfterMsFromHeaders(response);
        if (retryAfterMs !== null) errorMsg += ` retry_after_ms=${retryAfterMs}`;
      }
      calls.push({
        turn_index: turnIndex,
        request_payload: requestBody,
        response_payload: rawResponse,
        duration_ms: durationMs,
        error: errorMsg,
      });
      return {
        content: "",
        rawResponse,
        error: errorMsg,
        requestStartedAt,
        responseReceivedAt,
        usage: extractUsage(rawResponse),
        reasoning: null,
        reasoningAvailable: false,
        maxTokensUsed: maxTokens,
      };
    }

    // Provider-error classification on HTTP 200: a top-level `error` object is
    // the real error class (rate limit, model error, upstream failure) — record
    // it as such instead of collapsing it into TRUNCATED_LENGTH.
    const topLevelError =
      typeof rawResponse === "object" && rawResponse !== null
        ? (rawResponse as { error?: unknown }).error
        : undefined;
    if (topLevelError !== undefined && topLevelError !== null) {
      const errDetail =
        typeof topLevelError === "object"
          ? JSON.stringify(topLevelError)
          : String(topLevelError);
      let errorMsg = `PROVIDER_ERROR: ${errDetail.slice(0, 500)}`;
      // E1: a HTTP-200 body can still carry error.code === 429 — same
      // Retry-After propagation as a real 429 status.
      const topLevelErrorCode =
        typeof topLevelError === "object" && topLevelError !== null
          ? (topLevelError as Record<string, unknown>).code
          : undefined;
      if (topLevelErrorCode === 429 || topLevelErrorCode === "429") {
        const retryAfterMs = retryAfterMsFromHeaders(response);
        if (retryAfterMs !== null) errorMsg += ` retry_after_ms=${retryAfterMs}`;
      }
      calls.push({
        turn_index: turnIndex,
        request_payload: requestBody,
        response_payload: rawResponse,
        duration_ms: durationMs,
        error: errorMsg,
      });
      return {
        content: "",
        rawResponse,
        error: errorMsg,
        requestStartedAt,
        responseReceivedAt,
        usage: extractUsage(rawResponse),
        reasoning: null,
        reasoningAvailable: false,
        maxTokensUsed: maxTokens,
      };
    }

    const finishReasonRaw =
      (rawResponse as { choices?: Array<{ finish_reason?: unknown }> } | null)?.choices?.[0]?.finish_reason;
    const finishReason = typeof finishReasonRaw === "string" ? finishReasonRaw : null;
    const content = extractAssistantContent(rawResponse);
    const truncated = finishReason === "length" || content.trim().length === 0;
    if (truncated) {
      if (finishReason === "error") {
        const choice0 =
          (rawResponse as { choices?: Array<{ native_finish_reason?: unknown; error?: unknown }> } | null)?.choices?.[0];
        const nativeFinishReason =
          choice0 && typeof choice0.native_finish_reason === "string" ? choice0.native_finish_reason : null;
        const choiceErrorJson = JSON.stringify(choice0?.error ?? null).slice(0, 500);
        const errorMsg = `PROVIDER_ERROR: finish_reason=error native_finish_reason=${nativeFinishReason ?? "null"} error=${choiceErrorJson}`;
        calls.push({
          turn_index: turnIndex,
          request_payload: requestBody,
          response_payload: rawResponse,
          duration_ms: durationMs,
          error: errorMsg,
        });
        return {
          content: "",
          rawResponse,
          error: errorMsg,
          requestStartedAt,
          responseReceivedAt,
          usage: extractUsage(rawResponse),
          reasoning: null,
          reasoningAvailable: false,
          maxTokensUsed: maxTokens,
        };
      }
      const errorMsg = `TRUNCATED_LENGTH: finish_reason=${finishReason ?? "null"} content_empty=${
        content.trim().length === 0
      } at max_tokens=${maxTokens}${
        isLastAttempt ? " (retry exhausted)" : ` — retrying at max_tokens=${MAX_TOKEN_ATTEMPTS[attemptIndex + 1]}`
      }`;
      calls.push({
        turn_index: turnIndex,
        request_payload: requestBody,
        response_payload: rawResponse,
        duration_ms: durationMs,
        error: errorMsg,
      });
      if (!isLastAttempt) continue;
      const { reasoning, reasoningAvailable } = extractReasoning(rawResponse);
      return {
        content,
        rawResponse,
        error: errorMsg,
        requestStartedAt,
        responseReceivedAt,
        usage: extractUsage(rawResponse),
        reasoning,
        reasoningAvailable,
        maxTokensUsed: maxTokens,
      };
    }

    calls.push({
      turn_index: turnIndex,
      request_payload: requestBody,
      response_payload: rawResponse,
      duration_ms: durationMs,
      error: null,
    });

    const { reasoning, reasoningAvailable } = extractReasoning(rawResponse);
    return {
      content,
      rawResponse,
      requestStartedAt,
      responseReceivedAt,
      usage: extractUsage(rawResponse),
      reasoning,
      reasoningAvailable,
      maxTokensUsed: maxTokens,
    };
  }
  throw new Error("unreachable: max_tokens retry loop exhausted");
}

function nullUsage(): OpenRouterUsage {
  return {
    prompt_tokens: null,
    completion_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
    cost: null,
  };
}

function extractUsage(raw: unknown): OpenRouterUsage {
  const empty = nullUsage();
  if (typeof raw !== "object" || raw === null) return empty;
  const maybe = raw as Record<string, unknown>;
  const usage = maybe.usage;
  if (!usage || typeof usage !== "object") return empty;
  const u = usage as Record<string, unknown>;
  const completionDetails =
    u.completion_tokens_details && typeof u.completion_tokens_details === "object"
      ? (u.completion_tokens_details as Record<string, unknown>)
      : null;
  return {
    prompt_tokens: toInt(u.prompt_tokens),
    completion_tokens: toInt(u.completion_tokens),
    reasoning_tokens: toInt(u.reasoning_tokens) ?? toInt(completionDetails?.reasoning_tokens),
    total_tokens: toInt(u.total_tokens),
    cost: toNumber(u.cost),
  };
}

function extractReasoning(raw: unknown): { reasoning: string | null; reasoningAvailable: boolean } {
  if (typeof raw !== "object" || raw === null) return { reasoning: null, reasoningAvailable: false };
  const maybe = raw as Record<string, unknown>;
  const choices = maybe.choices;
  if (!Array.isArray(choices) || choices.length === 0) return { reasoning: null, reasoningAvailable: false };
  const first = choices[0] as Record<string, unknown>;
  const message = first.message;
  if (!message || typeof message !== "object") return { reasoning: null, reasoningAvailable: false };
  const msg = message as Record<string, unknown>;
  const reasoning = msg.reasoning;
  if (reasoning === undefined || reasoning === null) return { reasoning: null, reasoningAvailable: false };
  if (typeof reasoning === "string") return { reasoning, reasoningAvailable: true };
  return { reasoning: JSON.stringify(reasoning), reasoningAvailable: true };
}

function extractAssistantContent(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) return "";
  const maybe = raw as Record<string, unknown>;
  const choices = maybe.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const message = first.message;
    if (message && typeof message === "object") {
      const msg = message as Record<string, unknown>;
      if (typeof msg.content === "string") return msg.content;
    }
  }
  return "";
}

export function parseTurn1Response(text: string, hintsOff: boolean): TurnResult {
  const cleaned = cleanJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { kind: "error", error: `Failed to parse AI turn 1 response: ${(err as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "error", error: "Turn 1 response is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.finalGuess) {
    const guess = parseFinalGuess(obj.finalGuess);
    if (guess) {
      return { kind: "guess", finalGuess: guess, reasoning: typeof obj.reasoning === "string" ? obj.reasoning : null };
    }
  }

  if (obj.hintRequests) {
    // D2/E2: a hintRequests reply while hints are disabled is a bad-output
    // error — the model was never shown a hint menu.
    if (hintsOff) {
      return { kind: "error", error: "hints requested while hints disabled" };
    }
    const requests = parseHintRequests(obj.hintRequests);
    if (requests.length > 0) {
      return { kind: "hints", hintRequests: requests };
    }
  }

  return { kind: "error", error: "Turn 1 response did not contain a valid finalGuess or hintRequests" };
}

function parseFinalGuessResponse(text: string): TurnResult {
  const cleaned = cleanJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { kind: "error", error: `Failed to parse AI final guess response: ${(err as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "error", error: "Final guess response is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.finalGuess) {
    return { kind: "error", error: "Final guess response missing finalGuess" };
  }

  const guess = parseFinalGuess(obj.finalGuess);
  if (!guess) {
    return { kind: "error", error: "Final guess response has invalid finalGuess" };
  }

  return { kind: "guess", finalGuess: guess, reasoning: typeof obj.reasoning === "string" ? obj.reasoning : null };
}

function parseFinalGuess(value: unknown): FinalGuess | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;

  const latitude = toFiniteNumber(obj.latitude);
  const longitude = toFiniteNumber(obj.longitude);
  const year = toFiniteNumber(obj.year);

  if (latitude === null || longitude === null || year === null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (!Number.isInteger(year)) return null;

  // E2: optional self-rated confidence — a finite number in [0,1], else null.
  const rawConfidence = toFiniteNumber(obj.confidence);
  const confidence =
    rawConfidence !== null && rawConfidence >= 0 && rawConfidence <= 1 ? rawConfidence : null;

  return { latitude, longitude, year, confidence };
}

function parseHintRequests(value: unknown): HintRequest[] {
  if (!Array.isArray(value)) return [];
  const requests: HintRequest[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const tier = toFiniteNumber(obj.tier);
    const type = typeof obj.type === "string" ? obj.type : "";
    if (tier !== null && tier >= 1 && tier <= 5 && type) {
      requests.push({ tier, type });
    }
  }
  return requests;
}

type CritiqueParseResult = {
  imageQualityScore: number | null;
  imageQualityNotes: string | null;
  difficultyScore: number | null;
  difficultyNotes: string | null;
  authenticityScore: number | null;
  authenticityNotes: string | null;
  error?: string;
  authenticityError?: string;
};

function parseCritiqueResponse(text: string): CritiqueParseResult {
  const cleaned = cleanJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { imageQualityScore: null, imageQualityNotes: null, difficultyScore: null, difficultyNotes: null, authenticityScore: null, authenticityNotes: null, error: `Failed to parse critique response: ${(err as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { imageQualityScore: null, imageQualityNotes: null, difficultyScore: null, difficultyNotes: null, authenticityScore: null, authenticityNotes: null, error: "Critique response is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;
  const imageScore = toFiniteNumber(obj.imageQualityScore);
  if (imageScore === null || imageScore < 1 || imageScore > 10 || !Number.isInteger(imageScore)) {
    return { imageQualityScore: null, imageQualityNotes: null, difficultyScore: null, difficultyNotes: null, authenticityScore: null, authenticityNotes: null, error: "Critique response has invalid imageQualityScore (must be integer 1-10)" };
  }

  const imageNotes = typeof obj.imageQualityNotes === "string" ? obj.imageQualityNotes : null;
  const result: CritiqueParseResult = {
    imageQualityScore: imageScore,
    imageQualityNotes: imageNotes,
    difficultyScore: null,
    difficultyNotes: null,
    authenticityScore: null,
    authenticityNotes: null,
  };

  const errors: string[] = [];

  const difficultyScore = toFiniteNumber(obj.difficultyScore);
  if (difficultyScore === null || difficultyScore < 1 || difficultyScore > 10 || !Number.isInteger(difficultyScore)) {
    errors.push("difficultyScore must be integer 1-10");
  } else {
    result.difficultyScore = difficultyScore;
    result.difficultyNotes = typeof obj.difficultyNotes === "string" ? obj.difficultyNotes : null;
  }

  const authenticityScore = toFiniteNumber(obj.authenticityScore);
  if (authenticityScore === null || authenticityScore < 1 || authenticityScore > 10 || !Number.isInteger(authenticityScore)) {
    errors.push("authenticityScore must be integer 1-10");
  } else {
    result.authenticityScore = authenticityScore;
    result.authenticityNotes = typeof obj.authenticityNotes === "string" ? obj.authenticityNotes : null;
  }

  if (errors.length > 0) {
    return { ...result, authenticityError: errors.join("; ") };
  }
  return result;
}

function cleanJson(text: string): string {
  const trimmed = text
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0].trim() : trimmed;
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveHintRequests(
  available: EventHint[],
  requests: HintRequest[]
): { supplied: SuppliedHint[]; missing: HintRequest[] } {
  const supplied: SuppliedHint[] = [];
  const missing: HintRequest[] = [];

  for (const req of requests) {
    const match = available.find((h) => h.tier === req.tier && h.type === req.type);
    if (match) {
      supplied.push({
        id: match.id,
        tier: match.tier,
        type: match.type,
        content: match.content,
      });
    } else {
      missing.push(req);
    }
  }

  return { supplied, missing };
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

async function ensureAiPlayer(pool: Awaited<ReturnType<typeof getDbPool>>): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM ai_players WHERE model_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1",
    [MODEL_ID]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  try {
    const inserted = await pool.query<{ id: string }>(
      "INSERT INTO ai_players (name, provider, model_id, is_active, is_active_daily, is_active_practice) VALUES ($1, $2, $3, false, false, false) RETURNING id",
      [AI_PLAYER_NAME, PROVIDER, MODEL_ID]
    );
    return inserted.rows[0].id;
  } catch (err) {
    // Lost a race with another creator: use the live row (one live player per model_id).
    if ((err as { code?: string }).code !== "23505") throw err;
    const live = await pool.query<{ id: string }>(
      "SELECT id FROM ai_players WHERE model_id = $1 AND deleted_at IS NULL LIMIT 1",
      [MODEL_ID]
    );
    if (live.rows.length === 0) throw err;
    return live.rows[0].id;
  }
}

async function resolveManifest(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  request: ManifestRequest
): Promise<string> {
  const content = {
    provider: request.provider,
    model_id: request.model_id,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
  };
  const contentHash = sha256(stableStringify(content));

  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM ai_model_execution_manifests WHERE content_hash = $1 LIMIT 1",
    [contentHash]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO ai_model_execution_manifests (content_hash, provider, model_id, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (content_hash) DO NOTHING
     RETURNING id`,
    [contentHash, request.provider, request.model_id, content]
  );
  if (inserted.rows.length > 0) {
    return inserted.rows[0].id;
  }

  const winner = await pool.query<{ id: string }>(
    "SELECT id FROM ai_model_execution_manifests WHERE content_hash = $1 LIMIT 1",
    [contentHash]
  );
  if (winner.rows.length > 0) {
    return winner.rows[0].id;
  }
  throw new Error(`resolveManifest: content_hash ${contentHash} has no row after ON CONFLICT`);
}

async function resolveGroundTruthVersion(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  row: {
    event_id: string;
    event_year: number;
    latitude: number;
    longitude: number;
    location_name: string | null;
    title: string | null;
    country: string | null;
    continent: string | null;
  }
): Promise<string> {
  const content = {
    event_year: row.event_year,
    latitude: row.latitude,
    longitude: row.longitude,
    location_name: row.location_name,
    title: row.title,
    country: row.country,
    continent: row.continent,
  };
  const contentHash = sha256(stableStringify(content));

  const MAX_ATTEMPTS = 5;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM ground_truth_versions WHERE event_id = $1 AND content_hash = $2 LIMIT 1",
      [row.event_id, contentHash]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const versionResult = await pool.query<{ next_version: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM ground_truth_versions WHERE event_id = $1",
      [row.event_id]
    );
    const version = versionResult.rows[0].next_version;

    try {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO ground_truth_versions (event_id, version, content_hash, content)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [row.event_id, version, contentHash, content]
      );
      return inserted.rows[0].id;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && (err as { code?: string })?.code === "23505") {
        continue;
      }
      throw err;
    }
  }

  throw new Error("resolveGroundTruthVersion: exhausted retries on unique constraint conflict");
}

async function resolveStimulus(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  imageUrl: string,
  detailMode: string
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const sourceBytesSha256 = sha256(bytes);

  const hashInput = stableStringify({
    source_url: imageUrl,
    detail_mode: detailMode,
    source_bytes_sha256: sourceBytesSha256,
  });
  const stimulusHash = sha256(hashInput);

  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM eval_stimuli WHERE stimulus_hash = $1 LIMIT 1",
    [stimulusHash]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO eval_stimuli (stimulus_hash, source_url, source_bytes_sha256, detail_mode)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (stimulus_hash) DO NOTHING
     RETURNING id`,
    [stimulusHash, imageUrl, sourceBytesSha256, detailMode]
  );
  if (inserted.rows.length > 0) {
    return inserted.rows[0].id;
  }

  const winner = await pool.query<{ id: string }>(
    "SELECT id FROM eval_stimuli WHERE stimulus_hash = $1 LIMIT 1",
    [stimulusHash]
  );
  if (winner.rows.length > 0) {
    return winner.rows[0].id;
  }
  throw new Error(`resolveStimulus: stimulus_hash ${stimulusHash} has no row after ON CONFLICT`);
}

type EvalFactInput = {
  eventId: string;
  aiPlayerId: string;
  humanPlayerId: string | null;
  manifestId: string;
  groundTruthVersionId: string;
  stimulusId: string;
  callResult: OpenRouterCallResult;
  /** D6: token/cost sums across ALL calls of the play so far. */
  usageTotals: UsageTotals;
  finalGuess: FinalGuess | null;
  suppliedHints: unknown[];
  imageQualityScore: number | null;
  imageQualityNotes: string | null;
  critiqueError: string | null;
  difficultyScore: number | null;
  difficultyNotes: string | null;
  authenticityScore: number | null;
  authenticityNotes: string | null;
  authenticityError: string | null;
  error: string | null;
};

async function writeEvalFact(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  input: EvalFactInput
): Promise<string> {
  const gameContext = {
    game_mode_type: "bank_generation",
    time_budget_ms: DEADLINE_MS,
  };

  const result = await pool.query<{ evaluation_id: string }>(
    `INSERT INTO eval_facts (
      event_id, ai_player_id, human_player_id, manifest_id, ground_truth_version_id, stimulus_id,
      game_context, time_budget_ms, request_started_at, response_received_at,
      prompt_tokens, completion_tokens, reasoning_tokens, total_tokens, cost,
      reasoning_trace_available, reasoning_trace,
      final_guess, supplied_hints, image_quality_score, image_quality_notes, critique_error,
      difficulty_score, difficulty_notes, authenticity_score, authenticity_notes, authenticity_error,
      raw_llm_response, error
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17,
      $18, $19, $20, $21, $22,
      $23, $24, $25, $26, $27,
      $28, $29
    ) RETURNING evaluation_id`,
    [
      input.eventId,
      input.aiPlayerId,
      input.humanPlayerId,
      input.manifestId,
      input.groundTruthVersionId,
      input.stimulusId,
      gameContext,
      gameContext.time_budget_ms,
      input.callResult.requestStartedAt.toISOString(),
      input.callResult.responseReceivedAt.toISOString(),
      input.usageTotals.prompt_tokens,
      input.usageTotals.completion_tokens,
      input.usageTotals.reasoning_tokens,
      input.usageTotals.total_tokens,
      input.usageTotals.cost,
      input.callResult.reasoningAvailable,
      input.callResult.reasoning,
      input.finalGuess ? JSON.stringify(input.finalGuess) : null,
      input.suppliedHints.length > 0 ? JSON.stringify(input.suppliedHints) : null,
      input.imageQualityScore,
      input.imageQualityNotes,
      input.critiqueError,
      input.difficultyScore,
      input.difficultyNotes,
      input.authenticityScore,
      input.authenticityNotes,
      input.authenticityError,
      input.callResult.rawResponse,
      input.error,
    ]
  );
  return result.rows[0].evaluation_id;
}

type ErrorEvalFactInput = Omit<EvalFactInput, "humanPlayerId"> & { humanPlayerId?: string | null };

async function writeErrorEvalFact(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  input: ErrorEvalFactInput
): Promise<string> {
  return writeEvalFact(pool, {
    ...input,
    humanPlayerId: input.humanPlayerId ?? null,
  });
}

type ResultWriteInput = {
  evaluationId: string;
  eventId: string;
  aiPlayerId: string;
  result: ReturnType<typeof evaluateRound>;
  referenceYear: number;
  reasoning: string | null;
  hintsRequested: unknown[];
  hintPenaltyApplied: { whenPenaltyRate: number; wherePenaltyRate: number; validHintCount: number };
  timeToGuessMs: number;
  imageQualityScore: number | null;
  imageQualityNotes: string | null;
  critiqueError: string | null;
  rawLlmResponse: unknown;
  /** E2: model self-rated confidence from the final guess (null when absent). */
  confidence: number | null;
  /** D6: summed usage across all calls of the play. */
  usageTotals: UsageTotals;
  /** D6: sum of calls.duration_ms. */
  latencyMs: number;
};

async function writeResult(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  input: ResultWriteInput
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO ai_answer_bank (
      event_id, ai_player_id, guess_lat, guess_lng, guess_year,
      distance_km, year_diff, location_accuracy, year_accuracy,
      round_accuracy, round_xp, raw_llm_response, error,
      reference_year, reasoning, hints_requested, hint_penalty_applied,
      time_to_guess_ms, image_quality_score, image_quality_notes, critique_error,
      evaluation_id,
      play_mode, hints_off, total_cost_usd, total_tokens, reasoning_tokens,
      latency_ms, timer_ms, model_slug, confidence, error_class
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
              $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
    ON CONFLICT (event_id, ai_player_id)
    DO UPDATE SET
      guess_lat = EXCLUDED.guess_lat,
      guess_lng = EXCLUDED.guess_lng,
      guess_year = EXCLUDED.guess_year,
      distance_km = EXCLUDED.distance_km,
      year_diff = EXCLUDED.year_diff,
      location_accuracy = EXCLUDED.location_accuracy,
      year_accuracy = EXCLUDED.year_accuracy,
      round_accuracy = EXCLUDED.round_accuracy,
      round_xp = EXCLUDED.round_xp,
      raw_llm_response = EXCLUDED.raw_llm_response,
      error = EXCLUDED.error,
      reference_year = EXCLUDED.reference_year,
      reasoning = EXCLUDED.reasoning,
      hints_requested = EXCLUDED.hints_requested,
      hint_penalty_applied = EXCLUDED.hint_penalty_applied,
      time_to_guess_ms = EXCLUDED.time_to_guess_ms,
      image_quality_score = EXCLUDED.image_quality_score,
      image_quality_notes = EXCLUDED.image_quality_notes,
      critique_error = EXCLUDED.critique_error,
      evaluation_id = EXCLUDED.evaluation_id,
      play_mode = EXCLUDED.play_mode,
      hints_off = EXCLUDED.hints_off,
      total_cost_usd = EXCLUDED.total_cost_usd,
      total_tokens = EXCLUDED.total_tokens,
      reasoning_tokens = EXCLUDED.reasoning_tokens,
      latency_ms = EXCLUDED.latency_ms,
      timer_ms = EXCLUDED.timer_ms,
      model_slug = EXCLUDED.model_slug,
      confidence = EXCLUDED.confidence,
      error_class = EXCLUDED.error_class,
      created_at = now()
    RETURNING id`,
    [
      input.eventId,
      input.aiPlayerId,
      input.result.guess.location?.lat ?? null,
      input.result.guess.location?.lng ?? null,
      input.result.guess.year,
      input.result.distanceKm,
      input.result.yearDiff,
      input.result.locationAccuracy,
      input.result.yearAccuracy,
      input.result.roundAccuracy,
      input.result.roundXp,
      input.rawLlmResponse,
      null, // error
      input.referenceYear,
      input.reasoning,
      JSON.stringify(input.hintsRequested),
      JSON.stringify(input.hintPenaltyApplied),
      input.timeToGuessMs,
      input.imageQualityScore,
      input.imageQualityNotes,
      input.critiqueError,
      input.evaluationId,
      MODE,
      HINTS_OFF,
      input.usageTotals.cost,
      input.usageTotals.total_tokens,
      input.usageTotals.reasoning_tokens,
      input.latencyMs,
      DEADLINE_MS,
      MODEL_ID,
      input.confidence,
      null, // error_class — success rows carry no classification
    ]
  );
  return res.rows[0].id;
}

async function writeCalls(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  answerBankId: string,
  calls: Array<{
    turn_index: number;
    request_payload: unknown;
    response_payload: unknown;
    duration_ms: number;
    error: string | null;
  }>
): Promise<void> {
  for (const call of calls) {
    await pool.query(
      `INSERT INTO ai_answer_bank_calls (
        ai_answer_bank_id, turn_index, request_payload, response_payload, duration_ms, error
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [answerBankId, call.turn_index, call.request_payload, call.response_payload, call.duration_ms, call.error]
    );
  }
}

async function writeErrorResult(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  evaluationId: string,
  eventId: string,
  calls: Array<{
    turn_index: number;
    request_payload: unknown;
    response_payload: unknown;
    duration_ms: number;
    error: string | null;
  }>,
  errorMsg: string
): Promise<void> {
  const aiPlayerId = await ensureAiPlayer(pool);
  // D6: error rows carry the usage/cost/latency summed over the calls made so
  // far, plus the classifyOutcome class of the bank-row error text.
  const usageTotals = sumUsage(calls.map((c) => c.response_payload));
  const latencyMs = calls.reduce((acc, c) => acc + c.duration_ms, 0);
  const res = await pool.query<{ id: string }>(
    `INSERT INTO ai_answer_bank (
      event_id, ai_player_id, raw_llm_response, error,
      reference_year, reasoning, hints_requested, hint_penalty_applied,
      time_to_guess_ms, image_quality_score, image_quality_notes, critique_error,
      evaluation_id,
      play_mode, hints_off, total_cost_usd, total_tokens, reasoning_tokens,
      latency_ms, timer_ms, model_slug, confidence, error_class
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    ON CONFLICT (event_id, ai_player_id)
    DO UPDATE SET
      raw_llm_response = EXCLUDED.raw_llm_response,
      error = EXCLUDED.error,
      guess_lat = NULL,
      guess_lng = NULL,
      guess_year = NULL,
      distance_km = NULL,
      year_diff = NULL,
      location_accuracy = NULL,
      year_accuracy = NULL,
      round_accuracy = NULL,
      round_xp = NULL,
      reference_year = EXCLUDED.reference_year,
      reasoning = EXCLUDED.reasoning,
      hints_requested = EXCLUDED.hints_requested,
      hint_penalty_applied = EXCLUDED.hint_penalty_applied,
      time_to_guess_ms = EXCLUDED.time_to_guess_ms,
      image_quality_score = EXCLUDED.image_quality_score,
      image_quality_notes = EXCLUDED.image_quality_notes,
      critique_error = EXCLUDED.critique_error,
      evaluation_id = EXCLUDED.evaluation_id,
      play_mode = EXCLUDED.play_mode,
      hints_off = EXCLUDED.hints_off,
      total_cost_usd = EXCLUDED.total_cost_usd,
      total_tokens = EXCLUDED.total_tokens,
      reasoning_tokens = EXCLUDED.reasoning_tokens,
      latency_ms = EXCLUDED.latency_ms,
      timer_ms = EXCLUDED.timer_ms,
      model_slug = EXCLUDED.model_slug,
      confidence = EXCLUDED.confidence,
      error_class = EXCLUDED.error_class,
      created_at = now()
    RETURNING id`,
    [
      eventId,
      aiPlayerId,
      calls[calls.length - 1]?.response_payload ?? null,
      errorMsg,
      new Date().getFullYear(),
      null,
      "[]",
      JSON.stringify({ whenPenaltyRate: 0, wherePenaltyRate: 0, validHintCount: 0 }),
      null,
      null,
      null,
      null,
      evaluationId,
      MODE,
      HINTS_OFF,
      usageTotals.cost,
      usageTotals.total_tokens,
      usageTotals.reasoning_tokens,
      latencyMs,
      DEADLINE_MS,
      MODEL_ID,
      null, // confidence — error rows carry no guess confidence
      classifyOutcome(errorMsg),
    ]
  );
  await writeCalls(pool, res.rows[0].id, calls);
  console.log("Stored error row for event", eventId, "ai_player", aiPlayerId, "evaluation_id", evaluationId);
}

/**
 * D5: persist the parsed per-hint verdicts (one multi-row INSERT) AFTER the
 * bank row + call rows exist. evaluation_id links to the eval_facts row.
 * Hint review must never alter score/game state or the exit code — failures
 * are logged and swallowed.
 */
async function insertHintReviews(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  eventId: string,
  aiPlayerId: string,
  evaluationId: string,
  rows: readonly HintReviewRow[]
): Promise<void> {
  if (rows.length === 0) return;
  try {
    const COLUMN_COUNT = 9;
    const values: unknown[] = [];
    const tuples = rows.map((r) => {
      values.push(
        eventId,
        aiPlayerId,
        evaluationId,
        r.hint_kind,
        r.hint_text_hash,
        r.verdict,
        r.confidence,
        r.explanation,
        r.suggestedCorrection
      );
      const base = values.length - COLUMN_COUNT;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    });
    await pool.query(
      `INSERT INTO ai_hint_reviews (
        event_id, ai_player_id, evaluation_id, hint_kind, hint_text_hash,
        verdict, confidence, explanation, suggested_correction
      ) VALUES ${tuples.join(", ")}
      ON CONFLICT DO NOTHING`,
      values
    );
    console.log("Stored", rows.length, "hint review(s) for event", eventId);
  } catch (err) {
    console.warn("ai_hint_reviews insert failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

main().catch(async (error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  try {
    const pool = getDbPool();
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
