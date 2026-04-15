"use client";

import { useEffect, useReducer, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  GamePhaseHero,
  InitScreen,
  LoadErrorScreen,
  LoadingScreen,
  PersistenceErrorCard,
  PreflightScreen,
  ReadyScreen,
  RoundActiveScreen,
  RoundCompleteScreen,
  RoundProcessingScreen,
  RoundResultLockedNotice,
  SessionCompleteScreen
} from "@/app/game-client-screens";
import { preloadNextRoundImage } from "@/core/assetPreloader";
import { gameReducer } from "@/core/gameEngine";
import { runPreflightCheck } from "@/core/preflight";
import {
  commitRound,
  createSession,
  loadSession,
  startRound
} from "@/core/sessionApi";
import {
  selectCanProceed,
  selectCurrentEvent,
  selectHasPassedPreflight,
  selectIsLastRoundResult,
  selectIsSessionComplete,
  selectLatestRoundResult,
  selectRoundProgress,
  selectSessionSummary,
  selectSharePath
} from "@/core/gameSelectors";
import type { GameState } from "@/core/types";

type GameClientProps = {
  routeGameId?: string;
};

export function GameClient({ routeGameId }: GameClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, dispatch] = useReducer(gameReducer, null, () => null as unknown as GameState);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preflightIssues, setPreflightIssues] = useState<string[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    setIsBootstrapping(true);
    setBootError(null);
    setPersistenceError(null);

    const load = routeGameId ? loadSession(routeGameId) : createSession();

    void load
      .then((nextState) => {
        if (isCancelled) {
          return;
        }

        if (nextState === null) {
          console.error("[GAME_LOAD_ERROR]", {
            gameId: routeGameId,
            error: "Session not found",
            timestamp: Date.now()
          });
          setBootError("Session not found");
          setIsBootstrapping(false);
          return;
        }

        console.log("[GAME_LOAD_SUCCESS]", {
          gameId: nextState.gameId,
          phase: nextState.phase,
          roundIndex: nextState.currentRoundIndex,
          timestamp: Date.now()
        });

        dispatch({ type: "HYDRATE", state: nextState });
        setPreflightIssues([]);
        setIsBootstrapping(false);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : "Unable to load game session";
        console.error("[GAME_LOAD_ERROR]", {
          gameId: routeGameId,
          error: errorMessage,
          rawError: error,
          timestamp: Date.now()
        });
        setBootError(errorMessage);
        setIsBootstrapping(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [routeGameId]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const sharePath = selectSharePath(state);
    if (pathname === sharePath) {
      return;
    }

    router.replace(sharePath);
  }, [pathname, router, state]);

  useEffect(() => {
    if (!state) {
      return;
    }

    if (state.phase === "ROUND_ACTIVE" || state.phase === "ROUND_START") {
      preloadNextRoundImage(state.events, state.currentRoundIndex);
    }
  }, [state?.phase, state?.currentRoundIndex, state?.events, state]);

  async function resetSession() {
    setIsProcessing(true);
    setPersistenceError(null);

    try {
      const nextState = await createSession();
      dispatch({ type: "HYDRATE", state: nextState });
      setPreflightIssues([]);
      setBootError(null);
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : "Unable to create a new session");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleStartRound() {
    if (!state) {
      return;
    }

    setIsPreflighting(true);
    setPersistenceError(null);
    const preflight = runPreflightCheck(state.events);
    setPreflightIssues(preflight.issues);

    if (!preflight.passed) {
      setIsPreflighting(false);
      return;
    }

    try {
      const nextState = await startRound(state.gameId, state.roundResults.length);
      dispatch({ type: "HYDRATE", state: nextState });
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : "Unable to start round");
    } finally {
      setIsPreflighting(false);
    }
  }

  function handleSubmit() {
    if (!state) {
      return;
    }

    if (state.currentGuess.year === null || state.currentGuess.location === null) {
      return;
    }

    setPersistenceError(null);

    dispatch({ type: "SUBMIT_AND_EVALUATE", didTimeout: false });

    void commitRound({
      gameId: state.gameId,
      roundIndex: state.currentRoundIndex,
      yearGuess: state.currentGuess.year,
      locationGuess: state.currentGuess.location,
      hintsUsed: []
    }).catch((error: unknown) => {
      console.error("[Round] Background commit failed:", error);
      setPersistenceError(error instanceof Error ? error.message : "Round save failed");
    });
  }

  function handleAdvance() {
    if (!state) {
      return;
    }

    if (state.phase !== "ROUND_COMPLETE") {
      return;
    }

    const nextRoundIndex = state.currentRoundIndex + 1;

    if (nextRoundIndex >= state.events.length) {
      dispatch({ type: "NEXT_ROUND" });
      return;
    }

    dispatch({ type: "NEXT_ROUND" });

    void startRound(state.gameId, nextRoundIndex).catch((error: unknown) => {
      console.error("[Round] Background persistence failed:", error);
      setPersistenceError(error instanceof Error ? error.message : "Round start tracking failed");
    });
  }

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (bootError || !state) {
    return <LoadErrorScreen message={bootError ?? "Unable to load game session"} gameId={routeGameId} onRetry={() => router.refresh()} />;
  }

  const activeEvent = selectCurrentEvent(state);
  const hasPassedPreflight = selectHasPassedPreflight(state);
  const isComplete = selectIsSessionComplete(state);
  const canProceed = selectCanProceed(state);
  const latest = selectLatestRoundResult(state);
  const isLastRoundResult = selectIsLastRoundResult(state);
  const roundProgress = selectRoundProgress(state);
  const sessionSummary = selectSessionSummary(state);
  const sharePath = selectSharePath(state);
  const isSubmitDisabled = isProcessing || state.currentGuess.year === null || state.currentGuess.location === null;

  if (state.phase === "INIT") {
    return (
      <InitScreen
        gameId={state.gameId}
        sharePath={sharePath}
        preflightIssues={preflightIssues}
        persistenceError={persistenceError}
        onStartPractice={handleStartRound}
      />
    );
  }

  if (isPreflighting) {
    return <PreflightScreen persistenceError={persistenceError} />;
  }

  if (state.phase === "READY") {
    return (
      <ReadyScreen
        gameId={state.gameId}
        sharePath={sharePath}
        persistenceError={persistenceError}
        onStartRound={handleStartRound}
        onReset={resetSession}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="shell-grid">
        <GamePhaseHero
          phase={state.phase}
          isComplete={isComplete}
          currentRoundIndex={state.currentRoundIndex}
          roundProgress={roundProgress}
          timeRemaining={state.timeRemaining}
          gameId={state.gameId}
          sharePath={sharePath}
        />

        {persistenceError && <PersistenceErrorCard message={persistenceError} />}

        {activeEvent && (state.phase === "ROUND_START" || state.phase === "ROUND_ACTIVE") && (
          <RoundActiveScreen
            activeEvent={activeEvent}
            guessYear={state.currentGuess.year}
            guessLocation={state.currentGuess.location}
            hasPassedPreflight={hasPassedPreflight}
            roundsCompleted={state.roundResults.length}
            isSubmitDisabled={isSubmitDisabled}
            onSetLocation={(location) => dispatch({ type: "SET_LOCATION", location })}
            onSetYear={(year) => dispatch({ type: "SET_YEAR", year })}
            onSubmit={handleSubmit}
            onRestart={resetSession}
          />
        )}

        {isProcessing && (
          <RoundProcessingScreen phase={state.phase} />
        )}

        {state.phase === "ROUND_COMPLETE" && latest && (
          <RoundCompleteScreen
            latest={latest}
            isLastRoundResult={isLastRoundResult}
            onNextRound={handleAdvance}
          />
        )}

        {isComplete && sessionSummary && (
          <SessionCompleteScreen
            sessionSummary={sessionSummary}
            roundResults={state.roundResults}
            onRestart={resetSession}
          />
        )}

        {canProceed && latest && (
          <RoundResultLockedNotice />
        )}
      </div>
    </main>
  );
}
