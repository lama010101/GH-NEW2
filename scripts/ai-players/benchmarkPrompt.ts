// AIP-BUILD-REASONINGGATE-1115-306 — bench-v1 benchmark mode for the v3
// AI-player worker (--prompt-version=bench-v1).
//
// PURE FUNCTIONS ONLY: no I/O, no DB, no fetch, no env reads, no clock.
// Every function is deterministic on its inputs. The legacy worker path
// (no --prompt-version flag) never calls these — generate-answers-v3.ts
// branches on the flag and stays byte-identical when it is absent.
//
// Product rule (Lolo, 2026-11-12): an AI play only counts if it returns
// usable reasoning (to help human players and AI providers) plus difficulty
// info. The gate below enforces that before any success write.

export const BENCH_PROMPT_VERSION = "bench-v1";

/** Minimum trimmed length of the turn-1 JSON `reasoning` string. */
export const MIN_REASONING_CHARS = 40;

export const BENCH_MAX_CLUES = 10;
export const BENCH_CLUE_MAX_CHARS = 200;
export const BENCH_MAX_HARD_FACTORS = 8;
export const BENCH_HARD_FACTOR_MAX_CHARS = 120;

export type BenchFinalGuess = {
  latitude: number;
  longitude: number;
  year: number;
  /** REQUIRED finite number in [0,1] (bench-v1 makes confidence mandatory). */
  confidence: number;
};

export type BenchPreReveal = {
  image_description: string;
  detected_clues: string[];
  year_reasoning: string;
  location_reasoning: string;
};

export type BenchPostReveal = {
  difficulty_year: number;
  difficulty_location: number;
  hard_factors: string[];
  event_plausibility: number;
  ai_image_depiction_score: number;
  fame_score: number;
  difficulty_notes: string;
};

export type BenchGateErrorClass = "no_reasoning" | "missing_fields";

export type BenchTurn1Ok = {
  kind: "ok";
  finalGuess: BenchFinalGuess;
  reasoning: string;
  preReveal: BenchPreReveal;
};

export type BenchTurn1Gate = {
  kind: "gate";
  errorClass: BenchGateErrorClass;
  /** Bank-row error text — always starts "NO_REASONING: " or "MISSING_FIELDS: ". */
  error: string;
};

export type BenchTurn1Parse = BenchTurn1Ok | BenchTurn1Gate;

/** Provider-side reasoning evidence for the hidden-reasoning gate. */
export type BenchReasoningInfo = {
  /** Readable reasoning text (message.reasoning or reasoning_details join). */
  text: string | null;
  /** usage.reasoning_tokens from the call (null when the provider omits it). */
  tokens: number | null;
};

export type BenchPostRevealParse = {
  postReveal: BenchPostReveal | null;
  error: string | null;
};

type BenchHint = { id: string; tier: number; type: string; content: string };

// ---------------------------------------------------------------------------
// Small local helpers (mirror the coercion semantics of generate-answers-v3.ts)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/** Same markdown-fence/outer-brace tolerant JSON extraction as the worker. */
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

function firstMessage(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const choices = raw.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!isRecord(first)) return null;
  const message = first.message;
  return isRecord(message) ? message : null;
}

// ---------------------------------------------------------------------------
// Turn 1 (guess) — bench-v1 prompt + reply schema
// ---------------------------------------------------------------------------

/**
 * Bench-v1 turn-1 messages. Hints are NEVER offered: the reply schema has no
 * hintRequests shape, and a hintRequests reply is a missing_fields failure.
 */
