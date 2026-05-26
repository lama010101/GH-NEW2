import type {
  CompeteSessionSnapshot,
  CreateCompeteSessionInput,
  JoinCompeteSessionInput,
  LatLng,
  SessionConfig,
  SessionPlayer,
  SetCompeteReadyInput,
  StartCompeteSessionInput
} from "./types";

export type CompeteFetch = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIsoDateOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSessionPlayer(value: unknown): value is SessionPlayer {
  return (
    isRecord(value) &&
    typeof value.playerId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.joinedAt === "string" &&
    isIsoDateOrNull(value.leftAt) &&
    typeof value.ready === "boolean" &&
    typeof value.isHost === "boolean" &&
    typeof value.hasSubmitted === "boolean"
  );
}

function isSessionConfig(value: unknown): value is SessionConfig {
  return (
    isRecord(value) &&
    (value.mode === "practice" || value.mode === "sync" || value.mode === "async") &&
    typeof value.roundTimerSec === "number" &&
    Number.isFinite(value.roundTimerSec) &&
    typeof value.totalRounds === "number" &&
    Number.isFinite(value.totalRounds) &&
    typeof value.yearMin === "number" &&
    Number.isFinite(value.yearMin) &&
    typeof value.yearMax === "number" &&
    Number.isFinite(value.yearMax) &&
    typeof value.resultsAutoAdvanceSec === "number" &&
    Number.isFinite(value.resultsAutoAdvanceSec) &&
    (value.hostPlayerId === null || typeof value.hostPlayerId === "string") &&
    isIsoDateOrNull(value.sessionDeadline) &&
    isIsoDateOrNull(value.startedAt) &&
    isIsoDateOrNull(value.completedAt)
  );
}

export function isCompeteSessionSnapshot(value: unknown): value is CompeteSessionSnapshot {
  if (!isRecord(value)) {
    console.error("[isCompeteSessionSnapshot] Not a record:", value);
    return false;
  }
  if (typeof value.gameId !== "string") {
    console.error("[isCompeteSessionSnapshot] Invalid gameId:", value.gameId);
    return false;
  }
  if (!["LOBBY", "ROUND_ACTIVE", "ROUND_COMPLETE", "SESSION_COMPLETE"].includes(value.status as string)) {
    console.error("[isCompeteSessionSnapshot] Invalid status:", value.status);
    return false;
  }
  if (!isSessionConfig(value.config)) {
    console.error("[isCompeteSessionSnapshot] Invalid config");
    return false;
  }
  if (!Array.isArray(value.players)) {
    console.error("[isCompeteSessionSnapshot] Players not an array:", value.players);
    return false;
  }
  for (let i = 0; i < value.players.length; i++) {
    if (!isSessionPlayer(value.players[i])) {
      console.error(`[isCompeteSessionSnapshot] Invalid player at index ${i}:`, value.players[i]);
      return false;
    }
  }
  if (typeof value.currentRoundIndex !== "number" || !Number.isFinite(value.currentRoundIndex)) {
    console.error("[isCompeteSessionSnapshot] Invalid currentRoundIndex:", value.currentRoundIndex);
    return false;
  }
  if (typeof value.allPlayersReady !== "boolean") {
    console.error("[isCompeteSessionSnapshot] Invalid allPlayersReady:", value.allPlayersReady);
    return false;
  }
  if (!isIsoDateOrNull(value.roundStartsAt)) {
    console.error("[isCompeteSessionSnapshot] Invalid roundStartsAt:", value.roundStartsAt);
    return false;
  }
  if (!(value.viewerPlayerId === null || typeof value.viewerPlayerId === "string")) {
    console.error("[isCompeteSessionSnapshot] Invalid viewerPlayerId:", value.viewerPlayerId);
    return false;
  }
  if (value.results !== undefined && !(value.results === null || Array.isArray(value.results))) {
    console.error("[isCompeteSessionSnapshot] Invalid results:", value.results);
    return false;
  }
  return true;
}

async function parseCompeteSnapshot(response: Response): Promise<CompeteSessionSnapshot> {
  const parsed = (await response.json().catch(() => null)) as unknown;

  if (!isCompeteSessionSnapshot(parsed)) {
    throw new Error("Invalid compete session payload");
  }

  return parsed;
}

async function extractError(response: Response): Promise<string> {
  const error = (await response.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
  return error.error || `Request failed (${response.status})`;
}

export async function createCompeteSessionRequest(input: CreateCompeteSessionInput, fetchImpl: CompeteFetch = fetch): Promise<CompeteSessionSnapshot> {
  const response = await fetchImpl("/api/compete/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ displayName: input.displayName ?? "", playerId: input.playerId, mode: input.mode, roundTimerSec: input.roundTimerSec, totalRounds: input.totalRounds, yearMin: input.yearMin, yearMax: input.yearMax })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return parseCompeteSnapshot(response);
}

export async function loadCompeteSessionRequest(gameId: string, playerId?: string, fetchImpl: CompeteFetch = fetch): Promise<CompeteSessionSnapshot | null> {
  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(gameId)}${query}`, {
    cache: "no-store"
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return parseCompeteSnapshot(response);
}

export async function joinCompeteSessionRequest(input: JoinCompeteSessionInput, fetchImpl: CompeteFetch = fetch): Promise<CompeteSessionSnapshot> {
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(input.gameId)}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ displayName: input.displayName ?? "", playerId: input.playerId })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return parseCompeteSnapshot(response);
}

export async function setCompeteReadyRequest(input: SetCompeteReadyInput, fetchImpl: CompeteFetch = fetch): Promise<CompeteSessionSnapshot> {
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(input.gameId)}/ready`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ playerId: input.playerId, ready: input.ready })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return parseCompeteSnapshot(response);
}

export async function startCompeteSessionRequest(input: StartCompeteSessionInput, fetchImpl: CompeteFetch = fetch): Promise<CompeteSessionSnapshot> {
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(input.gameId)}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ playerId: input.playerId })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return parseCompeteSnapshot(response);
}

export async function submitGuessRequest(
  input: {
    gameId: string;
    playerId: string;
    roundIndex: number;
    yearGuess: number | null;
    locationGuess: LatLng | null;
    hintsUsed: string[];
  },
  fetchImpl: CompeteFetch = fetch
): Promise<{ success: true }> {
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(input.gameId)}/guess`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      playerId: input.playerId,
      roundIndex: input.roundIndex,
      yearGuess: input.yearGuess,
      locationGuess: input.locationGuess,
      hintsUsed: input.hintsUsed
    })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return { success: true };
}

export async function advanceRoundRequest(
  input: {
    gameId: string;
    playerId: string;
    roundIndex: number;
  },
  fetchImpl: CompeteFetch = fetch
): Promise<{ success: true }> {
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(input.gameId)}/advance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      playerId: input.playerId,
      roundIndex: input.roundIndex
    })
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  return { success: true };
}

export async function getRoundResultsRequest(
  gameId: string,
  roundIndex: number,
  fetchImpl: CompeteFetch = fetch
): Promise<Array<{ playerId: string; score: number; rank: number; accuracy: number; guessLat: number | null; guessLng: number | null }>> {
  const response = await fetchImpl(`/api/compete/${encodeURIComponent(gameId)}/round/${roundIndex}/results`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await extractError(response));
  }

  const data = (await response.json()) as { results: Array<{ playerId: string; score: number; rank: number; accuracy: number; guessLat: number | null; guessLng: number | null }> };
  return data.results;
}
