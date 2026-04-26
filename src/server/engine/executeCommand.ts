// src/server/engine/executeCommand.ts
// TASK: MP-AUTH-001 — Enforce Single Snapshot Builder
//
// Read-side command executor — uses canonical snapshot builder only.
//
// ARCHITECTURE:
// - NO DB writes
// - NO mutation logic
// - Snapshot via loadCompeteSessionSnapshot (single builder)
// - Pure read function

import { loadCompeteSessionSnapshot } from "@/server/sessionCore";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { TransitionCause } from "@/core/transitionCause";
import type { SubmitGuessInput } from "@/server/sessionCore";

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;

  Object.freeze(obj);

  for (const key of Object.keys(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (obj as any)[key];
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return obj;
}

function handleCommand(
  snapshot: CompeteSessionSnapshot,
  _input: ExecuteCommandInput
): CompeteSessionSnapshot {
  void _input;
  return snapshot;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMAND TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type SubmitGuessCommand = {
  type: "SUBMIT_GUESS";
  gameId: string;
  playerId: string;
  roundIndex: number;
  yearGuess: number | null;
  locationGuess: { lat: number; lng: number } | null;
  hintsUsed: string[];
  viewerPlayerId?: string | null;
};

export type AdvanceRoundCommand = {
  type: "ADVANCE_ROUND";
  gameId: string;
  cause: TransitionCause;
  playerId?: string;
  roundIndex: number;
  viewerPlayerId?: string | null;
};

export type Command = SubmitGuessCommand | AdvanceRoundCommand;

type ExecuteCommandInput =
  | { type: "SUBMIT_GUESS"; payload: SubmitGuessInput };

// ═════════════════════════════════════════════════════════════════════════════
// COMMAND EXECUTOR — Read-side only, canonical snapshot builder
// ═════════════════════════════════════════════════════════════════════════════
// Returns canonical snapshot via loadCompeteSessionSnapshot (single builder).
// NO DB writes, NO mutation logic, pure read function.
// ═════════════════════════════════════════════════════════════════════════════

function validateCommandInput(input: ExecuteCommandInput): void {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid command input: expected object");
  }
  if (input.type !== "SUBMIT_GUESS") {
    throw new Error(`Invalid command type: ${input.type}`);
  }
  if (!input.payload || typeof input.payload !== "object") {
    throw new Error("Invalid command payload: expected object");
  }
  if (typeof input.payload.gameId !== "string" || input.payload.gameId.length === 0) {
    throw new Error("Invalid command payload: gameId must be a non-empty string");
  }
  if (typeof input.payload.playerId !== "string" || input.payload.playerId.length === 0) {
    throw new Error("Invalid command payload: playerId must be a non-empty string");
  }
  if (typeof input.payload.yearGuess !== "number") {
    throw new Error("Invalid command payload: yearGuess must be a number");
  }
  if (!input.payload.locationGuess || typeof input.payload.locationGuess !== "object") {
    throw new Error("Invalid command payload: locationGuess must be an object");
  }
  const location = input.payload.locationGuess as { lat: unknown; lng: unknown };
  if (typeof location.lat !== "number" || typeof location.lng !== "number") {
    throw new Error("Invalid command payload: locationGuess must have lat and lng as numbers");
  }
}

function validateCommandState(
  snapshot: CompeteSessionSnapshot,
  input: ExecuteCommandInput
): void {
  if (input.type !== "SUBMIT_GUESS") {
    throw new Error("Unsupported command type");
  }

  const { roundIndex, yearGuess, locationGuess, playerId } = input.payload;

  // RULE 1 — Must be in active round
  if (snapshot.status !== "ROUND_ACTIVE") {
    throw new Error("Round is not active");
  }

  // RULE 2 — Round index must match
  if (roundIndex !== snapshot.currentRoundIndex) {
    throw new Error("Invalid round index");
  }

  // RULE 3 — Player must exist
  const player = snapshot.players.find(p => p.playerId === playerId);
  if (!player) {
    throw new Error("Player not found");
  }

  // RULE 5 — Year required
  if (typeof yearGuess !== "number") {
    throw new Error("Year guess required");
  }

  // RULE 6 — Location required
  if (
    !locationGuess ||
    typeof locationGuess.lat !== "number" ||
    typeof locationGuess.lng !== "number"
  ) {
    throw new Error("Location guess required");
  }
}

export async function executeCommand(
  input: ExecuteCommandInput
): Promise<CompeteSessionSnapshot> {
  validateCommandInput(input);

  const gameId = input.payload.gameId;
  const rawSnapshot = await loadCompeteSessionSnapshot(gameId, null);
  if (!rawSnapshot) {
    throw new Error(`Session not found: ${gameId}`);
  }

  const snapshot = deepFreeze(rawSnapshot);

  validateCommandState(snapshot, input);

  return handleCommand(snapshot, input);
}
