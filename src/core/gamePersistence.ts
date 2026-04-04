import { createInitialGameState } from "./gameEngine";
import type { Badge, EventRecord, GameState, GuessState, LatLng, PendingSubmission, RoundResult } from "./types";

export type PersistenceFetch = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLatLng(value: unknown): value is LatLng {
  return isRecord(value) && typeof value.lat === "number" && Number.isFinite(value.lat) && typeof value.lng === "number" && Number.isFinite(value.lng);
}

function isEventRecord(value: unknown): value is EventRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.year === "number" &&
    Number.isFinite(value.year) &&
    isLatLng(value.location) &&
    typeof value.locationName === "string" &&
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

function isPendingSubmission(value: unknown): value is PendingSubmission {
  return isRecord(value) && typeof value.didTimeout === "boolean";
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

export function isPersistedGameState(value: unknown): value is GameState {
  return (
    isRecord(value) &&
    typeof value.gameId === "string" &&
    value.gameId.length > 0 &&
    (value.phase === "INIT" ||
      value.phase === "PREFLIGHT_CHECK" ||
      value.phase === "READY" ||
      value.phase === "ROUND_START" ||
      value.phase === "ROUND_ACTIVE" ||
      value.phase === "ROUND_LOCK" ||
      value.phase === "ROUND_EVALUATE" ||
      value.phase === "ROUND_COMPLETE" ||
      value.phase === "SESSION_COMPLETE") &&
    Array.isArray(value.preflightIssues) &&
    value.preflightIssues.every((issue) => typeof issue === "string") &&
    typeof value.currentRoundIndex === "number" &&
    Number.isFinite(value.currentRoundIndex) &&
    (value.timeRemaining === null || (typeof value.timeRemaining === "number" && Number.isFinite(value.timeRemaining))) &&
    Array.isArray(value.events) &&
    value.events.every(isEventRecord) &&
    isGuessState(value.currentGuess) &&
    Array.isArray(value.roundResults) &&
    value.roundResults.every(isRoundResult) &&
    isRecord(value.penalty) &&
    typeof value.penalty.accuracy === "number" &&
    Number.isFinite(value.penalty.accuracy) &&
    typeof value.penalty.xp === "number" &&
    Number.isFinite(value.penalty.xp) &&
    (value.pendingSubmission === null || isPendingSubmission(value.pendingSubmission)) &&
    (value.pendingRoundResult === null || isRoundResult(value.pendingRoundResult))
  );
}

export async function saveGameState(state: GameState, fetchImpl: PersistenceFetch = fetch): Promise<void> {
  const response = await fetchImpl("/api/game", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(state)
  });

  if (!response.ok) {
    throw new Error(`Unable to save game state (${response.status})`);
  }
}

export async function loadGameState(gameId: string, fetchImpl: PersistenceFetch = fetch): Promise<GameState | null> {
  const response = await fetchImpl(`/api/game/${encodeURIComponent(gameId)}`, {
    cache: "no-store"
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Unable to load game state (${response.status})`);
  }

  const parsed = (await response.json()) as unknown;
  if (!isPersistedGameState(parsed) || parsed.gameId !== gameId) {
    return null;
  }

  return parsed;
}

export function buildGamePath(gameId: string): string {
  return `/game/${gameId}`;
}

function hasPlayableImage(event: EventRecord): boolean {
  return typeof event.imageUrl === "string" && event.imageUrl.trim().length > 0;
}

export async function bootGameState({
  routeGameId,
  events,
  fetchImpl = fetch
}: {
  routeGameId?: string;
  events: EventRecord[];
  fetchImpl?: PersistenceFetch;
}): Promise<GameState> {
  const normalizedRouteGameId = routeGameId?.trim();
  const requestedGameId = normalizedRouteGameId && normalizedRouteGameId.length > 0 ? normalizedRouteGameId : null;

  if (requestedGameId) {
    const persistedState = await loadGameState(requestedGameId, fetchImpl);
    if (persistedState && persistedState.events.every(hasPlayableImage) && persistedState.roundResults.every((round) => hasPlayableImage(round.event))) {
      return persistedState;
    }
  }

  if (events.length === 0 || !events.every(hasPlayableImage)) {
    throw new Error("Unable to create a game because real events with images could not be loaded from the database");
  }

  const newState = createInitialGameState(events);
  await saveGameState(newState, fetchImpl);
  return newState;
}
