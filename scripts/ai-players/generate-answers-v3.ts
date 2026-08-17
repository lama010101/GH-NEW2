import { config } from "dotenv";
import { createHash } from "crypto";
import { getDbPool } from "@/server/db";
import { evaluateRound } from "@/core/rules";
import type { EventRecord, EventHint, Location } from "@/core/types";
import { TIER_PENALTY_RATE } from "@/core/hintPenalties";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4.6";
const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_AI_PLAYER_NAME = "Claude Sonnet 4.6";

const DAILY_TIMER_SECONDS = 90;
const DAILY_TIMER_MS = DAILY_TIMER_SECONDS * 1000;

const DEADLINE_MS = (() => {
  const override = process.env.AI_V3_TIMER_OVERRIDE_MS;
  if (!override) return DAILY_TIMER_MS;
  const parsed = Number(override);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DAILY_TIMER_MS;
})();

const DETAIL_MODE = "auto";

type HintRequest = { tier: number; type: string };
type SuppliedHint = { id: string; tier: number; type: string; content: string };

type FinalGuess = {
  latitude: number;
  longitude: number;
  year: number;
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
  maxTokens: number;
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
    maxTokens: Number.parseInt(flags.get("max-tokens") ?? "1024", 10),
  };
}

const parsedArgs = parseArgs();
const MODEL_ID = parsedArgs.modelId;
const PROVIDER = parsedArgs.provider;
const AI_PLAYER_NAME = parsedArgs.playerName;
const MAX_TOKENS = parsedArgs.maxTokens;

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("OPENROUTER_API_KEY is missing. Set it in the environment or .env.local and rerun.");
    process.exit(1);
  }

  const eventId = parsedArgs.eventId;
  if (!eventId) {
    console.error(
      "Usage: tsx scripts/ai-players/generate-answers-v3.ts [--model=<slug>] [--provider=<provider>] [--player-name=<name>] [--max-tokens=<count>] <event-id>"
    );
    process.exit(1);
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
  }>(
    `SELECT
      e.id AS event_id,
      e.event_year,
      l.latitude,
      l.longitude,
      l.display_name AS location_name,
      i.url AS image_url,
      e.title,
      l.country,
      l.continent
     FROM events e
     JOIN locations l ON l.event_id = e.id
     LEFT JOIN images i ON i.event_id = e.id
     WHERE e.id = $1
       AND e.status = 'validated'
       AND l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL
     LIMIT 1`,
    [eventId]
  );

  if (eventResult.rows.length === 0) {
    console.error(`No validated event found with id ${eventId}`);
    process.exit(1);
  }

  const row = eventResult.rows[0];
  if (!row.image_url) {
    console.error(`Event ${eventId} has no image_url`);
    process.exit(1);
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
    description: "",
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

  const turn1Messages = buildTurn1Messages(row.image_url, hints);
  const turn1ManifestId = await resolveManifest(pool, {
    provider: PROVIDER,
    model_id: MODEL_ID,
    messages: turn1Messages,
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
  });
  const turn1 = await callOpenRouter(apiKey, turn1Messages, 1, calls, MAX_TOKENS);
  if (turn1.error) {
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
    });
    await writeErrorResult(pool, evaluationId, row.event_id, calls, `OpenRouter turn 1 failed: ${turn1.error}`);
    process.exit(1);
  }

  const turn1Parse = parseTurn1Response(turn1.content);
  if (turn1Parse.kind === "error") {
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
    });
    await writeErrorResult(pool, evaluationId, row.event_id, calls, turn1Parse.error);
    console.error(turn1Parse.error);
    process.exit(1);
  }

  let finalGuess: FinalGuess | null = null;
  let finalReasoning: string | null = null;
  let suppliedHints: SuppliedHint[] = [];
  let finalCall: OpenRouterCallResult = turn1;
  let finalManifestId: string = turn1ManifestId;
  let timedOut = false;
  let timeToGuessMs: number | null = null;

  if (turn1Parse.kind === "guess") {
    finalGuess = turn1Parse.finalGuess;
    finalReasoning = turn1Parse.reasoning;
    timeToGuessMs = Date.now() - turnStart;
  } else {
    const elapsedAfterTurn1 = Date.now() - turnStart;
    if (elapsedAfterTurn1 >= DEADLINE_MS) {
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
      const turn2ManifestId = await resolveManifest(pool, {
        provider: PROVIDER,
        model_id: MODEL_ID,
        messages: turn2Messages,
        temperature: 0.2,
        max_tokens: MAX_TOKENS,
      });
      const turn2 = await callOpenRouter(apiKey, turn2Messages, 2, calls, MAX_TOKENS);
      finalManifestId = turn2ManifestId;
      finalCall = turn2;

      if (turn2.error) {
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
        });
        await writeErrorResult(pool, evaluationId, row.event_id, calls, `OpenRouter turn 2 failed: ${turn2.error}`);
        process.exit(1);
      }

      const turn2Parse = parseFinalGuessResponse(turn2.content);
      if (turn2Parse.kind === "error") {
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
        });
        await writeErrorResult(pool, evaluationId, row.event_id, calls, turn2Parse.error);
        console.error(turn2Parse.error);
        process.exit(1);
      }
      if (turn2Parse.kind !== "guess") {
        const err = "Unexpected turn 2 response kind";
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
        });
        await writeErrorResult(pool, evaluationId, row.event_id, calls, err);
        console.error(err, turn2Parse.kind);
        process.exit(1);
      }

      finalGuess = turn2Parse.finalGuess;
      finalReasoning = turn2Parse.reasoning;
      timeToGuessMs = Date.now() - turnStart;
    }
  }

  if (!timedOut && finalGuess) {
    const elapsed = timeToGuessMs ?? Date.now() - turnStart;
    if (elapsed > DEADLINE_MS) {
      timedOut = true;
      console.log(`Timeout after final guess at ${elapsed}ms`);
    }
  }

  const critiqueMessages = buildCritiqueMessages(row.image_url, trueAnswer, row.title ?? "", row.location_name ?? "");
  await resolveManifest(pool, {
    provider: PROVIDER,
    model_id: MODEL_ID,
    messages: critiqueMessages,
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
  });
  const critique = await callOpenRouter(apiKey, critiqueMessages, 3, calls, MAX_TOKENS);
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

  if (timedOut || !finalGuess) {
    const timeoutMs = DAILY_TIMER_MS;
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
    });
    await writeCalls(pool, answerBankId, calls);
    await writeRawEvents(pool, evaluationId, calls);
    await writeDerivedResult(pool, evaluationId, {
      outcome: "timeout",
      error: null,
      calls,
      usage: finalCall.usage,
      locationAccuracy: result.locationAccuracy,
      yearAccuracy: result.yearAccuracy,
      roundAccuracy: result.roundAccuracy,
      distanceKm: result.distanceKm,
      yearDiff: result.yearDiff,
    });

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
    timeToGuessMs: timeToGuessMs ?? DAILY_TIMER_MS,
    imageQualityScore,
    imageQualityNotes,
    critiqueError,
    rawLlmResponse: finalGuessResponsePayload,
  });
  await writeCalls(pool, answerBankId, calls);
  await writeRawEvents(pool, evaluationId, calls);
  await writeDerivedResult(pool, evaluationId, {
    outcome: "guess",
    error: null,
    calls,
    usage: finalCall.usage,
    locationAccuracy: result.locationAccuracy,
    yearAccuracy: result.yearAccuracy,
    roundAccuracy: result.roundAccuracy,
    distanceKm: result.distanceKm,
    yearDiff: result.yearDiff,
  });

  console.log("Stored v3 answer for event", row.event_id, "ai_player", aiPlayerId, "evaluation_id", evaluationId);
  await pool.end();
  process.exit(0);
}

