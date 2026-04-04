"use client";

import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useEventsLoader,
  useGameAutosave,
  useGameBootstrap,
  useGameRouteSync,
  usePreflightPhase,
  useRoundResolution,
  useRoundTimer
} from "@/app/game-client-hooks";
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
import { canSubmit, createInitialGameState, gameReducer } from "@/core/gameEngine";
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

type GameClientProps = {
  routeGameId?: string;
};

export function GameClient({ routeGameId }: GameClientProps) {
  const router = useRouter();
  const { events, isLoading: isEventsLoading, error: eventsError } = useEventsLoader();
  const [state, dispatch] = useReducer(
    gameReducer,
    events.length > 0 ? createInitialGameState(events) : null,
    (initState) => initState ?? createInitialGameState([])
  );
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const activeEvent = selectCurrentEvent(state);
  const hasPassedPreflight = selectHasPassedPreflight(state);
  const isComplete = selectIsSessionComplete(state);
  const canProceed = selectCanProceed(state);
  const latest = selectLatestRoundResult(state);
  const isLastRoundResult = selectIsLastRoundResult(state);
  const roundProgress = selectRoundProgress(state);
  const sessionSummary = selectSessionSummary(state);
  const sharePath = selectSharePath(state);

  const { isBootstrapping, isHydrated, bootError } = useGameBootstrap({
    routeGameId,
    events,
    isEventsLoading,
    dispatch,
    setPersistenceError
  });

  useGameAutosave({
    isHydrated,
    state,
    setPersistenceError
  });

  useGameRouteSync({
    isHydrated,
    sharePath
  });

  usePreflightPhase({
    phase: state.phase,
    dispatch,
    events
  });

  useRoundResolution({
    phase: state.phase,
    dispatch
  });

  useRoundTimer({
    phase: state.phase,
    dispatch
  });

  // Show loading while fetching events
  if (isEventsLoading) {
    return <LoadingScreen message="Loading historical events..." />;
  }

  if (eventsError && events.length === 0) {
    return <LoadErrorScreen message={eventsError} onRetry={() => router.refresh()} />;
  }

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (bootError) {
    return <LoadErrorScreen message={bootError} onRetry={() => router.refresh()} />;
  }

  if (state.phase === "INIT") {
    return (
      <InitScreen
        gameId={state.gameId}
        sharePath={sharePath}
        preflightIssues={state.preflightIssues}
        persistenceError={persistenceError}
        onStartPractice={() => dispatch({ type: "BEGIN_START" })}
      />
    );
  }

  if (state.phase === "PREFLIGHT_CHECK") {
    return <PreflightScreen persistenceError={persistenceError} />;
  }

  if (state.phase === "READY") {
    return (
      <ReadyScreen
        gameId={state.gameId}
        sharePath={sharePath}
        persistenceError={persistenceError}
        onStartRound={() => dispatch({ type: "START_ROUND" })}
        onReset={() => dispatch({ type: "RESTART" })}
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
            isSubmitDisabled={!canSubmit(state)}
            onSetLocation={(location) => dispatch({ type: "SET_LOCATION", location })}
            onSetYear={(year) => dispatch({ type: "SET_YEAR", year })}
            onSubmit={() => dispatch({ type: "SUBMIT", didTimeout: false })}
            onRestart={() => dispatch({ type: "RESTART" })}
          />
        )}

        {(state.phase === "ROUND_LOCK" || state.phase === "ROUND_EVALUATE") && (
          <RoundProcessingScreen phase={state.phase} />
        )}

        {state.phase === "ROUND_COMPLETE" && latest && (
          <RoundCompleteScreen
            latest={latest}
            isLastRoundResult={isLastRoundResult}
            onNextRound={() => dispatch({ type: "NEXT_ROUND" })}
          />
        )}

        {isComplete && sessionSummary && (
          <SessionCompleteScreen
            sessionSummary={sessionSummary}
            roundResults={state.roundResults}
            onRestart={() => dispatch({ type: "RESTART" })}
          />
        )}

        {canProceed && latest && (
          <RoundResultLockedNotice />
        )}
      </div>
    </main>
  );
}
