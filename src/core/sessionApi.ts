import type { Badge, EventRecord, GameState, GuessState, LatLng, RoundResult } from "./types";

/**
 * Sanitizes GameState for persistence by stripping transient fields.
 */
export function sanitizeForPersistence(state: GameState): GameState {
  return state;
}

export type SessionFetch = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLatLng(value: unknown): value is LatLng {
  return isRecord(value) && typeof value.lat === "number" && Number.isFinite(value.lat) && typeof value.lng === "number" && Number.isFinite(value.lng);
}

function isLocation(value: unknown): value is Location {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.lat === "number" && Number.isFinite(value.lat) &&
    typeof value.lng === "number" && Number.isFinite(value.lng)
  );
}

function isEventRecord(value: unknown): value is EventRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.year === "number" &&
    Number.isFinite(value.year) &&
    isLocation(value.location) &&
    typeof value.region === "string" &&
    (value.imageUrl === null || isNonEmptyString(value.imageUrl)) &&
    (value.thumbUrl === null || isNonEmptyString(value.thumbUrl)) &&
    Array.isArray(value.hints)
  );
}

function isGuessState(value: unknown): value is GuessState {
  if (!isRecord(value)) {
    return false;
  }

  const year = value.year;
  const location = value.location;

  return (year === null || (typeof year === "number" && Number.isFinite(year))) && (location === null || isLatLng(location));
}

function isBadge(value: unknown): value is Badge {
  return (
    isRecord(value) &&
    (value.dimension === "location" || value.dimension === "year" || value.dimension === "combo") &&
    (value.tier === "gold" || value.tier === "silver" || value.tier === "bronze") &&
    typeof value.accuracy === "number" &&
    Number.isFinite(value.accuracy)
  );
}

function isRoundResult(value: unknown): value is RoundResult {
  return (
    isRecord(value) &&
    typeof value.roundIndex === "number" &&
    Number.isFinite(value.roundIndex) &&
    isEventRecord(value.event) &&
    isGuessState(value.guess) &&
    typeof value.distanceKm === "number" &&
    Number.isFinite(value.distanceKm) &&
    typeof value.yearDiff === "number" &&
    Number.isFinite(value.yearDiff) &&
    typeof value.yearAccuracy === "number" &&
    Number.isFinite(value.yearAccuracy) &&
    typeof value.locationAccuracy === "number" &&
    Number.isFinite(value.locationAccuracy) &&
    typeof value.comboAccuracy === "number" &&
    Number.isFinite(value.comboAccuracy) &&
    typeof value.roundAccuracy === "number" &&
    Number.isFinite(value.roundAccuracy) &&
    typeof value.roundXp === "number" &&
    Number.isFinite(value.roundXp) &&
    Array.isArray(value.badges) &&
    value.badges.every(isBadge) &&
    typeof value.didTimeout === "boolean"
  );
}

export function isSessionProjection(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }

  // Check required string fields
  if (typeof value.gameId !== "string" || value.gameId.length === 0) {
    console.error("[PROJECTION_VALIDATION_FAILED] Invalid gameId", { value });
    return false;
  }

  // Check phase
  const validPhases = [
    "INIT",
    "PREFLIGHT_CHECK",
    "READY",
    "ROUND_START",
    "ROUND_ACTIVE",
    "ROUND_COMPLETE",
    "SESSION_COMPLETE"
  ];
  if (!validPhases.includes(value.phase as string)) {
    console.error("[PROJECTION_VALIDATION_FAILED] Invalid phase", { phase: value.phase });
    return false;
  }

  // Check events array
  if (!Array.isArray(value.events) || !value.events.every(isEventRecord)) {
    console.error("[PROJECTION_VALIDATION_FAILED] Invalid events array");
    return false;
  }

  // Check currentGuess
  if (!isGuessState(value.currentGuess)) {
    console.error("[PROJECTION_VALIDATION_FAILED] Invalid currentGuess", { currentGuess: value.currentGuess });
    return false;
  }

  // Check roundResults
  if (!Array.isArray(value.roundResults) || !value.roundResults.every(isRoundResult)) {
    console.error("[PROJECTION_VALIDATION_FAILED] Invalid roundResults");
    return false;
  }

  // Check penalty
  if (!isRecord(value.penalty) ||
      typeof value.penalty.accuracy !== "number" ||
      typeof value.penalty.xp !== "number") {
    console.error("[PROJECTION_VALIDATION_FAILED] Invalid penalty", { penalty: value.penalty });
    return false;
  }

  return true;
}

