"use client";

// ============================================================================
// Compete Game Page — DO-Authoritative Client Renderer
// TASK: MP-DO-AUTHORITATIVE-001
//
// Architecture (strict):
//   DB = canonical truth (persistence, replay)
//   DO = executor (validates, writes DB, broadcasts state)
//   Client = renderer (displays state, sends action signals)
//
// Rules:
//   - ALL displayed state originates from DO via STATE_UPDATE (WS)
//   - STATE_INVALIDATED is legacy fallback → triggers REST re-fetch
//   - NO client-driven REST refreshSnapshot() for normal flow
//   - NO fabricated timestamps, ready flags, or roster entries
//   - Timer display is derived locally from snapshot.roundEndsAt (UI-only,
//     not state that influences gameplay authority)
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getRoundResultsRequest,
  isCompeteSessionSnapshot
} from "@/core/competeApi";
import { CompeteWebSocket } from "@/core/competeWebSocket";
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { useIdentity } from "@/hooks/useIdentity";

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

function computeTimeRemaining(roundEndsAt: string | null): number | null {
  if (!roundEndsAt) return null;
  const endMs = new Date(roundEndsAt).getTime();
  if (Number.isNaN(endMs)) return null;
  return Math.max(0, Math.round((endMs - Date.now()) / 1000));
}

