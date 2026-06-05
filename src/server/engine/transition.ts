// src/server/engine/transition.ts
// TASK: MP-ARCH-PHASE-1-TRANSITION-EXTRACTION
//
// Centralized transition engine extracted from sessionCore.ts.
//
// CONSTRAINTS (HARD):
// - NO runtime behavior change
// - NO new validation
// - NO DB access
// - Pure function: state + intent → events
//
// This file is the SINGLE place where transition decision logic lives.
// Integration in sessionCore.ts compares output but does NOT drive logic.

import type { EventType } from "@/server/eventStore";
import type { TransitionCause } from "@/core/transitionCause";
import type { LatLng } from "@/core/types";

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type TransitionState = {
  totalRounds: number;
  activePlayerCount: number;
};

export type SubmitGuessContext = {
  gameId: string;
  playerId: string;
  roundIndex: number;
  yearGuess: number | null;
  locationGuess: LatLng | null;
  hintsUsed: string[];
  hasExistingCommit: boolean;
  score: number;
  commitToken: string;
  currentRoundCommitCountBefore: number;
};

export type AdvanceRoundContext = {
  gameId: string;
  cause: TransitionCause;
  playerId?: string;
  roundIndex: number;
  nextRoundEventId: string | null;
  startedAt: string;
  phaseEndsAt: string | null;
};

export type Intent =
  | { type: "SUBMIT_GUESS"; context: SubmitGuessContext }
  | { type: "ADVANCE_ROUND"; context: AdvanceRoundContext };

export type TransitionEvent = {
  type: EventType;
  payload: Record<string, unknown>;
  roundIndex: number | null;
};

export type TransitionResult = {
  events: TransitionEvent[];
};

// ═════════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═════════════════════════════════════════════════════════════════════════════

function handleSubmitGuess(
  state: TransitionState,
  intent: SubmitGuessContext
): TransitionResult {
  const events: TransitionEvent[] = [];

  // Duplicate submission: no events (matches existing early-return behavior)
  if (intent.hasExistingCommit) {
    return { events };
  }

  // 1. GUESS_SUBMITTED (always emitted for new commits)
  events.push({
    type: "GUESS_SUBMITTED",
    payload: {
      playerId: intent.playerId,
      yearGuess: intent.yearGuess,
      score: intent.score,
      verificationToken: intent.commitToken
    },
    roundIndex: intent.roundIndex
  });

  // 2. ROUND_COMPLETE (if all active players have now submitted)
  const commitCountAfter = intent.currentRoundCommitCountBefore + 1;
  if (
    state.activePlayerCount > 0 &&
    commitCountAfter >= state.activePlayerCount
  ) {
    events.push({
      type: "ROUND_COMPLETE",
      payload: {
        commitCount: commitCountAfter,
        resultPhaseStartedAt: "__timestamp__"
      },
      roundIndex: intent.roundIndex
    });
  }

  return { events };
}

function handleAdvanceRound(
  state: TransitionState,
  intent: AdvanceRoundContext
): TransitionResult {
  const events: TransitionEvent[] = [];
  const nextRoundIndex = intent.roundIndex + 1;

  if (nextRoundIndex < state.totalRounds) {
    events.push({
      type: "ROUND_STARTED",
      payload: {
        roundIndex: nextRoundIndex,
        eventId: intent.nextRoundEventId,
        startedAt: intent.startedAt,
        phaseEndsAt: intent.phaseEndsAt,
        cause: intent.cause,
        ...(intent.playerId ? { playerId: intent.playerId } : {})
      },
      roundIndex: nextRoundIndex
    });
  } else {
    events.push({
      type: "SESSION_COMPLETE",
      payload: {
        totalRounds: state.totalRounds,
        cause: intent.cause,
        ...(intent.playerId ? { playerId: intent.playerId } : {})
      },
      roundIndex: intent.roundIndex
    });
  }

  return { events };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY
// ═════════════════════════════════════════════════════════════════════════════

export function transition(
  state: TransitionState,
  intent: Intent
): TransitionResult {
  switch (intent.type) {
    case "SUBMIT_GUESS":
      return handleSubmitGuess(state, intent.context);
    case "ADVANCE_ROUND":
      return handleAdvanceRound(state, intent.context);
    default: {
      const _exhaustiveCheck: never = intent;
      throw new Error(`Unknown intent type: ${JSON.stringify(_exhaustiveCheck)}`);
    }
  }
}
