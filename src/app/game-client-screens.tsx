import {
  BadgePills,
  EventRevealCard,
  formatAccuracy,
  GuessLocationCard,
  GuessYearCard,
  LoadingScreen,
  MetricsGrid,
  RoundActionsCard,
  RoundStatusCard
} from "@/app/game-client-parts";
import { MAX_ROUNDS } from "@/core/types";
import type { EventRecord, GamePhase, LatLng, RoundResult, SessionSummary } from "@/core/types";
import { PersistenceErrorCard } from "@/app/game-client-parts";

export { PersistenceErrorCard, LoadingScreen } from "@/app/game-client-parts";

export function LoadErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="card" style={{ background: "rgba(239, 68, 68, 0.08)" }}>
          <span className="badge">Load failed</span>
          <h1>Unable to load game session</h1>
          <p>{message}</p>
          <div className="row">
            <button type="button" className="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export function InitScreen({
  gameId,
  sharePath,
  preflightIssues,
  persistenceError,
  onStartPractice
}: {
  gameId: string;
  sharePath: string;
  preflightIssues: string[];
  persistenceError: string | null;
  onStartPractice: () => void;
}) {
  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <span className="badge">Practice Mode</span>
          <h1>Deterministic historical guessing loop</h1>
          <p>
            This vertical slice now exposes explicit lifecycle steps for preflight, round start, active guessing,
            lock, evaluation, results, and final summary.
          </p>
          <p className="small">
            Game ID: {gameId} · Share path: {sharePath}
          </p>
          <div className="row">
            <button type="button" className="button" onClick={onStartPractice}>
              Start Practice
            </button>
            <span className="small">No auto-advance. No hidden defaults. One path through the round.</span>
          </div>
          {preflightIssues.length > 0 && (
            <div className="card" style={{ background: "rgba(239, 68, 68, 0.08)" }}>
              <h3>Preflight blocked</h3>
              <ul>
                {preflightIssues.map((issue) => (
                  <li key={issue} className="small">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {persistenceError && <PersistenceErrorCard message={persistenceError} />}
        </section>
      </div>
    </main>
  );
}

export function PreflightScreen({ persistenceError }: { persistenceError: string | null }) {
  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="card">
          <span className="badge">Phase: PREFLIGHT_CHECK</span>
          <h1>Running startup checks</h1>
          <p>Connectivity, event availability, and duplicate protection are being validated before the session begins.</p>
        </section>
        {persistenceError && <PersistenceErrorCard message={persistenceError} />}
      </div>
    </main>
  );
}

export function ReadyScreen({
  gameId,
  sharePath,
  persistenceError,
  onStartRound,
  onReset
}: {
  gameId: string;
  sharePath: string;
  persistenceError: string | null;
  onStartRound: () => void;
  onReset: () => void;
}) {
  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <span className="badge">Phase: READY</span>
          <h1>Session prepared</h1>
          <p>
            Five events are loaded for this deterministic run. Start round one when you are ready to enter the
            cinematic reveal.
          </p>
          <p className="small">
            Game ID: {gameId} · Share path: {sharePath}
          </p>
          <div className="row">
            <button type="button" className="button" onClick={onStartRound}>
              Start Round 1
            </button>
            <button type="button" className="button secondary" onClick={onReset}>
              Reset
            </button>
          </div>
          {persistenceError && <PersistenceErrorCard message={persistenceError} />}
        </section>
      </div>
    </main>
  );
}

export function GamePhaseHero({
  phase,
  isComplete,
  currentRoundIndex,
  roundProgress,
  timeRemaining,
  gameId,
  sharePath
}: {
  phase: GamePhase;
  isComplete: boolean;
  currentRoundIndex: number;
  roundProgress: number;
  timeRemaining: number | null;
  gameId: string;
  sharePath: string;
}) {
  return (
    <section className="hero">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="badge">Phase: {phase}</span>
          <h1>{isComplete ? "Practice run complete" : `Round ${Math.min(currentRoundIndex + 1, MAX_ROUNDS)} of ${MAX_ROUNDS}`}</h1>
        </div>
        <div className="stack" style={{ minWidth: 280 }}>
          <span className="small">Session progress</span>
          <div className="progress"><span style={{ width: `${roundProgress}%` }} /></div>
        </div>
        {(phase === "ROUND_START" || phase === "ROUND_ACTIVE") && timeRemaining !== null && (
          <div className="metric" style={{ maxWidth: 280 }}>
            <span>Time remaining</span>
            <strong>{timeRemaining}s</strong>
          </div>
        )}
      </div>
      <p>Accuracy and XP are computed separately. The game remains client-authoritative in this practice slice.</p>
      <p className="small">
        Game ID: {gameId} · Share path: {sharePath}
      </p>
    </section>
  );
}

export function RoundActiveScreen({
  activeEvent,
  guessYear,
  guessLocation,
  hasPassedPreflight,
  roundsCompleted,
  isSubmitDisabled,
  onSetLocation,
  onSetYear,
  onSubmit,
  onRestart
}: {
  activeEvent: EventRecord;
  guessYear: number | null;
  guessLocation: LatLng | null;
  hasPassedPreflight: boolean;
  roundsCompleted: number;
  isSubmitDisabled: boolean;
  onSetLocation: (location: LatLng) => void;
  onSetYear: (year: number | null) => void;
  onSubmit: () => void;
  onRestart: () => void;
}) {
  return (
    <section className="layout">
      <div className="stack">
        <EventRevealCard activeEvent={activeEvent} revealLabel="Image reveal" />
        <GuessLocationCard guessLocation={guessLocation} onSetLocation={onSetLocation} />
      </div>

      <aside className="stack">
        <GuessYearCard guessYear={guessYear} onSetYear={onSetYear} />
        <RoundActionsCard isSubmitDisabled={isSubmitDisabled} onSubmit={onSubmit} onRestart={onRestart} />
        <RoundStatusCard hasPassedPreflight={hasPassedPreflight} roundsCompleted={roundsCompleted} />
      </aside>
    </section>
  );
}

export function RoundProcessingScreen({ phase }: { phase: GamePhase }) {
  return (
    <section className="card">
      <span className="badge">Round processing</span>
      <h2>{phase === "ROUND_LOCK" ? "Locking inputs" : "Evaluating round"}</h2>
      <p>All inputs are disabled while the single submission pipeline resolves this round.</p>
    </section>
  );
}

export function RoundCompleteScreen({
  latest,
  isLastRoundResult,
  onNextRound
}: {
  latest: RoundResult;
  isLastRoundResult: boolean;
  onNextRound: () => void;
}) {
  const { event, guess, yearDiff, distanceKm } = latest;

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="badge">Round result</span>
          <h2>{event.title}</h2>
        </div>
        <span className="badge">{latest.didTimeout ? "timeout" : "manual"}</span>
      </div>

      {/* Event Image */}
      {event.imageUrl && (
        <div className="card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <img
            src={event.imageUrl}
            alt={event.title}
            style={{
              width: "100%",
              height: 200,
              objectFit: "cover",
              display: "block"
            }}
          />
        </div>
      )}

      {/* Guess vs Correct Comparison */}
      <div className="results-grid" style={{ marginTop: 16 }}>
        <div className="metric">
          <span>Your Guess</span>
          <strong>{guess.year ?? "?"}</strong>
          <span className="small">
            📍 {guess.location ? `${guess.location.lat.toFixed(2)}, ${guess.location.lng.toFixed(2)}` : "No location"}
          </span>
        </div>
        <div className="metric">
          <span>Correct Answer</span>
          <strong>{event.year}</strong>
          <span className="small">📍 {event.locationName}</span>
        </div>
      </div>

      {/* Difference Details */}
      <div className="row" style={{ marginTop: 12, justifyContent: "center" }}>
        <span className="small">
          📅 Year difference: {yearDiff} years · 🌍 Distance: {Math.round(distanceKm)} km
        </span>
      </div>

      {/* Score Metrics */}
      <MetricsGrid
        items={[
          { label: "Round accuracy", value: formatAccuracy(latest.roundAccuracy) },
          { label: "Round XP", value: latest.roundXp },
          { label: "Year accuracy", value: formatAccuracy(latest.yearAccuracy) },
          { label: "Location accuracy", value: formatAccuracy(latest.locationAccuracy) }
        ]}
      />

      <div className="stack" style={{ marginTop: 16 }}>
        <div>
          <p className="small">Badges</p>
          <BadgePills badges={latest.badges} />
        </div>
        <div className="row">
          <button type="button" className="button" onClick={onNextRound}>
            {isLastRoundResult ? "Final Results" : "Next Round"}
          </button>
          <span className="small">Manual progression only.</span>
        </div>
      </div>
    </section>
  );
}

export function SessionCompleteScreen({
  sessionSummary,
  roundResults,
  onRestart
}: {
  sessionSummary: SessionSummary;
  roundResults: RoundResult[];
  onRestart: () => void;
}) {
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="badge">Final summary</span>
          <h2>Practice run complete</h2>
        </div>
        <button type="button" className="button secondary" onClick={onRestart}>
          Play Again
        </button>
      </div>
      <MetricsGrid
        items={[
          { label: "Total XP", value: sessionSummary.totalXp },
          { label: "Average accuracy", value: `${sessionSummary.averageAccuracy}%` },
          { label: "Rounds played", value: sessionSummary.totalRounds },
          { label: "Total accuracy", value: sessionSummary.totalAccuracy }
        ]}
      />
      <div className="stack" style={{ marginTop: 24 }}>
        <h3>Round Recap</h3>
        {roundResults.map((round) => (
          <article className="metric" key={round.roundIndex} style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            <div className="row" style={{ width: "100%", justifyContent: "space-between" }}>
              <span>Round {round.roundIndex + 1}: {round.event.title}</span>
              <span className="badge">{round.roundAccuracy}% · {round.roundXp} XP</span>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <span className="small">📅 Guess: {round.guess.year ?? "?"} → Actual: {round.event.year}</span>
              <span className="small">🌍 {Math.round(round.distanceKm)} km off</span>
            </div>
            {round.event.imageUrl && (
              <img
                src={round.event.imageUrl}
                alt={round.event.title}
                style={{
                  width: "100%",
                  maxHeight: 120,
                  objectFit: "cover",
                  borderRadius: 8,
                  marginTop: 8
                }}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function RoundResultLockedNotice() {
  return (
    <section className="card">
      <p className="small">The result screen is locked until you continue manually.</p>
    </section>
  );
}