export function buildBenchTurn1Messages(imageUrl: string, detailMode: string): unknown[] {
  const systemPrompt =
    `You are a geospatial and historical reasoning assistant. You will be shown an image. ` +
    `Your task is to determine where (latitude and longitude) and when (year) the depicted historical event occurred, ` +
    `before the answer is revealed.\n\n` +
    `Submit a final guess with structured reasoning. Respond with JSON only (no markdown). ` +
    `Use exactly this shape — every field is REQUIRED:\n\n` +
    `{"finalGuess": {"latitude": number, "longitude": number, "year": integer, "confidence": number 0-1}, ` +
    `"reasoning": "your detailed reasoning for the guess", ` +
    `"preReveal": {"image_description": "what the image shows", "detected_clues": ["clue", "clue"], ` +
    `"year_reasoning": "why this year", "location_reasoning": "why this location"}}\n\n` +
    `Rules: latitude -90..90, longitude -180..180, year integer, confidence 0-1; ` +
    `reasoning must be a substantive explanation of at least ${MIN_REASONING_CHARS} characters; ` +
    `detected_clues is an array of 1 to ${BENCH_MAX_CLUES} short non-empty strings; ` +
    `preReveal describes only what is visible in the image BEFORE any answer is revealed.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl, detail: detailMode } },
        { type: "text", text: "What is your guess?" },
      ],
    },
  ];
}

const MISSING_FIELDS_GATE = (fields: string[]): BenchTurn1Gate => ({
  kind: "gate",
  errorClass: "missing_fields",
  error: `MISSING_FIELDS: ${fields.join(", ")}`,
});

/** Top-level fields expected in a bench-v1 turn-1 reply (catastrophic parse). */
const EXPECTED_TURN1_FIELDS = ["finalGuess", "reasoning", "preReveal"];

/**
 * Parse + validate a bench-v1 turn-1 reply. Pure: text in, verdict out.
 *
 * Gate precedence (deterministic): structural missing/invalid fields are
 * collected first — ANY of them yields missing_fields (this is also what
 * makes a hintRequests reply a missing_fields failure, per spec). Only when
 * every structural field is valid does a short/missing `reasoning` yield
 * no_reasoning. The hidden-reasoning check lives in gateBenchTurn1Response.
 */
export function parseBenchTurn1Response(text: string): BenchTurn1Parse {
  const cleaned = cleanJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return MISSING_FIELDS_GATE(EXPECTED_TURN1_FIELDS);
  }
  if (!isRecord(parsed)) {
    return MISSING_FIELDS_GATE(EXPECTED_TURN1_FIELDS);
  }
  const obj = parsed;

  const missing: string[] = [];

  // finalGuess — all four fields REQUIRED in bench-v1.
  let finalGuess: BenchFinalGuess | null = null;
  const fgRaw = obj.finalGuess;
  if (!isRecord(fgRaw)) {
    missing.push("finalGuess");
  } else {
    const latitude = toFiniteNumber(fgRaw.latitude);
    const longitude = toFiniteNumber(fgRaw.longitude);
    const year = toFiniteNumber(fgRaw.year);
    const confidence = toFiniteNumber(fgRaw.confidence);
    const fgMissing: string[] = [];
    if (latitude === null || latitude < -90 || latitude > 90) fgMissing.push("finalGuess.latitude");
    if (longitude === null || longitude < -180 || longitude > 180) fgMissing.push("finalGuess.longitude");
    if (year === null || !Number.isInteger(year)) fgMissing.push("finalGuess.year");
    if (confidence === null || confidence < 0 || confidence > 1) fgMissing.push("finalGuess.confidence");
    if (fgMissing.length > 0) {
      missing.push(...fgMissing);
    } else {
      finalGuess = {
        latitude: latitude as number,
        longitude: longitude as number,
        year: year as number,
        confidence: confidence as number,
      };
    }
  }

  // preReveal — all four keys REQUIRED.
  let preReveal: BenchPreReveal | null = null;
  const prRaw = obj.preReveal;
  if (!isRecord(prRaw)) {
    missing.push("preReveal");
  } else {
    const prMissing: string[] = [];
    const imageDescription = prRaw.image_description;
    const yearReasoning = prRaw.year_reasoning;
    const locationReasoning = prRaw.location_reasoning;
    if (typeof imageDescription !== "string" || imageDescription.length === 0) {
      prMissing.push("preReveal.image_description");
    }
    if (typeof yearReasoning !== "string" || yearReasoning.length === 0) {
      prMissing.push("preReveal.year_reasoning");
    }
    if (typeof locationReasoning !== "string" || locationReasoning.length === 0) {
      prMissing.push("preReveal.location_reasoning");
    }

    // detected_clues: array of 1..10 non-empty strings; >10 is TRUNCATED to
    // 10 (not rejected); each string truncated to 200 chars.
    let clues: string[] | null = null;
    const cluesRaw = prRaw.detected_clues;
    if (!Array.isArray(cluesRaw) || cluesRaw.length === 0) {
      prMissing.push("preReveal.detected_clues");
    } else {
      const items: string[] = [];
      let cluesOk = true;
      for (const item of cluesRaw) {
        if (typeof item !== "string" || item.length === 0) {
          cluesOk = false;
          break;
        }
        items.push(item.length > BENCH_CLUE_MAX_CHARS ? item.slice(0, BENCH_CLUE_MAX_CHARS) : item);
      }
      if (!cluesOk) {
        prMissing.push("preReveal.detected_clues");
      } else {
        clues = items.slice(0, BENCH_MAX_CLUES);
      }
    }

    if (prMissing.length > 0) {
      missing.push(...prMissing);
    } else {
      preReveal = {
        image_description: imageDescription as string,
        detected_clues: clues as string[],
        year_reasoning: yearReasoning as string,
        location_reasoning: locationReasoning as string,
      };
    }
  }

  // A hintRequests reply is a missing_fields failure in bench-v1 — the model
  // was never shown a hint menu.
  if (obj.hintRequests !== undefined) {
    missing.push("hintRequests");
  }

  if (missing.length > 0) {
    return MISSING_FIELDS_GATE(missing);
  }

  // reasoning — REQUIRED, trimmed length >= MIN_REASONING_CHARS.
  const reasoningRaw = obj.reasoning;
  if (typeof reasoningRaw !== "string" || reasoningRaw.trim().length < MIN_REASONING_CHARS) {
    return {
      kind: "gate",
      errorClass: "no_reasoning",
      error: `NO_REASONING: reasoning missing or shorter than ${MIN_REASONING_CHARS} characters`,
    };
  }

  return {
    kind: "ok",
    finalGuess: finalGuess as BenchFinalGuess,
    reasoning: reasoningRaw,
    preReveal: preReveal as BenchPreReveal,
  };
}

/**
 * Reasoning extraction for the bench-v1 path (provider trace):
 * keep message.reasoning when non-empty; otherwise fall back to joining the
 * readable `text` and `summary` fields of message.reasoning_details[].
 */
export function extractBenchReasoning(raw: unknown): {
  reasoning: string | null;
  reasoningAvailable: boolean;
} {
  const msg = firstMessage(raw);
  if (msg === null) return { reasoning: null, reasoningAvailable: false };

  const reasoningRaw = msg.reasoning;
  let text: string | null = null;
  if (typeof reasoningRaw === "string") {
    text = reasoningRaw;
  } else if (reasoningRaw !== undefined && reasoningRaw !== null) {
    text = JSON.stringify(reasoningRaw);
  }
  if (text !== null && text.trim().length > 0) {
    return { reasoning: text, reasoningAvailable: true };
  }

  const details = msg.reasoning_details;
  if (Array.isArray(details)) {
    const parts: string[] = [];
    for (const detail of details) {
      if (!isRecord(detail)) continue;
      for (const key of ["text", "summary"] as const) {
        const value = detail[key];
        if (typeof value === "string" && value.trim().length > 0) {
          parts.push(value);
        }
      }
    }
    if (parts.length > 0) {
      return { reasoning: parts.join("\n"), reasoningAvailable: true };
    }
  }

  return { reasoning: null, reasoningAvailable: false };
}

/**
 * Full bench-v1 turn-1 gate: structural parse first, then the hidden-
 * reasoning check. reasoning_tokens > 0 with NO readable reasoning text
 * anywhere (message.reasoning and reasoning_details both empty) means the
 * provider consumed reasoning tokens but hid the trace — the play cannot
 * prove usable reasoning → no_reasoning "hidden reasoning (reasoning_tokens=N)".
 */
export function gateBenchTurn1Response(
  text: string,
  reasoning: BenchReasoningInfo
): BenchTurn1Parse {
  const parsed = parseBenchTurn1Response(text);
  if (parsed.kind === "gate") return parsed;
  const tokens = reasoning.tokens;
  const hasText = typeof reasoning.text === "string" && reasoning.text.trim().length > 0;
  if (typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0 && !hasText) {
    return {
      kind: "gate",
      errorClass: "no_reasoning",
      error: `NO_REASONING: hidden reasoning (reasoning_tokens=${tokens})`,
    };
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Turn 3 (post-reveal review) — bench-v1 prompt + postReveal parser
// ---------------------------------------------------------------------------

/**
 * Bench-v1 review messages: ALL legacy keys (imageQualityScore/Notes,
 * difficultyScore/Notes, authenticityScore/Notes, hintReviews[]) plus the
 * REQUIRED postReveal object.
 */
export function buildBenchCritiqueMessages(
  imageUrl: string,
  trueAnswer: { lat: number; lng: number; year: number; locationName: string | null },
  title: string,
  locationName: string | null,
  description: string | null,
  allHints: readonly BenchHint[],
  detailMode: string
): unknown[] {
  const hasHints = allHints.length > 0;
  const systemPrompt =
    `You are evaluating the provided historical image after the true answer has been revealed. ` +
    `Assess the following and return a single JSON object with exactly these keys:\n` +
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
    `  - postReveal (object, REQUIRED) — your post-reveal assessment of the event:\n` +
    `      - difficulty_year (integer 1-10): how hard the YEAR was to guess before the reveal.\n` +
    `      - difficulty_location (integer 1-10): how hard the LOCATION was to guess before the reveal.\n` +
    `      - hard_factors (array of strings, max ${BENCH_MAX_HARD_FACTORS}, each at most ${BENCH_HARD_FACTOR_MAX_CHARS} characters): concrete factors that made the event hard.\n` +
    `      - event_plausibility (integer 1-10): how plausible the depicted event is as a real historical occurrence.\n` +
    `      - ai_image_depiction_score (integer 0-100): how well the image depicts the event. ` +
    `This judges image-to-event depiction quality only and is UNRELATED to the player-facing image rating (imageQualityScore).\n` +
    `      - fame_score (integer 0-100): how famous or well-known the event is.\n` +
    `      - difficulty_notes (string): brief explanation of the difficulty assessment.\n` +
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
    `Rate the image quality, guess difficulty, and authenticity of the depicted event, and provide the REQUIRED postReveal assessment. ` +
    `Provide JSON with imageQualityScore, imageQualityNotes, difficultyScore, difficultyNotes, authenticityScore, authenticityNotes` +
    (hasHints ? `, hintReviews` : "") +
    `, and postReveal.` +
    hintListText;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl, detail: detailMode } },
        { type: "text", text: userPrompt },
      ],
    },
  ];
}

/**
 * Parse the REQUIRED postReveal object out of a bench-v1 review reply.
 * Failure is NON-FATAL for the play: the caller records postReveal columns
 * as NULL and notes the error in critique_error.
 */
export function parseBenchPostReveal(text: string): BenchPostRevealParse {
  const fail = (detail: string): BenchPostRevealParse => ({
    postReveal: null,
    error: `postReveal parse: ${detail}`,
  });

  const cleaned = cleanJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return fail(`invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!isRecord(parsed)) {
    return fail("response is not a JSON object");
  }
  const raw = parsed.postReveal;
  if (!isRecord(raw)) {
    return fail("missing postReveal object");
  }

  const difficultyYear = toInt(raw.difficulty_year);
  if (difficultyYear === null || difficultyYear < 1 || difficultyYear > 10) {
    return fail("difficulty_year must be integer 1-10");
  }
  const difficultyLocation = toInt(raw.difficulty_location);
  if (difficultyLocation === null || difficultyLocation < 1 || difficultyLocation > 10) {
    return fail("difficulty_location must be integer 1-10");
  }
  const eventPlausibility = toInt(raw.event_plausibility);
  if (eventPlausibility === null || eventPlausibility < 1 || eventPlausibility > 10) {
    return fail("event_plausibility must be integer 1-10");
  }
  const depiction = toInt(raw.ai_image_depiction_score);
  if (depiction === null || depiction < 0 || depiction > 100) {
    return fail("ai_image_depiction_score must be integer 0-100");
  }
  const fame = toInt(raw.fame_score);
  if (fame === null || fame < 0 || fame > 100) {
    return fail("fame_score must be integer 0-100");
  }

  const hardFactorsRaw = raw.hard_factors;
  if (!Array.isArray(hardFactorsRaw) || hardFactorsRaw.length > BENCH_MAX_HARD_FACTORS) {
    return fail(`hard_factors must be an array of at most ${BENCH_MAX_HARD_FACTORS} strings`);
  }
  const hardFactors: string[] = [];
  for (const item of hardFactorsRaw) {
    if (typeof item !== "string" || item.length > BENCH_HARD_FACTOR_MAX_CHARS) {
      return fail(`hard_factors entries must be strings of at most ${BENCH_HARD_FACTOR_MAX_CHARS} characters`);
    }
    hardFactors.push(item);
  }

  const difficultyNotes = raw.difficulty_notes;
  if (typeof difficultyNotes !== "string") {
    return fail("difficulty_notes must be a string");
  }

  return {
    postReveal: {
      difficulty_year: difficultyYear,
      difficulty_location: difficultyLocation,
      hard_factors: hardFactors,
      event_plausibility: eventPlausibility,
      ai_image_depiction_score: depiction,
      fame_score: fame,
      difficulty_notes: difficultyNotes,
    },
    error: null,
  };
}
