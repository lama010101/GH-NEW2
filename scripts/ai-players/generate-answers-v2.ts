import { config } from "dotenv";
import { getDbPool } from "@/server/db";
import { evaluateRound } from "@/core/rules";
import type { EventRecord, EventHint, Location } from "@/core/types";
import { TIER_PENALTY_RATE } from "@/core/hintPenalties";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_ID = "anthropic/claude-sonnet-4.6";
const PROVIDER = "openrouter";
const AI_PLAYER_NAME = "Claude Sonnet 4.6 via OpenRouter";

// Live Daily default timer (seconds). Confirmed in src/server/sessionCore.ts createDailySession.
const DAILY_TIMER_SECONDS = 90;
const DAILY_TIMER_MS = DAILY_TIMER_SECONDS * 1000;

// Test-only override: if set, use this as the cumulative timer deadline (ms).
// If unset, behavior is identical to current (90s). Stored timeout rows still
// record DAILY_TIMER_MS as the canonical timer maximum, not the override.
const DEADLINE_MS = (() => {
  const override = process.env.AI_V2_TIMER_OVERRIDE_MS;
  if (!override) return DAILY_TIMER_MS;
  const parsed = Number(override);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DAILY_TIMER_MS;
})();

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

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("OPENROUTER_API_KEY is missing. Set it in the environment or .env.local and rerun.");
    process.exit(1);
  }

  const eventId = process.argv[2];
  if (!eventId) {
    console.error("Usage: tsx scripts/ai-players/generate-answers-v2.ts <event-id>");
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

  const referenceYear = new Date().getFullYear();
  const turnStart = Date.now();
  const calls: Array<{
    turn_index: number;
    request_payload: unknown;
    response_payload: unknown;
    duration_ms: number;
    error: string | null;
  }> = [];

  // Turn 1: image + available hint list. Model either final-guesses or requests hints.
  const turn1Messages = buildTurn1Messages(row.image_url, hints);
  const turn1 = await callOpenRouter(apiKey, turn1Messages, 1, calls);
  if (turn1.error) {
    await writeErrorResult(pool, row.event_id, calls, `OpenRouter turn 1 failed: ${turn1.error}`);
    process.exit(1);
  }

  const turn1Parse = parseTurn1Response(turn1.content);
  if (turn1Parse.kind === "error") {
    await writeErrorResult(pool, row.event_id, calls, turn1Parse.error);
    console.error(turn1Parse.error);
    process.exit(1);
  }

  let finalGuess: FinalGuess | null = null;
  let reasoning: string | null = null;
  let suppliedHints: SuppliedHint[] = [];
  let timedOut = false;
  let timeToGuessMs: number | null = null;

  if (turn1Parse.kind === "guess") {
    finalGuess = turn1Parse.finalGuess;
    reasoning = turn1Parse.reasoning;
    timeToGuessMs = Date.now() - turnStart;
  } else {
    // Turn 2: supply requested hint content and get final guess.
    const elapsedAfterTurn1 = Date.now() - turnStart;
    if (elapsedAfterTurn1 >= DEADLINE_MS) {
      timedOut = true;
      console.log(`Timeout after turn 1 at ${elapsedAfterTurn1}ms`);
    } else {
      const hintRequests = turn1Parse.hintRequests;
      const { supplied, missing } = resolveHintRequests(hints, hintRequests);
      suppliedHints = supplied;

      if (missing.length > 0) {
        console.warn(`Requested hint tier/type not found: ${missing.map((m) => `tier=${m.tier} type=${m.type}`).join(", ")}`);
      }

      const turn2Messages = buildTurn2Messages(turn1Messages, turn1.content, supplied);
      const turn2 = await callOpenRouter(apiKey, turn2Messages, 2, calls);
      if (turn2.error) {
        await writeErrorResult(pool, row.event_id, calls, `OpenRouter turn 2 failed: ${turn2.error}`);
        process.exit(1);
      }

      const turn2Parse = parseFinalGuessResponse(turn2.content);
      if (turn2Parse.kind === "error") {
        await writeErrorResult(pool, row.event_id, calls, turn2Parse.error);
        console.error(turn2Parse.error);
        process.exit(1);
      }
      if (turn2Parse.kind !== "guess") {
        await writeErrorResult(pool, row.event_id, calls, "Unexpected turn 2 response kind");
        console.error("Unexpected turn 2 response kind:", turn2Parse.kind);
        process.exit(1);
      }

      finalGuess = turn2Parse.finalGuess;
      reasoning = turn2Parse.reasoning;
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

  // Turn 3: reveal correct answer and get image-quality critique. Always runs.
  const critiqueMessages = buildCritiqueMessages(row.image_url, trueAnswer, row.title ?? "", row.location_name ?? "");
  const critique = await callOpenRouter(apiKey, critiqueMessages, 3, calls);
  const critiqueParse = critique.error
    ? { score: null, notes: null, error: `OpenRouter turn 3 failed: ${critique.error}` }
    : parseCritiqueResponse(critique.content);

  let imageQualityScore: number | null = null;
  let imageQualityNotes: string | null = null;
  let critiqueError: string | null = null;

  if (critiqueParse.error) {
    critiqueError = critiqueParse.error;
    console.warn(`Critique error: ${critiqueParse.error}`);
  } else {
    imageQualityScore = critiqueParse.score;
    imageQualityNotes = critiqueParse.notes;
  }

  if (timedOut || !finalGuess) {
    // Timeout result: match human-timeout shape (null guess, zero scores, timer max time).
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
    const answerBankId = await writeResult(pool, {
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
      rawLlmResponse: null,
    });
    await writeCalls(pool, answerBankId, calls);

    console.log("Stored timeout result for event", row.event_id, "ai_player", aiPlayerId, "time_to_guess_ms", timeoutMs);
    await pool.end();
    process.exit(0);
  }

  // Compute penalty from supplied hints.
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

  const answerBankId = await writeResult(pool, {
    eventId: row.event_id,
    aiPlayerId,
    result,
    referenceYear,
    reasoning,
    hintsRequested: hintsRequestedPayload,
    hintPenaltyApplied: hintPenaltyAppliedPayload,
    timeToGuessMs: timeToGuessMs ?? DAILY_TIMER_MS,
    imageQualityScore,
    imageQualityNotes,
    critiqueError,
    rawLlmResponse: finalGuessResponsePayload,
  });
  await writeCalls(pool, answerBankId, calls);

  console.log("Stored v2 answer for event", row.event_id, "ai_player", aiPlayerId);
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
        { type: "image_url", image_url: { url: imageUrl } },
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
  const hintsText = suppliedHints
    .map((h) => `- Tier ${h.tier} ${h.type}: "${h.content}"`)
    .join("\n");

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
    `You are evaluating how accurately the provided image depicts a known historical event. ` +
    `You will be shown the image and told the correct answer (where and when). ` +
    `Provide an integer score from 1 (very inaccurate or misleading) to 10 (highly accurate and representative) and brief explanatory notes.\n\n` +
    `Respond with JSON only (no markdown): {"imageQualityScore": integer (1-10), "imageQualityNotes": "string"}`;

  const locationText = locationName ? ` (${locationName})` : "";
  const userPrompt =
    `The correct answer is: latitude ${trueAnswer.lat}, longitude ${trueAnswer.lng}, year ${trueAnswer.year}${locationText}. ` +
    `Event title: "${title || "unknown"}".\n\n` +
    `Rate how realistically and accurately the image depicts this historical event.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
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
  }>
): Promise<{ content: string; error?: string }> {
  const requestBody = {
    model: MODEL_ID,
    messages,
    temperature: 0.2,
    max_tokens: 1024,
  };

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
    const durationMs = Date.now() - start;
    const errorMsg = `fetch failed: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`;
    calls.push({
      turn_index: turnIndex,
      request_payload: requestBody,
      response_payload: { rawText: "" },
      duration_ms: durationMs,
      error: errorMsg,
    });
    return { content: "", error: errorMsg };
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
    return { content: "", error: errorMsg };
  }

  calls.push({
    turn_index: turnIndex,
    request_payload: requestBody,
    response_payload: rawResponse,
    duration_ms: durationMs,
    error: null,
  });

  const content = extractAssistantContent(rawResponse);
  return { content };
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

function parseCritiqueResponse(text: string): { score: number | null; notes: string | null; error?: string } {
  const cleaned = cleanJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { score: null, notes: null, error: `Failed to parse critique response: ${(err as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { score: null, notes: null, error: "Critique response is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;
  const score = toFiniteNumber(obj.imageQualityScore);
  if (score === null || score < 1 || score > 10 || !Number.isInteger(score)) {
    return { score: null, notes: null, error: "Critique response has invalid imageQualityScore (must be integer 1-10)" };
  }

  const notes = typeof obj.imageQualityNotes === "string" ? obj.imageQualityNotes : null;
  return { score, notes };
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

type ResultWriteInput = {
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
      time_to_guess_ms, image_quality_score, image_quality_notes, critique_error
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
      time_to_guess_ms, image_quality_score, image_quality_notes, critique_error
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
    ]
  );
  await writeCalls(pool, res.rows[0].id, calls);
  console.log("Stored error row for event", eventId, "ai_player", aiPlayerId);
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