function buildTurn1Messages(imageUrl: string, hints: EventHint[]): unknown[] {
  const availableHints = hints.map((h) => `tier ${h.tier} ${h.type}`).join("\n") || "none";

  const systemPrompt =
    `You are a geospatial and historical reasoning assistant. You will be shown an image. ` +
    `Your task is to determine where (latitude and longitude) and when (year) the depicted historical event occurred.\n\n` +
    `You may either:\n` +
    `1. Submit a final guess immediately, OR\n` +
    `2. Request one or more hints by tier and type.\n\n` +
    `Available hints for this event (tier and type only; content is hidden until requested):\n${availableHints}\n\n` +
    `Respond with JSON only (no markdown). Use exactly one of the following shapes:\n\n` +
    `Final guess:\n` +
    `{"finalGuess": {"latitude": number, "longitude": number, "year": integer}, "reasoning": "your concise reasoning"}\n\n` +
    `Request hints:\n` +
    `{"hintRequests": [{"tier": integer, "type": "where" | "when"}]}\n\n` +
    `If you request hints, you will receive the requested hint content and must then submit a final guess.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl, detail: DETAIL_MODE } },
        { type: "text", text: "What is your guess or hint request?" },
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
    `{"finalGuess": {"latitude": number, "longitude": number, "year": integer}, "reasoning": "your concise reasoning"}`;

  return [
    ...priorMessages,
    { role: "assistant", content: assistantTurn1Content },
    { role: "user", content: userPrompt },
  ];
}

function buildCritiqueMessages(
  imageUrl: string,
  trueAnswer: { lat: number; lng: number; year: number; locationName: string | null },
  title: string,
  locationName: string | null
): unknown[] {
  const systemPrompt =
    `You are evaluating the provided historical image after the true answer has been revealed. ` +
    `Assess three things and return a single JSON object with exactly these keys:\n` +
    `  - imageQualityScore (integer 1-10): how accurately the image depicts the known historical event.\n` +
    `  - imageQualityNotes (string): brief explanation for the image quality score.\n` +
    `  - difficultyScore (integer 1-10): how hard the image would be for a skilled player to geolocate and date correctly before seeing the answer, considering visual ambiguity, common/generic subject matter, lack of identifying landmarks, etc.\n` +
    `  - difficultyNotes (string): brief explanation for the difficulty score.\n` +
    `  - authenticityScore (integer 1-10): how confident you are that the depicted event is a real historical event, as opposed to a staged photo, movie/TV still, reenactment, or AI-generated image.\n` +
    `  - authenticityNotes (string): brief explanation for the authenticity score.\n\n` +
    `Respond with JSON only (no markdown).`;

  const locationText = locationName ? ` (${locationName})` : "";
  const userPrompt =
    `The correct answer is: latitude ${trueAnswer.lat}, longitude ${trueAnswer.lng}, year ${trueAnswer.year}${locationText}. ` +
    `Event title: "${title || "unknown"}".\n\n` +
    `Rate the image quality, guess difficulty, and authenticity of the depicted event. Provide JSON with imageQualityScore, imageQualityNotes, difficultyScore, difficultyNotes, authenticityScore, and authenticityNotes.`;

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
  maxTokens: number
): Promise<OpenRouterCallResult> {
  const requestBody = {
    model: MODEL_ID,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
  };

  const requestStartedAt = new Date();
  const start = Date.now();
  let response: Response;
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
    });
  } catch (networkErr) {
    const responseReceivedAt = new Date();
    const durationMs = Date.now() - start;
    const errorMsg = `fetch failed: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`;
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
    };
  }

  let rawResponse: unknown;
  let responseText = "";
  try {
    rawResponse = await response.json();
    responseText = JSON.stringify(rawResponse);
  } catch (parseErr) {
    responseText = await response.text();
    rawResponse = { rawText: responseText };
  }
  const responseReceivedAt = new Date();
  const durationMs = Date.now() - start;

  if (!response.ok) {
    const errorMsg = `OpenRouter request failed: ${response.status} ${response.statusText} ${responseText}`;
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
    };
  }

  const envelopeError = extractEnvelopeError(rawResponse);
  if (envelopeError) {
    const errorMsg = `OpenRouter returned an error envelope${
      envelopeError.code !== null ? ` (${envelopeError.code})` : ""
    }: ${envelopeError.message}`;
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
    };
  }

  calls.push({
    turn_index: turnIndex,
    request_payload: requestBody,
    response_payload: rawResponse,
    duration_ms: durationMs,
    error: null,
  });

  const content = extractAssistantContent(rawResponse);
  const { reasoning, reasoningAvailable } = extractReasoning(rawResponse);
  return {
    content,
    rawResponse,
    requestStartedAt,
    responseReceivedAt,
    usage: extractUsage(rawResponse),
    reasoning,
    reasoningAvailable,
  };
}

function extractEnvelopeError(raw: unknown): { code: number | null; message: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const maybe = raw as Record<string, unknown>;
  const err = maybe.error;
  if (!err || typeof err !== "object") return null;
  const errObj = err as Record<string, unknown>;
  const code = typeof errObj.code === "number" ? errObj.code : null;
  const message = typeof errObj.message === "string" ? errObj.message : JSON.stringify(errObj);
  return { code, message };
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

function parseTurn1Response(text: string): TurnResult {
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

  return { latitude, longitude, year };
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
    "SELECT id FROM ai_players WHERE model_id = $1 LIMIT 1",
    [MODEL_ID]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  const inserted = await pool.query<{ id: string }>(
    "INSERT INTO ai_players (name, provider, model_id) VALUES ($1, $2, $3) RETURNING id",
    [AI_PLAYER_NAME, PROVIDER, MODEL_ID]
  );
  return inserted.rows[0].id;
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
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [contentHash, request.provider, request.model_id, content]
  );
  return inserted.rows[0].id;
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

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO ground_truth_versions (event_id, version, content_hash, content)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [row.event_id, version, contentHash, content]
  );
  return inserted.rows[0].id;
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
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [stimulusHash, imageUrl, sourceBytesSha256, detailMode]
  );
  return inserted.rows[0].id;
}

type EvalFactInput = {
  eventId: string;
  aiPlayerId: string;
  humanPlayerId: string | null;
  manifestId: string;
  groundTruthVersionId: string;
  stimulusId: string;
  callResult: OpenRouterCallResult;
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
    time_budget_ms: 90000,
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
      input.callResult.usage.prompt_tokens,
      input.callResult.usage.completion_tokens,
      input.callResult.usage.reasoning_tokens,
      input.callResult.usage.total_tokens,
      input.callResult.usage.cost,
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
      evaluation_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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

async function writeRawEvents(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  evaluationId: string,
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
      `INSERT INTO eval_raw_events (evaluation_id, event_type, raw_payload) VALUES ($1, $2, $3)`,
      [
        evaluationId,
        `openrouter_turn_${call.turn_index}`,
        {
          turn_index: call.turn_index,
          request: call.request_payload,
          response: call.response_payload,
          duration_ms: call.duration_ms,
          error: call.error,
        },
      ]
    );
  }
}

function classifyError(error: string | null): string | null {
  if (!error) return null;
  if (/OpenRouter request failed:\s*429/.test(error)) return "rate_limit";
  if (/OpenRouter request failed:\s*5\d{2}/.test(error)) return "server_error";
  if (/OpenRouter request failed:\s*4\d{2}/.test(error)) return "client_error";
  if (/OpenRouter returned an error envelope/.test(error)) return "envelope_error";
  if (/^fetch failed/.test(error)) return "network_error";
  if (/^Failed to parse AI/.test(error)) return "parse_failure";
  if (/timed? ?out/i.test(error)) return "timeout";
  return "other";
}

type DerivedResultInput = {
  outcome: "guess" | "timeout" | "error";
  error: string | null;
  calls: Array<{ turn_index: number; duration_ms: number; error: string | null }>;
  usage: OpenRouterUsage;
  locationAccuracy: number | null;
  yearAccuracy: number | null;
  roundAccuracy: number | null;
  distanceKm: number | null;
  yearDiff: number | null;
};

async function writeDerivedResult(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  evaluationId: string,
  input: DerivedResultInput
): Promise<void> {
  const perTurnLatencyMs = input.calls.map((c) => ({
    turn_index: c.turn_index,
    duration_ms: c.duration_ms,
    error_class: classifyError(c.error),
  }));
  const totalLatencyMs = input.calls.reduce((sum, c) => sum + c.duration_ms, 0);
  const costPerCompletionToken =
    input.usage.cost !== null && input.usage.completion_tokens
      ? input.usage.cost / input.usage.completion_tokens
      : null;

  const content = {
    outcome: input.outcome,
    error_class: classifyError(input.error),
    turn_count: input.calls.length,
    total_latency_ms: totalLatencyMs,
    per_turn: perTurnLatencyMs,
    cost_per_completion_token: costPerCompletionToken,
    location_accuracy: input.locationAccuracy,
    year_accuracy: input.yearAccuracy,
    round_accuracy: input.roundAccuracy,
    distance_km: input.distanceKm,
    year_diff: input.yearDiff,
  };

  await pool.query(
    `INSERT INTO eval_derived_results (evaluation_id, content) VALUES ($1, $2)`,
    [evaluationId, content]
  );
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
  const res = await pool.query<{ id: string }>(
    `INSERT INTO ai_answer_bank (
      event_id, ai_player_id, raw_llm_response, error,
      reference_year, reasoning, hints_requested, hint_penalty_applied,
      time_to_guess_ms, image_quality_score, image_quality_notes, critique_error,
      evaluation_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
    ]
  );
  await writeCalls(pool, res.rows[0].id, calls);
  await writeRawEvents(pool, evaluationId, calls);
  await writeDerivedResult(pool, evaluationId, {
    outcome: "error",
    error: errorMsg,
    calls,
    usage: nullUsage(),
    locationAccuracy: null,
    yearAccuracy: null,
    roundAccuracy: null,
    distanceKm: null,
    yearDiff: null,
  });
  console.log("Stored error row for event", eventId, "ai_player", aiPlayerId, "evaluation_id", evaluationId);
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
