"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  loadCompeteSessionRequest,
  setCompeteReadyRequest,
  startCompeteSessionRequest
} from "@/core/competeApi";
import { CompeteWebSocket } from "@/core/competeWebSocket";
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";

type RoundResult = {
  playerId: string;
  score: number;
  rank: number;
  accuracy: number;
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

function playerLabel(players: SessionPlayer[], playerId: string): string {
  const match = players.find((p) => p.playerId === playerId);
  if (match && match.displayName.trim().length > 0) {
    return match.displayName;
  }
  return shortId(playerId);
}

export default function CompeteGamePage() {
  const router = useRouter();
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";

  const [snapshot, setSnapshot] = useState<CompeteSessionSnapshot | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[] | null>(null);
  const [guessYear, setGuessYear] = useState<number | null>(null);
  const [guessLat, setGuessLat] = useState<number | null>(null);
  const [guessLng, setGuessLng] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wsRef = useRef<CompeteWebSocket | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const displayNameRef = useRef<string>("");

  // Bootstrap: check storage and redirect if missing
  useEffect(() => {
    if (!gameId) return;
    let storedPlayerId: string | null = null;
    let storedName = "";
    try {
      storedPlayerId = sessionStorage.getItem(`compete_player_id_${gameId}`);
      storedName = sessionStorage.getItem(`compete_display_name_${gameId}`) || "";
    } catch {
      storedPlayerId = null;
    }
    if (!storedPlayerId) {
      router.replace("/compete");
      return;
    }
    playerIdRef.current = storedPlayerId;
    displayNameRef.current = storedName;
  }, [gameId, router]);

  // Connect WebSocket
  useEffect(() => {
    if (!gameId) return;
    const playerId = playerIdRef.current;
    if (!playerId) return;

    const ws = new CompeteWebSocket(gameId, playerId, {
      onConnect: () => {
        ws.send({
          type: "JOIN_ROOM",
          playerId,
          displayName: displayNameRef.current
        });
      },
      onStateSnapshot: (snap) => {
        setSnapshot(snap);
      },
      onTimerTick: (remaining) => {
        setTimeRemaining(remaining);
      },
      onRoundComplete: (_round, results) => {
        const ranked = [...results]
          .sort((a, b) => b.score - a.score)
          .map((r, index) => ({
            playerId: r.playerId,
            score: r.score,
            accuracy: r.accuracy,
            rank: index + 1
          }));
        setRoundResults(ranked);
        setSubmitted(false);
      },
      onAdvanceRound: () => {
        setGuessYear(null);
        setGuessLat(null);
        setGuessLng(null);
        setSubmitted(false);
        setRoundResults(null);
      },
      onError: (message) => {
        setError(message);
      }
    });

    wsRef.current = ws;
    ws.connect();

    // Initial snapshot via REST to avoid depending solely on WS
    loadCompeteSessionRequest(gameId)
      .then((snap) => {
        if (snap) setSnapshot(snap);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load session");
      });

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [gameId]);

  const refreshSnapshot = useCallback(async () => {
    try {
      const snap = await loadCompeteSessionRequest(gameId);
      if (snap) setSnapshot(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh session");
    }
  }, [gameId]);

  const handleReady = useCallback(async () => {
    if (!playerIdRef.current) return;
    setBusy(true);
    setError(null);
    try {
      await setCompeteReadyRequest({
        gameId,
        playerId: playerIdRef.current,
        ready: true
      });
      await refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark ready");
    } finally {
      setBusy(false);
    }
  }, [gameId, refreshSnapshot]);

  const handleStart = useCallback(async () => {
    if (!playerIdRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const snap = await startCompeteSessionRequest({
        gameId,
        playerId: playerIdRef.current
      });
      setSnapshot(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
    } finally {
      setBusy(false);
    }
  }, [gameId]);

  const handleSubmitGuess = useCallback(() => {
    if (!snapshot || !wsRef.current) return;
    if (guessYear === null || guessLat === null || guessLng === null) return;
    if (submitted) return;
    setError(null);
    wsRef.current.submitGuess(
      snapshot.currentRoundIndex,
      guessYear,
      guessLat,
      guessLng
    );
    setSubmitted(true);
  }, [snapshot, guessYear, guessLat, guessLng, submitted]);

  const handleAdvanceRound = useCallback(() => {
    if (!snapshot || !wsRef.current) return;
    setError(null);
    wsRef.current.advanceRound(snapshot.currentRoundIndex);
  }, [snapshot]);

  const viewer = useMemo(() => {
    if (!snapshot || !playerIdRef.current) return null;
    return snapshot.players.find((p) => p.playerId === playerIdRef.current) ?? null;
  }, [snapshot]);

  if (!gameId) {
    return null;
  }

  if (!snapshot) {
    return (
      <main className="app-shell">
        <div className="shell-grid">
          <section className="hero">
            <span className="badge">Compete</span>
            <h1>Loading session…</h1>
            <p className="small">Game ID: {gameId}</p>
          </section>
          {error ? (
            <section className="card">
              <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>
            </section>
          ) : null}
        </div>
      </main>
    );
  }

  const renderError = error ? (
    <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>
  ) : null;

  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <span className="badge">Compete · {snapshot.status}</span>
          <h1>
            Round {Math.min(snapshot.currentRoundIndex + 1, snapshot.config.totalRounds)} of{" "}
            {snapshot.config.totalRounds}
          </h1>
          <p className="small">
            Game ID: <code>{snapshot.gameId}</code>
            {viewer ? <> · You: {viewer.displayName || shortId(viewer.playerId)}</> : null}
          </p>
        </section>

        {snapshot.status === "LOBBY" ? (
          <section className="card stack">
            <h2>Lobby</h2>
            <div className="stack">
              {snapshot.players.length === 0 ? (
                <p className="small">No players yet.</p>
              ) : (
                snapshot.players.map((p) => (
                  <div key={p.playerId} className="row">
                    <span>{p.displayName || shortId(p.playerId)}</span>
                    {p.isHost ? <span className="badge">Host</span> : null}
                    <span className="small">{p.ready ? "Ready" : "Not ready"}</span>
                  </div>
                ))
              )}
            </div>
            <div className="row">
              <button
                type="button"
                className="button secondary"
                onClick={handleReady}
                disabled={busy || Boolean(viewer?.ready)}
              >
                {viewer?.ready ? "Ready ✓" : "Ready"}
              </button>
              <button
                type="button"
                className="button"
                onClick={handleStart}
                disabled={busy}
              >
                Start Game
              </button>
            </div>
            {renderError}
          </section>
        ) : null}

        {snapshot.status === "ROUND_ACTIVE" ? (
          <section className="card stack">
            <h2>Round {snapshot.currentRoundIndex + 1}</h2>
            <div className="row">
              <div className="metric">
                <span className="small">Time remaining</span>
                <strong>
                  {timeRemaining === null ? "—" : `${Math.max(0, Math.floor(timeRemaining))}s`}
                </strong>
              </div>
              <div className="metric">
                <span className="small">Players</span>
                <strong>{snapshot.players.length}</strong>
              </div>
            </div>
            <div className="stack">
              <div className="field">
                <label htmlFor="guess-year">Year</label>
                <input
                  id="guess-year"
                  className="input"
                  type="number"
                  value={guessYear ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGuessYear(v === "" ? null : Number(v));
                  }}
                  disabled={submitted}
                />
              </div>
              <div className="field">
                <label htmlFor="guess-lat">Latitude</label>
                <input
                  id="guess-lat"
                  className="input"
                  type="number"
                  step="any"
                  value={guessLat ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGuessLat(v === "" ? null : Number(v));
                  }}
                  disabled={submitted}
                />
              </div>
              <div className="field">
                <label htmlFor="guess-lng">Longitude</label>
                <input
                  id="guess-lng"
                  className="input"
                  type="number"
                  step="any"
                  value={guessLng ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGuessLng(v === "" ? null : Number(v));
                  }}
                  disabled={submitted}
                />
              </div>
              <button
                type="button"
                className="button"
                onClick={handleSubmitGuess}
                disabled={
                  submitted ||
                  guessYear === null ||
                  guessLat === null ||
                  guessLng === null
                }
              >
                {submitted ? "Submitted" : "Submit Guess"}
              </button>
            </div>
            {renderError}
          </section>
        ) : null}

        {snapshot.status === "ROUND_COMPLETE" ? (
          <section className="card stack">
            <h2>Round {snapshot.currentRoundIndex + 1} Results</h2>
            {roundResults && roundResults.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>Player</th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>Score</th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {roundResults.map((r) => (
                    <tr key={r.playerId}>
                      <td style={{ padding: "6px 0" }}>
                        {playerLabel(snapshot.players, r.playerId)}
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 0" }}>{r.score}</td>
                      <td style={{ textAlign: "right", padding: "6px 0" }}>{r.rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small">Waiting for results…</p>
            )}
            <button type="button" className="button" onClick={handleAdvanceRound}>
              Next Round
            </button>
            {renderError}
          </section>
        ) : null}

        {snapshot.status === "SESSION_COMPLETE" ? (
          <section className="card stack">
            <h2>Game Over</h2>
            {roundResults && roundResults.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>Player</th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>Score</th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {roundResults.map((r) => (
                    <tr key={r.playerId}>
                      <td style={{ padding: "6px 0" }}>
                        {playerLabel(snapshot.players, r.playerId)}
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 0" }}>{r.score}</td>
                      <td style={{ textAlign: "right", padding: "6px 0" }}>{r.rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <Link href="/compete" className="button">
              Play Again
            </Link>
            {renderError}
          </section>
        ) : null}
      </div>
    </main>
  );
}