async function parseSessionProjection(response: Response): Promise<GameState> {
  let parsed: unknown;
  try {
    parsed = (await response.json()) as unknown;
  } catch (parseError) {
    console.error("[PROJECTION_PARSE_FAILED]", {
      status: response.status,
      error: parseError,
      timestamp: Date.now()
    });
    throw new Error("Invalid session projection payload - JSON parse failed");
  }

  if (!isSessionProjection(parsed)) {
    console.error("[PROJECTION_VALIDATION_FAILED] Full payload:", { parsed });
    throw new Error("Invalid session projection payload - validation failed");
  }

  console.log("[PROJECTION_PARSE_SUCCESS]", {
    gameId: parsed.gameId,
    phase: parsed.phase,
    timestamp: Date.now()
  });

  return parsed;
}

async function extractError(response: Response): Promise<string> {
  const error = (await response.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
  return error.error || `Request failed (${response.status})`;
}

function adaptCompeteSnapshot(raw: unknown): GameState {
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>).gameId !== "string" ||
    typeof (raw as Record<string, unknown>).status !== "string"
  ) {
    throw new Error("Invalid compete session payload");
  }

  const snap = raw as Record<string, unknown>;

  const statusToPhase: Record<string, string> = {
    "LOBBY": "READY",
    "ROUND_ACTIVE": "ROUND_ACTIVE",
    "ROUND_COMPLETE": "ROUND_COMPLETE",
    "SESSION_COMPLETE": "SESSION_COMPLETE"
  };

  const phase = statusToPhase[snap.status as string] ?? "READY";

  return {
    gameId: snap.gameId as string,
    phase,
    events: [],
    currentRoundIndex: typeof snap.currentRoundIndex === "number" ? snap.currentRoundIndex : 0,
    currentGuess: { year: null, location: null },
    roundResults: [],
    penalty: { accuracy: 0, xp: 0 },
    timerSeconds: null,
    roundStartedAt: snap.roundStartsAt as string ?? null,
    isHost: false
  } as unknown as GameState;
}

export async function createSession(fetchImpl: SessionFetch = fetch): Promise<GameState> {
  const response = await fetchImpl("/api/compete/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Player" })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  const raw = await response.json().catch(() => null);
  return adaptCompeteSnapshot(raw);
}

export async function loadSession(gameId: string, fetchImpl: SessionFetch = fetch): Promise<GameState | null> {
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(gameId)}`, {
    cache: "no-store"
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  const raw = await response.json().catch(() => null);
  return adaptCompeteSnapshot(raw);
}

export async function startRound(gameId: string, roundIndex: number, fetchImpl: SessionFetch = fetch): Promise<GameState> {
  const response = await fetchImpl(`/api/session/${encodeURIComponent(gameId)}/round/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ roundIndex })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return parseSessionProjection(response);
}

export async function commitRound(
  input: {
    gameId: string;
    roundIndex: number;
    yearGuess: number | null;
    locationGuess: LatLng | null;
    hintsUsed: string[];
  },
  fetchImpl: SessionFetch = fetch
): Promise<GameState> {
  const response = await fetchImpl(`/api/session/${encodeURIComponent(input.gameId)}/round/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roundIndex: input.roundIndex,
      yearGuess: input.yearGuess,
      locationGuess: input.locationGuess,
      hintsUsed: input.hintsUsed
    })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return parseSessionProjection(response);
}

export function buildGamePath(gameId: string): string {
  return `/game/${gameId}`;
}
