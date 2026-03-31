"use client";

import { useEffect, useMemo, useReducer } from "react";
import { PRACTICE_EVENTS } from "@/core/mockEvents";
import { canSubmit, currentEvent, createInitialGameState, gameReducer } from "@/core/gameEngine";
import { runPreflightCheck } from "@/core/preflight";
import { MAX_ROUNDS } from "@/core/types";
import type { Badge, LatLng } from "@/core/types";

function latLngToPosition(location: LatLng) {
  const left = ((location.lng + 180) / 360) * 100;
  const top = ((90 - location.lat) / 180) * 100;
  return {
    left: `${Math.min(100, Math.max(0, left))}%`,
    top: `${Math.min(100, Math.max(0, top))}%`
  };
}

function formatAccuracy(value: number) {
  return `${value}%`;
}

function BadgePills({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) {
    return <p className="small">No badges this round.</p>;
  }

  return (
    <div className="row">
      {badges.map((badge) => (
        <span className="badge" key={`${badge.dimension}-${badge.tier}`}>
          {badge.dimension} · {badge.tier} · {badge.accuracy}%
        </span>
      ))}
    </div>
  );
}

export function GameClient() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState(PRACTICE_EVENTS));
  const activeEvent = currentEvent(state);
  const isComplete = state.phase === "SESSION_COMPLETE";
  const canProceed = state.phase === "ROUND_COMPLETE";
  const latest = state.lastRoundResult;

  useEffect(() => {
    if (state.phase !== "PREFLIGHT_CHECK") {
      return;
    }

    dispatch({ type: "COMPLETE_PREFLIGHT", preflight: runPreflightCheck(PRACTICE_EVENTS) });
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "ROUND_LOCK") {
      return;
    }

    dispatch({ type: "EVALUATE_ROUND" });
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "ROUND_EVALUATE") {
      return;
    }

    dispatch({ type: "COMPLETE_EVALUATION" });
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "ROUND_START" && state.phase !== "ROUND_ACTIVE") {
      return;
    }

    const interval = window.setInterval(() => {
      dispatch({ type: "TICK" });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [state.phase]);

  const roundProgress = useMemo(() => {
    if (state.phase === "SESSION_COMPLETE") {
      return 100;
    }

    const completedRounds = state.roundResults.length;
    const inFlightRound =
      state.phase === "ROUND_START" ||
      state.phase === "ROUND_ACTIVE" ||
      state.phase === "ROUND_LOCK" ||
      state.phase === "ROUND_EVALUATE"
        ? 1
        : 0;

    return Math.min(100, ((completedRounds + inFlightRound) / MAX_ROUNDS) * 100);
  }, [state.phase, state.roundResults.length]);

  if (state.phase === "INIT") {
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
            <div className="row">
              <button className="button" onClick={() => dispatch({ type: "BEGIN_START" })}>
                Start Practice
              </button>
              <span className="small">No auto-advance. No hidden defaults. One path through the round.</span>
            </div>
            {state.preflightIssues.length > 0 && (
              <div className="card" style={{ background: "rgba(239, 68, 68, 0.08)" }}>
                <h3>Preflight blocked</h3>
                <ul>
                  {state.preflightIssues.map((issue: string) => (
                    <li key={issue} className="small">
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (state.phase === "PREFLIGHT_CHECK") {
    return (
      <main className="app-shell">
        <div className="shell-grid">
          <section className="card">
            <span className="badge">Phase: PREFLIGHT_CHECK</span>
            <h1>Running startup checks</h1>
            <p>Connectivity, event availability, and duplicate protection are being validated before the session begins.</p>
          </section>
        </div>
      </main>
    );
  }

  if (state.phase === "READY") {
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
            <div className="row">
              <button className="button" onClick={() => dispatch({ type: "START_ROUND" })}>
                Start Round 1
              </button>
              <button className="button secondary" onClick={() => dispatch({ type: "RESTART" })}>
                Reset
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <span className="badge">Phase: {state.phase}</span>
              <h1>{isComplete ? "Practice run complete" : `Round ${Math.min(state.currentRoundIndex + 1, MAX_ROUNDS)} of ${MAX_ROUNDS}`}</h1>
            </div>
            <div className="stack" style={{ minWidth: 280 }}>
              <span className="small">Session progress</span>
              <div className="progress"><span style={{ width: `${roundProgress}%` }} /></div>
            </div>
            {(state.phase === "ROUND_START" || state.phase === "ROUND_ACTIVE") && state.timeRemaining !== null && (
              <div className="metric" style={{ maxWidth: 280 }}>
                <span>Time remaining</span>
                <strong>{state.timeRemaining}s</strong>
              </div>
            )}
          </div>
          <p>
            Accuracy and XP are computed separately. The game remains client-authoritative in this practice slice.
          </p>
        </section>

        {activeEvent && state.phase === "ROUND_START" && (
          <section className="layout">
            <div className="stack">
              <article className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h2>{activeEvent.title}</h2>
                    <p>{activeEvent.description}</p>
                  </div>
                  <span className="badge">{activeEvent.region}</span>
                </div>
                <div className="card" style={{ marginTop: 16, background: "rgba(0, 0, 0, 0.18)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="badge">Cinematic reveal</span>
                    <span className="small">{activeEvent.imageLabel}</span>
                  </div>
                  <div className="map-grid" style={{ marginTop: 16, height: 260, cursor: "default" }}>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--muted)",
                        textAlign: "center",
                        padding: 20
                      }}
                    >
                      Cinematic reveal placeholder for the first playable slice.
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <aside className="stack">
              <article className="card">
                <h3>Round start</h3>
                <p>The timer is already running. Enter the guess phase when you are ready to provide inputs.</p>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="button" onClick={() => dispatch({ type: "END_CINEMATIC" })}>
                    Enter Guess Phase
                  </button>
                  <button className="button secondary" onClick={() => dispatch({ type: "RESTART" })}>
                    Restart
                  </button>
                </div>
              </article>
            </aside>
          </section>
        )}

        {activeEvent && state.phase === "ROUND_ACTIVE" && (
          <section className="layout">
            <div className="stack">
              <article className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h2>{activeEvent.title}</h2>
                    <p>{activeEvent.description}</p>
                  </div>
                  <span className="badge">{activeEvent.region}</span>
                </div>
                <div className="card" style={{ marginTop: 16, background: "rgba(0, 0, 0, 0.18)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="badge">Image reveal</span>
                    <span className="small">{activeEvent.imageLabel}</span>
                  </div>
                  <div className="map-grid" style={{ marginTop: 16, height: 260, cursor: "default" }}>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--muted)",
                        textAlign: "center",
                        padding: 20
                      }}
                    >
                      Cinematic reveal placeholder for the first playable slice.
                    </div>
                  </div>
                </div>
              </article>

              <article className="card">
                <h3>Guess location</h3>
                <p>Click the map to place a marker. Re-clicking moves the marker.</p>
                <div
                  className="map-grid"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const lat = 90 - (y / rect.height) * 180;
                    const lng = -180 + (x / rect.width) * 360;
                    dispatch({ type: "SET_LOCATION", location: { lat, lng } });
                  }}
                >
                  {state.currentGuess.location && (
                    <div className="map-marker" style={latLngToPosition(state.currentGuess.location)} />
                  )}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="small">
                    {state.currentGuess.location
                      ? `${state.currentGuess.location.lat.toFixed(2)}, ${state.currentGuess.location.lng.toFixed(2)}`
                      : "No location selected"}
                  </span>
                </div>
              </article>
            </div>

            <aside className="stack">
              <article className="card">
                <h3>Guess year</h3>
                <div className="field">
                  <label htmlFor="year-guess">Enter a year</label>
                  <input
                    id="year-guess"
                    className="input"
                    type="number"
                    step={1}
                    placeholder="Choose a year"
                    value={state.currentGuess.year ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      dispatch({ type: "SET_YEAR", year: value === "" ? null : Number(value) });
                    }}
                  />
                </div>
                <p className="small" style={{ marginTop: 10 }}>
                  The year starts empty, so the player must choose it explicitly.
                </p>
              </article>

              <article className="card">
                <h3>Actions</h3>
                <div className="row">
                  <button
                    className="button"
                    disabled={!canSubmit(state)}
                    onClick={() => dispatch({ type: "SUBMIT", didTimeout: false })}
                  >
                    Submit Guess
                  </button>
                  <button className="button secondary" onClick={() => dispatch({ type: "RESTART" })}>
                    Restart
                  </button>
                </div>
                <p className="small" style={{ marginTop: 10 }}>
                  Submit is enabled only when both year and location exist.
                </p>
              </article>

              <article className="card">
                <h3>Round status</h3>
                <p className="small">Preflight passed: {state.preflightPassed ? "yes" : "no"}</p>
                <p className="small">Rounds completed: {state.roundResults.length}</p>
                <p className="small">Locked submission window: no</p>
              </article>
            </aside>
          </section>
        )}

        {(state.phase === "ROUND_LOCK" || state.phase === "ROUND_EVALUATE") && (
          <section className="card">
            <span className="badge">Round processing</span>
            <h2>{state.phase === "ROUND_LOCK" ? "Locking inputs" : "Evaluating round"}</h2>
            <p>All inputs are disabled while the single submission pipeline resolves this round.</p>
          </section>
        )}

        {state.phase === "ROUND_COMPLETE" && latest && (
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <span className="badge">Round result</span>
                <h2>Evaluation complete</h2>
              </div>
              <span className="badge">{latest.didTimeout ? "timeout" : "manual"}</span>
            </div>
            <div className="results-grid" style={{ marginTop: 16 }}>
              <div className="metric"><span>Round accuracy</span><strong>{formatAccuracy(latest.roundAccuracy)}</strong></div>
              <div className="metric"><span>Round XP</span><strong>{latest.roundXp}</strong></div>
              <div className="metric"><span>Year accuracy</span><strong>{formatAccuracy(latest.yearAccuracy)}</strong></div>
              <div className="metric"><span>Location accuracy</span><strong>{formatAccuracy(latest.locationAccuracy)}</strong></div>
            </div>
            <div className="stack" style={{ marginTop: 16 }}>
              <div>
                <p className="small">Badges</p>
                <BadgePills badges={latest.badges} />
              </div>
              <div className="row">
                <button className="button" onClick={() => dispatch({ type: "NEXT_ROUND" })}>
                  Next Round
                </button>
                <span className="small">Manual progression only.</span>
              </div>
            </div>
          </section>
        )}

        {isComplete && state.summary && (
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <span className="badge">Final summary</span>
                <h2>Practice run complete</h2>
              </div>
              <button className="button secondary" onClick={() => dispatch({ type: "RESTART" })}>
                Play Again
              </button>
            </div>
            <div className="results-grid" style={{ marginTop: 16 }}>
              <div className="metric"><span>Total XP</span><strong>{state.summary.totalXp}</strong></div>
              <div className="metric"><span>Average accuracy</span><strong>{state.summary.averageAccuracy}%</strong></div>
              <div className="metric"><span>Rounds played</span><strong>{state.summary.totalRounds}</strong></div>
              <div className="metric"><span>Total accuracy</span><strong>{state.summary.totalAccuracy}</strong></div>
            </div>
            <div className="stack" style={{ marginTop: 16 }}>
              {state.roundResults.map((round) => (
                <article className="metric" key={round.roundIndex}>
                  <span>Round {round.roundIndex + 1}</span>
                  <strong>{round.event.title}</strong>
                  <p className="small">
                    Accuracy {round.roundAccuracy}% · XP {round.roundXp} · year {round.yearAccuracy}% · location {round.locationAccuracy}%
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {canProceed && latest && (
          <section className="card">
            <p className="small">The result screen is locked until you continue manually.</p>
          </section>
        )}
      </div>
    </main>
  );
}
