import { useEffect, useState } from "react";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { CompeteWebSocket } from "@/core/competeWebSocket";
import type { HintPurchaseResult } from "@/components/HintModal";
import { computeTimeRemaining } from "@/core/competeUtils";

interface UseCompeteTimerParams {
  snapshot: CompeteSessionSnapshot | null;
  playerId: string | null;
  localSubmitted: boolean;
  guessYearRef: React.MutableRefObject<number | null>;
  guessLatRef: React.MutableRefObject<number | null>;
  guessLngRef: React.MutableRefObject<number | null>;
  hintResult: HintPurchaseResult;
  wsRef: React.MutableRefObject<CompeteWebSocket | null>;
  submittedHintPenaltyRef: React.MutableRefObject<{
    accPenalty: number;
    xpPenalty: number;
    purchasedIds: string[];
    whereAccPenalty: number;
    whenAccPenalty: number;
  }>;
  onAdvanceRound: () => void;
  setLocalSubmitted: (value: boolean) => void;
  setBusy: (value: boolean) => void;
}

export default function useCompeteTimer({
  snapshot,
  playerId,
  localSubmitted,
  guessYearRef,
  guessLatRef,
  guessLngRef,
  hintResult,
  wsRef,
  submittedHintPenaltyRef,
  onAdvanceRound,
  setLocalSubmitted,
  setBusy,
}: UseCompeteTimerParams) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [resultSecsLeft, setResultSecsLeft] = useState<number | null>(null);

  // Local UI-only timer derived from snapshot.roundEndsAt.
  // This is a DISPLAY computation, not authoritative state.
  useEffect(() => {
    if (!snapshot || snapshot.status !== "ROUND_ACTIVE") {
      setTimeRemaining(null);
      return;
    }
    const tick = () => setTimeRemaining(computeTimeRemaining(snapshot.roundEndsAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [snapshot]);

  // Auto-submit on timer expiry using current input values.
  // Fires once when timeRemaining hits 0 and player has not already submitted.
  useEffect(() => {
    if (timeRemaining !== 0) return;
    if (snapshot?.status !== "ROUND_ACTIVE") return;
    if (localSubmitted) return;
    if (!wsRef.current || !playerId) return;

    const currentRoundIndex = snapshot.currentRoundIndex;

    // Auto-submit with whatever values the player has entered (null is valid)
    submittedHintPenaltyRef.current = {
      accPenalty: hintResult.accPenalty,
      xpPenalty: hintResult.xpPenalty,
      purchasedIds: hintResult.purchasedIds,
      whereAccPenalty: hintResult.whereAccPenalty,
      whenAccPenalty: hintResult.whenAccPenalty,
    };
    setLocalSubmitted(true);
    setBusy(true);
    wsRef.current.submitGuess(
      currentRoundIndex,
      guessYearRef.current,
      guessLatRef.current,
      guessLngRef.current,
      hintResult.purchasedIds,
      hintResult.accPenalty,
      hintResult.xpPenalty
    );
  }, [timeRemaining, snapshot?.status, snapshot?.currentRoundIndex, localSubmitted, playerId, hintResult]);

  // Live countdown timer for RESULT phase
  useEffect(() => {
    if (!snapshot || snapshot.status !== "ROUND_COMPLETE" || !snapshot.resultPhaseEndsAt) {
      setResultSecsLeft(null);
      return;
    }

    const updateCountdown = () => {
      const secsLeft = Math.max(0, Math.ceil((snapshot.resultPhaseEndsAt! - Date.now()) / 1000));
      setResultSecsLeft(secsLeft);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [snapshot?.status, snapshot?.resultPhaseEndsAt]);

  // Auto-advance trigger when countdown reaches 0
  useEffect(() => {
    if (resultSecsLeft !== 0) return;
    if (snapshot?.status !== "ROUND_COMPLETE") return;
    const alreadyReady = snapshot?.readyForNext?.includes(playerId ?? "");
    if (alreadyReady) return;
    onAdvanceRound();
  }, [resultSecsLeft, snapshot?.status, snapshot?.readyForNext, playerId, onAdvanceRound]);

  return { timeRemaining, resultSecsLeft };
}
