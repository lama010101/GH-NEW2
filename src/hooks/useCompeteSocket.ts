import { useEffect, useRef } from "react";
import { CompeteWebSocket } from "@/core/competeWebSocket";
import { isCompeteSessionSnapshot } from "@/core/competeApi";
import { getValidAccessToken } from "@/core/supabaseBrowser";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { RoundResult } from "@/core/competeTypes";

interface UseCompeteSocketParams {
  gameId: string;
  playerId: string | null;
  displayName: string;
  snapshot: CompeteSessionSnapshot | null;
  roundResults: RoundResult[] | null;
  onStateUpdate: (snapshot: CompeteSessionSnapshot) => void;
  onPlayerSubmitted: (submittedPlayerId: string, playerName: string) => void;
  onTimerClamped: (newPhaseEndsAt: string) => void;
  onError: (message: string, code?: string) => void;
  onKicked?: () => void;
  onDisconnect?: () => void;
  onRoundResults: (results: RoundResult[]) => void;
  onSetBusy: (value: boolean) => void;
  onSetLocalSubmitted: (value: boolean) => void;
  onClearSubmissionToasts: () => void;
  onPlayAgain?: (newGameId: string) => void;
}

export default function useCompeteSocket({
  gameId,
  playerId,
  displayName,
  snapshot,
  roundResults,
  onStateUpdate,
  onPlayerSubmitted,
  onTimerClamped,
  onError,
  onKicked,
  onDisconnect,
  onRoundResults,
  onSetBusy,
  onSetLocalSubmitted,
  onClearSubmissionToasts,
  onPlayAgain,
}: UseCompeteSocketParams) {
  const wsRef = useRef<CompeteWebSocket | null>(null);
  const lastRoundIndexRef = useRef<number | undefined>(undefined);

  // Connect WebSocket — BLOCKED until Supabase identity is ready.
  // DO delivers authoritative state via STATE_UPDATE.
  useEffect(() => {
    if (!gameId || !playerId) return;

    let cancelled = false;
    let ws: CompeteWebSocket | null = null;

    getValidAccessToken().then(token => {
      if (cancelled) return;
      if (!token) {
        console.error("[useCompeteSocket] No access token — cannot connect to DO");
        onError("Authentication required to connect");
        return;
      }

      const socket = new CompeteWebSocket(gameId, playerId, {
        onConnect: () => {
          // Signal intent to join (PartyKit → API → DB → broadcast STATE_UPDATE).
          socket.joinRoom(displayName);
        },
        onStateUpdate: (rawSnapshot) => {
          // DO-authoritative: apply snapshot directly from WS.
          // Validate before accepting — never trust unvalidated payloads.
          if (isCompeteSessionSnapshot(rawSnapshot)) {
            console.log("[CompeteGamePage] State update received, players:", rawSnapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
            onStateUpdate(rawSnapshot);

            if (rawSnapshot.config?.mode === "async") {
              const currentRound = rawSnapshot.currentRoundIndex;
              if (rawSnapshot.status !== "ROUND_ACTIVE" || (lastRoundIndexRef.current !== undefined && currentRound !== lastRoundIndexRef.current)) {
                onSetLocalSubmitted(false);
                onClearSubmissionToasts();
              }
              lastRoundIndexRef.current = currentRound;
            }

            // If the snapshot includes pre-fetched results (from /complete route), apply them directly
            if (
              isCompeteSessionSnapshot(rawSnapshot) &&
              (rawSnapshot.status === "ROUND_COMPLETE" || rawSnapshot.status === "SESSION_COMPLETE") &&
              Array.isArray((rawSnapshot as unknown as { results?: unknown }).results)
            ) {
              const results = (rawSnapshot as unknown as { results: RoundResult[] }).results;
              const ranked = [...results].sort((a, b) => a.rank - b.rank);
              onRoundResults(ranked);
              onSetLocalSubmitted(false);
              onClearSubmissionToasts();
            }

            onSetBusy(false); // Action completed — clear busy flag
          } else {
            console.warn("[CompeteGamePage] Invalid STATE_UPDATE payload — ignoring, waiting for next update:", rawSnapshot);
            onSetBusy(false);
          }
        },
        onPlayerSubmitted: (submittedPlayerId, playerName) => {
          onPlayerSubmitted(submittedPlayerId, playerName);
        },
        onTimerClamped: (newPhaseEndsAt) => {
          onTimerClamped(newPhaseEndsAt);
        },
        onError: (message, code) => {
          onError(message, code);
          onSetBusy(false); // Action failed — clear busy flag
        },
        onKicked: () => {
          onKicked?.();
        },
        onDisconnect: () => {
          onDisconnect?.();
        },
        onPlayAgain: (newGameId) => {
          onPlayAgain?.(newGameId);
        }
      }, undefined, token, getValidAccessToken);

      ws = socket;
      wsRef.current = socket;
      socket.connect();
    });

    // DO sends STATE_UPDATE on connect — no REST fetch needed.

    return () => {
      cancelled = true;
      if (ws) ws.disconnect();
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, playerId]);

  // Fetch round results from API when reconnecting in ROUND_COMPLETE phase
  // This handles page refresh where snapshot.results is not populated from DB load
  useEffect(() => {
    if (snapshot?.status !== "ROUND_COMPLETE") return;
    if (roundResults !== null) return;
    if (!gameId) return;
    if (typeof snapshot.currentRoundIndex !== "number") return;

    fetch(`/api/compete/${gameId}/round/${snapshot.currentRoundIndex}/results?playerId=${playerId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.results)) {
          const ranked = [...data.results].sort((a, b) => a.rank - b.rank);
          onRoundResults(ranked);
        } else {
          console.warn("[CompeteGamePage] Round results API returned no results array:", data);
          onRoundResults([]); // Unblock UI
        }
      })
      .catch(err => {
        console.error("[CompeteGamePage] Failed to fetch round results:", err);
        onRoundResults([]); // Unblock UI — show empty results rather than permanent spinner
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.status, snapshot?.currentRoundIndex, roundResults, gameId]);

  const toggleReady = () => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send action signal via WS
    wsRef.current.toggleReady(true);
    // DO will broadcast STATE_UPDATE or ERROR via WS callbacks
    // busy flag cleared when STATE_UPDATE arrives (snapshot changes)
  };

  const startGame = () => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send action signal via WS
    wsRef.current.startGame();
  };

  const submitGuess = (
    roundIndex: number,
    year: number | null,
    lat: number | null,
    lng: number | null,
    hintsUsed: string[]
  ) => {
    if (!playerId || !wsRef.current) return;
    wsRef.current.submitGuess(roundIndex, year, lat, lng, hintsUsed);
  };

  const readyNext = (roundIndex: number) => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send READY_NEXT action signal via WS
    wsRef.current.readyNext(roundIndex);
  };

  const setTimer = (roundTimerSec: number) => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send SET_TIMER action signal via WS
    wsRef.current.setTimer(roundTimerSec);
  };

  const setYearRange = (yearMin: number, yearMax: number) => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send SET_YEAR_RANGE action signal via WS
    wsRef.current.setYearRange(yearMin, yearMax);
  };

  const setResultsTimer = (resultsAutoAdvanceSec: number) => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send SET_RESULTS_TIMER action signal via WS
    wsRef.current.setResultsTimer(resultsAutoAdvanceSec);
  };

  const setSubMode = (mode: "sync" | "async", sessionDeadlineDays: number) => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send SET_SUB_MODE action signal via WS
    wsRef.current.setSubMode(mode, sessionDeadlineDays);
  };

  const kickPlayer = (targetPlayerId: string) => {
    if (!playerId || !wsRef.current) return;
    onSetBusy(true);
    // Client → DO → DB: send KICK_PLAYER action signal via WS
    wsRef.current.kickPlayer(targetPlayerId);
  };

  const playAgain = (newGameId: string) => {
    if (!playerId || !wsRef.current) return;
    wsRef.current.playAgain(newGameId);
  };

  return {
    wsRef,
    toggleReady,
    startGame,
    submitGuess,
    readyNext,
    setTimer,
    setYearRange,
    setResultsTimer,
    setSubMode,
    kickPlayer,
    playAgain,
  };
}
