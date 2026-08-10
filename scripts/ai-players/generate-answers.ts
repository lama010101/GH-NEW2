import { config } from "dotenv";
import { getDbPool } from "@/server/db";
import { evaluateRound } from "@/core/rules";
import type { EventRecord, Location } from "@/core/types";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4.6";
const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_AI_PLAYER_NAME = "Claude Sonnet 4.6";

function parseArgs(): { eventId: string; modelId: string; provider: string; playerName: string } {
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
  };
}

const parsedArgs = parseArgs();
const MODEL_ID = parsedArgs.modelId;
const PROVIDER = parsedArgs.provider;
const AI_PLAYER_NAME = parsedArgs.playerName;

// Live Daily default timer (seconds). Confirmed in src/server/sessionCore.ts createDailySession.
const DAILY_TIMER_SECONDS = 90;
const DAILY_TIMER_MS = DAILY_TIMER_SECONDS * 1000;

// Test-only override: if set, use this as the cumulative timer deadline (ms).
// If unset, behavior is identical to current (90s). Stored timeout rows still
// record DAILY_TIMER_MS as the canonical timer maximum, not the override.
const DEADLINE_MS = (() => {
  const override = process.env.AI_V1_TIMER_OVERRIDE_MS;
  if (!override) return DAILY_TIMER_MS;
  const parsed = Number(override);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DAILY_TIMER_MS;
})();

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("OPENROUTER_API_KEY is missing. Set it in the environment or .env.local and rerun.");
    process.exit(1);
  }

  const eventId = parsedArgs.eventId;
  if (!eventId) {
    console.error(
      "Usage: tsx scripts/ai-players/generate-answers.ts [--model=<slug>] [--provider=<provider>] [--player-name=<name>] <event-id>"
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
  }>(
    `SELECT
      e.id AS event_id,
      e.event_year,
      l.latitude,
      l.longitude,
      l.display_name AS location_name,
      i.url AS image_url
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

  const trueAnswer = {
    lat: row.latitude,
    lng: row.longitude,
    year: row.event_year,
    locationName: row.location_name,
  };

  console.log("True answer:", JSON.stringify(trueAnswer));

  const referenceYear = new Date().getFullYear();

  const location: Location = {
    id: row.event_id,
    name: row.location_name ?? "",
    lat: row.latitude,
    lng: row.longitude,
  };

  const eventRecord: EventRecord = {
    id: row.event_id,
    title: "",
    description: "",
    year: row.event_year,
    location,
    region: "",
    imageUrl: row.image_url,
    thumbUrl: null,
    hints: [],
  };

  const turnStart = Date.now();
  const abortController = new AbortController();
  const abortTimer = setTimeout(() => abortController.abort(), DEADLINE_MS);

  let response: Response | undefined;
  let timedOut = false;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://guess-history.com",
        "X-Title": "Guess-History AI Players",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          {
            role: "system",
            content:
              "You are a geospatial and historical reasoning assistant. Look only at the image. Guess where and when the photo was taken. Reply with strict JSON only: {\"latitude\": number, \"longitude\": number, \"year\": number}. No markdown, no explanation.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: row.image_url },
              },
              {
                type: "text",
                text: 'Return JSON only: {"latitude": number, "longitude": number, "year": number}',
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 256,
      }),
      signal: abortController.signal,
    });
    clearTimeout(abortTimer);
  } catch (networkErr) {
    clearTimeout(abortTimer);
    if (networkErr instanceof Error && networkErr.name === "AbortError") {
      timedOut = true;
      console.log(`OpenRouter call aborted after ${DEADLINE_MS}ms`);
    } else {
      const errorMsg = `fetch failed: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`;
      await writeErrorResult(pool, row.event_id, null, errorMsg);
      console.error(errorMsg);
      await pool.end();
      process.exit(1);
    }
  }

  let rawResponse: unknown = null;
  let responseText = "";
  let guess: { latitude: number; longitude: number; year: number } | null = null;

  if (!timedOut && response) {
    try {
      rawResponse = await response.json();
      responseText = JSON.stringify(rawResponse);
    } catch {
      responseText = await response.text();
      rawResponse = { rawText: responseText };
    }

    const elapsedAfterResponse = Date.now() - turnStart;
    if (elapsedAfterResponse >= DEADLINE_MS) {
      timedOut = true;
      console.log(`OpenRouter response received after deadline (${elapsedAfterResponse}ms); discarding and recording timeout`);
    } else if (!response.ok) {
      const errorMsg = `OpenRouter request failed: ${response.status} ${response.statusText} ${responseText}`;
      await writeErrorResult(pool, row.event_id, rawResponse, errorMsg);
      console.error(errorMsg);
      await pool.end();
      process.exit(1);
    } else {
      const messageContent = extractAssistantContent(rawResponse);
      const parsedGuess = parseGuessJson(messageContent);

      if (!parsedGuess.ok) {
        const elapsedAfterParseError = Date.now() - turnStart;
        if (elapsedAfterParseError >= DEADLINE_MS) {
          timedOut = true;
          console.log(`AI guess parsing exceeded deadline (${elapsedAfterParseError}ms); discarding and recording timeout`);
        } else {
          const errorMsg = `Failed to parse AI guess: ${parsedGuess.error}`;
          await writeErrorResult(pool, row.event_id, rawResponse, errorMsg);
          console.error(errorMsg);
          console.log("Raw assistant content:", messageContent);
          await pool.end();
          process.exit(1);
        }
      } else {
        guess = parsedGuess.value;
        console.log("AI raw guess:", JSON.stringify(guess));

        const elapsedAfterGuess = Date.now() - turnStart;
        if (elapsedAfterGuess >= DEADLINE_MS) {
          timedOut = true;
          guess = null;
          console.log(`AI guess completed after deadline (${elapsedAfterGuess}ms); discarding and recording timeout`);
        }
      }
    }
  }

  if (timedOut) {
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
    await writeResult(pool, {
      eventId: row.event_id,
      aiPlayerId,
      result,
      referenceYear,
      timeToGuessMs: timeoutMs,
      rawLlmResponse: null,
      error: null,
    });
    console.log("Stored timeout result for event", row.event_id, "ai_player", aiPlayerId, "time_to_guess_ms", timeoutMs);
    await pool.end();
    process.exit(0);
  }

  if (!guess) {
    // Defensive: should never be reached because timedOut is handled above.
    const errorMsg = "Unexpected state: guess is null without timeout";
    await writeErrorResult(pool, row.event_id, rawResponse, errorMsg);
    console.error(errorMsg);
    await pool.end();
    process.exit(1);
  }

  const result = evaluateRound(
    eventRecord,
    { year: guess.year, location: { lat: guess.latitude, lng: guess.longitude } },
    0,
    false,
    0,
    0,
    referenceYear
  );

  console.log("Computed scores:", {
    distanceKm: result.distanceKm,
    yearDiff: result.yearDiff,
    locationAccuracy: result.locationAccuracy,
    yearAccuracy: result.yearAccuracy,
    roundAccuracy: result.roundAccuracy,
    roundXp: result.roundXp,
  });

  const aiPlayerId = await ensureAiPlayer(pool);
  const timeToGuessMs = Date.now() - turnStart;

  await writeResult(pool, {
    eventId: row.event_id,
    aiPlayerId,
    result,
    referenceYear,
    timeToGuessMs,
    rawLlmResponse: rawResponse,
    error: null,
  });

  await pool.end();
  process.exit(0);
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

type ParseResult =
  | { ok: true; value: { latitude: number; longitude: number; year: number } }
  | { ok: false; error: string };

function parseGuessJson(text: string): ParseResult {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return { ok: false, error: "No JSON object found in response" };
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch (err) {
      return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
    }
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Parsed value is not an object" };
  }

  const obj = parsed as Record<string, unknown>;
  const latitude = toFiniteNumber(obj.latitude);
  const longitude = toFiniteNumber(obj.longitude);
  const year = toFiniteNumber(obj.year);

  if (latitude === null || longitude === null || year === null) {
    return { ok: false, error: "Missing or non-numeric latitude/longitude/year" };
  }

  if (latitude < -90 || latitude > 90) {
    return { ok: false, error: `latitude out of range: ${latitude}` };
  }
  if (longitude < -180 || longitude > 180) {
    return { ok: false, error: `longitude out of range: ${longitude}` };
  }
  if (!Number.isInteger(year)) {
    return { ok: false, error: `year is not an integer: ${year}` };
  }

  return { ok: true, value: { latitude, longitude, year } };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
  timeToGuessMs: number;
  rawLlmResponse: unknown;
  error: string | null;
};

async function writeResult(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  input: ResultWriteInput
): Promise<void> {
  await pool.query(
    `INSERT INTO ai_answer_bank (
      event_id, ai_player_id, guess_lat, guess_lng, guess_year,
      distance_km, year_diff, location_accuracy, year_accuracy,
      round_accuracy, round_xp, raw_llm_response, error,
      reference_year, time_to_guess_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      time_to_guess_ms = EXCLUDED.time_to_guess_ms,
      created_at = now()`,
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
      input.rawLlmResponse as unknown,
      input.error,
      input.referenceYear,
      input.timeToGuessMs,
    ]
  );
  console.log("Stored result for event", input.eventId, "ai_player", input.aiPlayerId, "time_to_guess_ms", input.timeToGuessMs);
}

async function writeErrorResult(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  eventId: string,
  rawResponse: unknown,
  errorMsg: string
): Promise<void> {
  const aiPlayerId = await ensureAiPlayer(pool);
  await pool.query(
    `INSERT INTO ai_answer_bank (
      event_id, ai_player_id, raw_llm_response, error,
      reference_year, time_to_guess_ms
    ) VALUES ($1, $2, $3, $4, $5, $6)
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
      time_to_guess_ms = EXCLUDED.time_to_guess_ms,
      created_at = now()`,
    [eventId, aiPlayerId, rawResponse as unknown, errorMsg, null, null]
  );
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