export default function CompeteGamePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";

  const [snapshot, setSnapshot] = useState<CompeteSessionSnapshot | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[] | null>(null);
  const [guessYear, setGuessYear] = useState<number | null>(null);
  const [guessLat, setGuessLat] = useState<number | null>(null);
  const [guessLng, setGuessLng] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { playerId, isReady, isLoading: identityLoading, error: identityError } = useIdentity();
  const wsRef = useRef<CompeteWebSocket | null>(null);
  const displayNameRef = useRef<string>("");

  // Read display name from sessionStorage (cosmetic only — identity is Supabase)
  useEffect(() => {
    if (!gameId) return;
    try {
      displayNameRef.current = sessionStorage.getItem(`compete_display_name_${gameId}`) || "";
    } catch {
      // ignore
    }
  }, [gameId]);

  // No REST fallback — WS is the ONLY state source.
  // If WS fails, the onError callback surfaces the error to the user.

  // Connect WebSocket — BLOCKED until Supabase identity is ready.
  // DO delivers authoritative state via STATE_UPDATE.
  useEffect(() => {
    if (!gameId || !playerId || !isReady) return;

    const ws = new CompeteWebSocket(gameId, playerId, {
      onConnect: () => {
        // Signal intent to join (PartyKit → API → DB → broadcast STATE_UPDATE)
        ws.joinRoom(displayNameRef.current);
      },
      onStateUpdate: (rawSnapshot) => {
        // DO-authoritative: apply snapshot directly from WS.
        // Validate before accepting — never trust unvalidated payloads.
        if (isCompeteSessionSnapshot(rawSnapshot)) {
          console.log("[CompeteGamePage] State update received, players:", rawSnapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
          setSnapshot(rawSnapshot);
          setBusy(false); // Action completed — clear busy flag
        } else {
          console.error("[CompeteGamePage] Invalid STATE_UPDATE payload from DO:", rawSnapshot);
          setError("Received invalid state from server");
          setBusy(false);
        }
      },
      onError: (message) => {
        setError(message);
        setBusy(false); // Action failed — clear busy flag
      }
    });

    wsRef.current = ws;
    ws.connect();

    // DO sends STATE_UPDATE on connect — no REST fetch needed.

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [gameId, playerId, isReady]);

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

  // When the snapshot enters ROUND_COMPLETE or SESSION_COMPLETE,
  // fetch round results from the DB. Clear on any other phase.
  useEffect(() => {
    if (!snapshot) {
      setRoundResults(null);
      return;
    }
    if (snapshot.status === "ROUND_COMPLETE" || snapshot.status === "SESSION_COMPLETE") {
      let cancelled = false;
      getRoundResultsRequest(gameId, snapshot.currentRoundIndex)
        .then((results) => {
          if (cancelled) return;
          const ranked = [...results].sort((a, b) => a.rank - b.rank);
          setRoundResults(ranked);
        })
        .catch(() => {
          if (!cancelled) setRoundResults(null);
        });
      return () => {
        cancelled = true;
      };
    }
    setRoundResults(null);
  }, [snapshot, gameId]);

  // Reset guess inputs whenever the active round changes.
  useEffect(() => {
    if (!snapshot) return;
    setGuessYear(null);
    setGuessLat(null);
    setGuessLng(null);
  }, [snapshot?.currentRoundIndex, snapshot?.status]);

  const viewer = useMemo(() => {
    if (!snapshot || !playerId) return null;
    return snapshot.players.find((p) => p.playerId === playerId) ?? null;
  }, [snapshot, playerId]);

  // Authoritative: derived from snapshot.players[].hasSubmitted (DB → snapshot).
  const hasSubmitted = viewer?.hasSubmitted ?? false;

  const handleReady = useCallback(() => {
    if (!playerId || !wsRef.current) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    wsRef.current.toggleReady(true);
    // DO will broadcast STATE_UPDATE or ERROR via WS callbacks
    // busy flag cleared when STATE_UPDATE arrives (snapshot changes)
  }, [playerId]);

  const handleStart = useCallback(() => {
    if (!playerId || !wsRef.current) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    wsRef.current.startGame();
  }, [playerId]);

  const handleSubmitGuess = useCallback(() => {
    if (!snapshot || !playerId || !wsRef.current) return;
    if (guessYear === null || guessLat === null || guessLng === null) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    wsRef.current.submitGuess(
      snapshot.currentRoundIndex,
      guessYear,
      guessLat,
      guessLng
    );
  }, [snapshot, playerId, guessYear, guessLat, guessLng]);

  const handleAdvanceRound = useCallback(() => {
    if (!snapshot || !playerId || !wsRef.current) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    wsRef.current.advanceRound(snapshot.currentRoundIndex);
  }, [snapshot, playerId]);

  if (!gameId) return null;

  if (identityLoading) {
    return (
      <main className="app-shell">
        <div className="shell-grid">
          <section className="hero">
            <span className="badge">Compete</span>
            <h1>Establishing identity…</h1>
            <p className="small">Game ID: {gameId}</p>
          </section>
        </div>
      </main>
    );
  }

  if (identityError) {
    return (
      <main className="app-shell">
        <div className="shell-grid">
          <section className="hero">
            <span className="badge">Compete</span>
            <h1>Identity error</h1>
            <p style={{ color: "#ff6b6b", margin: 0 }}>{identityError}</p>
          </section>
        </div>
      </main>
    );
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

  const renderError = error ? <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p> : null;

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
              <button type="button" className="button" onClick={handleStart} disabled={busy}>
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
                <span className="small">Submitted</span>
                <strong>
                  {snapshot.players.filter((p) => p.hasSubmitted && p.leftAt === null).length}
                  {" / "}
                  {snapshot.players.filter((p) => p.leftAt === null).length}
                </strong>
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
                  disabled={busy || hasSubmitted}
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
                  disabled={busy || hasSubmitted}
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
                  disabled={busy || hasSubmitted}
                />
              </div>
              <button
                type="button"
                className="button"
                onClick={handleSubmitGuess}
                disabled={
                  busy ||
                  hasSubmitted ||
                  guessYear === null ||
                  guessLat === null ||
                  guessLng === null
                }
              >
                {busy ? "Submitting…" : "Submit Guess"}
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
            <button
              type="button"
              className="button"
              onClick={handleAdvanceRound}
              disabled={busy}
            >
              {busy ? "Advancing…" : "Next Round"}
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
