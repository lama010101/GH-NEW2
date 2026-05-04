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
import dynamic from "next/dynamic";
import {
  isCompeteSessionSnapshot
} from "@/core/competeApi";
import { CompeteWebSocket } from "@/core/competeWebSocket";
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { useIdentity } from "@/hooks/useIdentity";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

const StaticResultMap = dynamic(
  () => import("@/components/StaticResultMap").then((m) => m.StaticResultMap),
  { ssr: false }
);

type RoundResult = {
  playerId: string;
  score: number;
  rank: number;
  accuracy: number;
  didSubmit: boolean;
  guessYear: number | null;
  guessLat?: number | null;
  guessLng?: number | null;
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function RainbowRing({ value }: { value: number }) {
  const r = 50;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
  const hue = Math.round((Math.max(0, Math.min(100, value)) / 100) * 120);
  const color = `hsl(${hue}, 100%, 45%)`;
  return (
    <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, margin: "0 auto", display: "block" }}>
      <circle cx={60} cy={60} r={r} fill="none" stroke="#2a2a2a" strokeWidth={10} />
      <circle
        cx={60} cy={60} r={r} fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.6s ease" }}
      />
      <text x={60} y={60} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={22} fontWeight="bold">
        {Math.round(value)}
      </text>
    </svg>
  );
}

function yearAccuracyPct(diff: number | null): number | null {
  if (diff == null) return null;
  return Math.max(0, Math.round(100 - diff));
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
  const [localSubmitted, setLocalSubmitted] = useState(false);
  const [submissionToasts, setSubmissionToasts] = useState<string[]>([]);
  const [timerClamped, setTimerClamped] = useState(false);

  const { playerId, isReady, isLoading: identityLoading, error: identityError } = useIdentity();
  const wsRef = useRef<CompeteWebSocket | null>(null);
  const displayNameRef = useRef<string>("");

  // Auto-submit on timer expiry using current input values.
  // Refs are necessary because useEffect closures cannot safely read state that changes frequently.
  const guessYearRef = useRef<number | null>(null);
  const guessLatRef = useRef<number | null>(null);
  const guessLngRef = useRef<number | null>(null);

  // Read display name from sessionStorage (cosmetic only — identity is Supabase)
  useEffect(() => {
    if (!gameId) return;
    try {
      displayNameRef.current = sessionStorage.getItem(`compete_display_name_${gameId}`) || "";
    } catch {
      // ignore
    }
  }, [gameId]);

  // Sync refs with state to avoid stale closure issues in auto-submit effect.
  useEffect(() => { guessYearRef.current = guessYear; }, [guessYear]);
  useEffect(() => { guessLatRef.current = guessLat; }, [guessLat]);
  useEffect(() => { guessLngRef.current = guessLng; }, [guessLng]);

  // No REST fallback — WS is the ONLY state source.
  // If WS fails, the onError callback surfaces the error to the user.

  // Connect WebSocket — BLOCKED until Supabase identity is ready.
  // DO delivers authoritative state via STATE_UPDATE.
  useEffect(() => {
    if (!gameId || !playerId || !isReady) return;

    const ws = new CompeteWebSocket(gameId, playerId, {
      onConnect: () => {
        // Signal intent to join (PartyKit → API → DB → broadcast STATE_UPDATE).
        // Fallback to a short id-derived name when the page is opened via
        // a direct URL (no sessionStorage displayName). Server /join validates
        // non-empty displayName — so we must never send "".
        const fallbackName = displayNameRef.current.trim().length > 0
          ? displayNameRef.current
          : `Player-${playerId.slice(0, 6)}`;
        ws.joinRoom(fallbackName);
      },
      onStateUpdate: (rawSnapshot) => {
        // DO-authoritative: apply snapshot directly from WS.
        // Validate before accepting — never trust unvalidated payloads.
        if (isCompeteSessionSnapshot(rawSnapshot)) {
          console.log("[CompeteGamePage] State update received, players:", rawSnapshot.players.map(p => ({ id: p.playerId.slice(0,8), name: p.displayName, isHost: p.isHost })));
          setSnapshot(rawSnapshot);

          // If the snapshot includes pre-fetched results (from /complete route), apply them directly
          if (
            isCompeteSessionSnapshot(rawSnapshot) &&
            (rawSnapshot.status === "ROUND_COMPLETE" || rawSnapshot.status === "SESSION_COMPLETE") &&
            Array.isArray((rawSnapshot as unknown as { results?: unknown }).results)
          ) {
            const results = (rawSnapshot as unknown as { results: RoundResult[] }).results;
            const ranked = [...results].sort((a, b) => a.rank - b.rank);
            setRoundResults(ranked);
            setLocalSubmitted(false);
            setSubmissionToasts([]); // Action completed — clear busy flag
          }

          setBusy(false); // Action completed — clear busy flag
        } else {
          console.warn("[CompeteGamePage] Invalid STATE_UPDATE payload — ignoring, waiting for next update:", rawSnapshot);
          setBusy(false);
        }
      },
      onPlayerSubmitted: (submittedPlayerId, playerName) => {
        const isSelf = submittedPlayerId === playerId;
        const label = isSelf ? 'You made a guess' : `${playerName} made a guess`;
        setSubmissionToasts(prev => [...prev, label]);
      },
      onTimerClamped: (newPhaseEndsAt) => {
        // Update timer display from newPhaseEndsAt
        setSnapshot((prev) => {
          if (!prev) return prev;
          return { ...prev, roundEndsAt: newPhaseEndsAt };
        });
        // Trigger red flash
        setTimerClamped(true);
        setTimeout(() => setTimerClamped(false), 600);
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

  // Auto-submit on timer expiry using current input values.
  // Fires once when timeRemaining hits 0 and player has not already submitted.
  useEffect(() => {
    if (timeRemaining !== 0) return;
    if (!snapshot || snapshot.status !== "ROUND_ACTIVE") return;
    if (localSubmitted) return;
    if (!wsRef.current || !playerId) return;

    const currentRoundIndex = snapshot.currentRoundIndex;

    // Auto-submit with whatever values the player has entered (null is valid)
    setLocalSubmitted(true);
    setBusy(true);
    wsRef.current.submitGuess(
      currentRoundIndex,
      guessYearRef.current,
      guessLatRef.current,
      guessLngRef.current
    );
  }, [timeRemaining, snapshot, localSubmitted, playerId]);

  // Reset guess inputs whenever the active round changes.
  useEffect(() => {
    if (!snapshot) return;
    setGuessYear(null);
    setGuessLat(null);
    setGuessLng(null);
    setLocalSubmitted(false);
    setRoundResults(null);
    setSubmissionToasts([]);
  }, [snapshot?.currentRoundIndex]);

  const viewer = useMemo(() => {
    if (!snapshot || !playerId) return null;
    return snapshot.players.find((p) => p.playerId === playerId) ?? null;
  }, [snapshot, playerId]);

  // Authoritative: derived from snapshot.players[].hasSubmitted (DB → snapshot).
  const hasSubmitted = viewer?.hasSubmitted ?? false;

  // Derived location for map component
  const guessLocation = guessLat !== null && guessLng !== null
    ? { lat: guessLat, lng: guessLng }
    : null;

  const handleSetLocation = useCallback((location: { lat: number; lng: number }) => {
    setGuessLat(location.lat);
    setGuessLng(location.lng);
  }, []);

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
    if (localSubmitted) return;       // synchronous guard — no re-render needed
    setLocalSubmitted(true);
    setTimerClamped(true);
    setTimeout(() => setTimerClamped(false), 600);
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    wsRef.current.submitGuess(
      snapshot.currentRoundIndex,
      guessYear,
      guessLat,
      guessLng
    );
  }, [snapshot, playerId, guessYear, guessLat, guessLng, localSubmitted]);

  const handleAdvanceRound = useCallback(() => {
    if (!snapshot || !playerId || !wsRef.current) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    wsRef.current.advanceRound(snapshot.currentRoundIndex);
    setTimeout(() => setBusy(false), 5000);
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
        {/* Toast stack - top-center */}
        <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 50, pointerEvents: 'none' }}>
          {submissionToasts.map((label, i) => (
            <div key={i} style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.875rem', padding: '0.5rem 1rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          ))}
        </div>

        {/* Red flash overlay */}
        {timerClamped && (
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none', backgroundColor: 'rgba(220, 38, 38, 0.35)' }}
          />
        )}

        <section className="hero">
          <span className="badge">Compete · {snapshot.status}</span>
          {snapshot.status !== "LOBBY" ? (
            <h1>
              Round {Math.min(snapshot.currentRoundIndex + 1, snapshot.config.totalRounds)} of{" "}
              {snapshot.config.totalRounds}
            </h1>
          ) : (
            <h1>Lobby</h1>
          )}
          <p className="small">
            Game ID: <code>{snapshot.gameId}</code>
            {viewer?.isHost ? (
              <button
                type="button"
                className="button secondary"
                style={{ marginLeft: 8, padding: "2px 8px", fontSize: "0.8em" }}
                onClick={() => { navigator.clipboard.writeText(snapshot.gameId); }}
              >
                Copy
              </button>
            ) : null}
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
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Round timer:{" "}
              <strong>
                {snapshot.config.roundTimerSec >= 60
                  ? `${Math.floor(snapshot.config.roundTimerSec / 60)}m${snapshot.config.roundTimerSec % 60 > 0 ? ` ${snapshot.config.roundTimerSec % 60}s` : ""}` 
                  : `${snapshot.config.roundTimerSec}s`}
              </strong>
            </p>
            <div className="row">
              <button
                type="button"
                className="button secondary"
                onClick={handleReady}
                disabled={busy || Boolean(viewer?.ready)}
              >
                {viewer?.ready ? "Ready ✓" : "Ready"}
              </button>
              {viewer?.isHost ? (
                <button type="button" className="button" onClick={handleStart} disabled={busy || !snapshot.allPlayersReady}>
                  Start Game
                </button>
              ) : (
                <span className="small">Waiting for host to start…</span>
              )}
            </div>
            {renderError}
          </section>
        ) : null}

        {snapshot.status === "ROUND_ACTIVE" ? (
          <section className="card stack">
            {(() => {
              const currentEvent = snapshot.rounds?.[snapshot.currentRoundIndex];
              return currentEvent ? (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 500, fontSize: 15, marginBottom: 8 }}>
                    {currentEvent.title}
                  </p>
                  {currentEvent.imageUrl ? (
                    <img
                      src={currentEvent.imageUrl}
                      alt={currentEvent.title}
                      style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 8, display: "block" }}
                    />
                  ) : (
                    <div style={{
                      width: "100%", height: 200, background: "var(--color-background-secondary)",
                      borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--color-text-secondary)", fontSize: 14
                    }}>
                      No image available
                    </div>
                  )}
                </div>
              ) : null;
            })()}
            <h2>Round {snapshot.currentRoundIndex + 1}</h2>
            <p>
              Time remaining: <strong>{timeRemaining === null ? "—" : `${Math.max(0, Math.floor(timeRemaining))}s`}</strong>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: 6 }}>
                / {snapshot.config.roundTimerSec}s
              </span>
            </p>
            <div className="row">
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
                  placeholder={guessYear === null ? "— not set —" : undefined}
                  value={guessYear ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setGuessYear(null);
                    } else {
                      const num = Number(v);
                      if (!Number.isNaN(num)) {
                        setGuessYear(num);
                      }
                    }
                  }}
                  disabled={busy || hasSubmitted}
                />
                <input
                  type="range"
                  min={-3000}
                  max={new Date().getFullYear()}
                  // TODO: wire min/max from session config when available
                  value={guessYear ?? Math.floor((-3000 + new Date().getFullYear()) / 2)}
                  onChange={(e) => {
                    setGuessYear(Number(e.target.value));
                  }}
                  disabled={busy || hasSubmitted}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ width: "100%", height: "320px", borderRadius: "20px", overflow: "hidden", pointerEvents: (hasSubmitted || localSubmitted) ? "none" : "auto" }}>
                <GameMap
                  guessLocation={guessLocation}
                  onSetLocation={handleSetLocation}
                />
              </div>
              <button
                type="button"
                className="button"
                onClick={handleSubmitGuess}
                disabled={
                  busy ||
                  hasSubmitted ||
                  localSubmitted ||
                  guessYear === null ||
                  guessLocation === null
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
            {(() => {
              const roundData = snapshot.rounds[snapshot.currentRoundIndex];
              if (!roundData) return null;
              return (
                <div>
                  {roundData.title && (
                    <h3 style={{ margin: "0 0 12px 0", fontSize: 18 }}>{roundData.title}</h3>
                  )}
                  {roundData.imageUrl ? (
                    <img
                      src={roundData.imageUrl}
                      alt={roundData.title || "Event image"}
                      style={{
                        width: "100%",
                        maxHeight: "300px",
                        objectFit: "cover",
                        borderRadius: 4,
                        marginBottom: 12
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "200px",
                        backgroundColor: "#e0e0e0",
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 12,
                        color: "#666"
                      }}
                    >
                      No image available
                    </div>
                  )}
                  {roundData.year && roundData.year !== 0 && (
                    <p style={{ margin: "0 0 8px 0", fontSize: 14 }}>
                      <strong>Answer: {roundData.year}</strong>
                    </p>
                  )}
                  {roundData.locationName ? (
                    <p style={{ margin: 0, fontSize: 14 }}>
                      Location: {roundData.locationName}
                    </p>
                  ) : roundData.latitude !== 0 && roundData.longitude !== 0 ? (
                    <p style={{ margin: 0, fontSize: 14 }}>
                      Location: {roundData.latitude.toFixed(4)}, {roundData.longitude.toFixed(4)}
                    </p>
                  ) : null}
                  {/* TODO MP-UI-BUILD-002: event description not in snapshot — needs API route update */}
                </div>
              );
            })()}
            {/* Accuracy Ring + Leaderboard + WHERE + WHEN cards */}
            {(() => {
              const round = snapshot.rounds[snapshot.currentRoundIndex];
              if (!round) return null;
              const myResult = roundResults?.find(r => r.playerId === playerId);
              const accuracy = myResult?.accuracy ?? 0;
              const correctLat = round.latitude;
              const correctLng = round.longitude;
              const correctName = round.locationName;
              const myDistanceKm = (guessLat != null && guessLng != null)
                ? haversineKm(guessLat, guessLng, correctLat, correctLng)
                : null;
              const correctYear = round.year;
              const leaderboardRows = (roundResults ?? [])
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((r, i) => ({
                  rank: i + 1,
                  playerId: r.playerId,
                  displayName: snapshot.players.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8),
                  score: r.score,
                  accuracy: r.accuracy,
                  isMe: r.playerId === playerId,
                }));
              const whenRows = snapshot.players
                .map(p => {
                  const resultRow = roundResults?.find(r => r.playerId === p.playerId);
                  const theirGuessYear = resultRow?.guessYear ?? null;
                  const diff = theirGuessYear != null ? Math.abs(theirGuessYear - correctYear) : null;
                  return {
                    playerId: p.playerId,
                    displayName: p.displayName || p.playerId.slice(0, 8),
                    guessYear: theirGuessYear,
                    diff,
                    isMe: p.playerId === playerId,
                  };
                })
                .sort((a, b) => {
                  if (a.diff == null && b.diff == null) return 0;
                  if (a.diff == null) return 1;
                  if (b.diff == null) return -1;
                  return a.diff - b.diff;
                });
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
                  {/* Card 1 — Accuracy Ring */}
                  <div style={{ backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", marginBottom: 8, letterSpacing: 1 }}>ACCURACY</div>
                    <RainbowRing value={accuracy} />
                  </div>
                  {/* Card 2 — XP */}
                  <div style={{ backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                      EXPERIENCE
                    </div>
                    <div style={{ fontSize: 28, fontWeight: "bold", color: "white" }}>
                      {myResult?.score ?? 0}
                      <span style={{ fontSize: 14, color: "#f97316", marginLeft: 6 }}>XP</span>
                    </div>
                  </div>
                  {/* Card 3 — Round Leaderboard */}
                  <div style={{ backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", marginBottom: 10, letterSpacing: 1 }}>ROUND LEADERBOARD</div>
                    {leaderboardRows.length > 0 ? (
                      <div>
                        {leaderboardRows.map((row) => (
                          <div
                            key={row.playerId}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 10px",
                              borderRadius: 8,
                              marginBottom: 4,
                              backgroundColor: row.isMe ? "#2a2a2a" : "transparent",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ color: "#888", fontSize: 12, minWidth: 20 }}>{row.rank}</span>
                              <span style={{ color: row.isMe ? "#f97316" : "white", fontWeight: row.isMe ? "bold" : "normal", marginLeft: 8 }}>
                                {row.displayName}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ color: "white", fontWeight: "bold" }}>{row.score}</span>
                              <span style={{ backgroundColor: "#333", borderRadius: 999, padding: "2px 8px", fontSize: 11, color: "#aaa", marginLeft: 8 }}>
                                {Math.round(row.accuracy)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: "#888", textAlign: "center", margin: 0 }}>Waiting for results…</p>
                    )}
                  </div>
                  {/* Card 3 — WHERE */}
                  <div style={{ backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ color: "#f97316", fontWeight: "bold", fontSize: 14 }}>📍 WHERE</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {myResult != null && (
                          <span style={{
                            backgroundColor: "#1a2e1a",
                            color: `hsl(${Math.round((Math.max(0, Math.min(100, myResult.accuracy)) / 100) * 120)}, 100%, 45%)`,
                            borderRadius: 999,
                            padding: "3px 10px",
                            fontSize: 12,
                            fontWeight: "bold",
                          }}>
                            {Math.round(myResult.accuracy)}%
                          </span>
                        )}
                        {myDistanceKm != null && (
                          <span style={{ backgroundColor: "#2a2a2a", borderRadius: 999, padding: "4px 10px", fontSize: 12, color: "#fff" }}>
                            {Math.round(myDistanceKm)} km away
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ color: "#f97316", fontSize: 13, marginBottom: 8 }}>Correct: {correctName}</div>
                    {guessLat != null && guessLng != null ? (
                      <div style={{ height: 200, borderRadius: 8, overflow: "hidden" }}>
                        <StaticResultMap
                          key={`where-card-${snapshot.currentRoundIndex}`}
                          correctLat={correctLat}
                          correctLng={correctLng}
                          guessLat={guessLat}
                          guessLng={guessLng}
                          playerGuesses={roundResults
                            ?.filter((r) => r.didSubmit && r.guessLat != null && r.guessLng != null)
                            .map((r) => ({
                              playerId: r.playerId,
                              lat: r.guessLat!,
                              lng: r.guessLng!,
                              label: playerLabel(snapshot.players, r.playerId),
                              color: r.playerId === playerId ? "#f97316" : undefined,
                            })) ?? undefined}
                        />
                      </div>
                    ) : (
                      <p style={{ color: "#888", fontSize: 13, margin: 0 }}>No location submitted</p>
                    )}
                  </div>
                  {/* Card 4 — WHEN */}
                  <div style={{ backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16 }}>
                    <div style={{ color: "#f97316", fontWeight: "bold", fontSize: 14, marginBottom: 12 }}>📅 WHEN</div>
                    <div style={{ color: "#f97316", fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>Correct year: {correctYear}</div>
                    {whenRows.map((row) => (
                      <div
                        key={row.playerId}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 0",
                          borderBottom: "1px solid #2a2a2a",
                        }}
                      >
                        <span>
                          <span style={{ color: row.isMe ? "#f97316" : "white" }}>{row.displayName}</span>
                          {row.isMe && <span style={{ color: "#888" }}> (you)</span>}
                        </span>
                        <span style={{ color: "#aaa" }}>{row.guessYear ?? "—"}</span>
                        <span>
                          {row.diff === 0 ? (
                            <span style={{ backgroundColor: "#22c55e", borderRadius: 999, padding: "2px 8px", fontSize: 12, color: "#fff" }}>Perfect!</span>
                          ) : row.diff != null ? (
                            <span style={{ backgroundColor: "#2a2a2a", borderRadius: 999, padding: "2px 8px", fontSize: 12, color: "#fff" }}>{row.diff} yrs off</span>
                          ) : (
                            <span style={{ color: "#888" }}>—</span>
                          )}
                        </span>
                        {(() => {
                          const acc = yearAccuracyPct(row.diff);
                          if (acc == null) return <span style={{ color: "#888" }}>—</span>;
                          const hue = Math.round((acc / 100) * 120);
                          return (
                            <span style={{
                              backgroundColor: "#2a2a2a",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 11,
                              color: `hsl(${hue}, 100%, 45%)`,
                              fontWeight: "bold",
                              marginLeft: 4,
                            }}>
                              {acc}%
                            </span>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div style={{
              position: "sticky",
              bottom: 0,
              backgroundColor: "#111",
              borderTop: "1px solid #2a2a2a",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              zIndex: 10,
            }}>
              <span style={{ color: "#888", fontSize: 13 }}>
                Round {Math.min(snapshot.currentRoundIndex + 1, snapshot.config.totalRounds)} of {snapshot.config.totalRounds}
              </span>
              <button
                type="button"
                className="button"
                onClick={handleAdvanceRound}
                disabled={busy}
              >
                {busy ? "Advancing…" : "Next Round"}
              </button>
            </div>
            {renderError}
          </section>
        ) : null}

        {snapshot.status === "SESSION_COMPLETE" ? (
          <section className="card stack">
            <h2>Game Over</h2>
            {/* Event reveal section */}
            {(() => {
              const roundData = snapshot.rounds[snapshot.currentRoundIndex];
              if (!roundData) return null;
              return (
                <div style={{ marginBottom: 16 }}>
                  {roundData.title && (
                    <h3 style={{ margin: "0 0 12px 0", fontSize: 18 }}>{roundData.title}</h3>
                  )}
                  {roundData.imageUrl ? (
                    <img
                      src={roundData.imageUrl}
                      alt={roundData.title || "Event image"}
                      style={{
                        width: "100%",
                        maxHeight: "300px",
                        objectFit: "cover",
                        borderRadius: 4,
                        marginBottom: 12
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "200px",
                        backgroundColor: "#e0e0e0",
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 12,
                        color: "#666"
                      }}
                    >
                      No image available
                    </div>
                  )}
                  {roundData.year && roundData.year !== 0 && (
                    <p style={{ margin: "0 0 8px 0", fontSize: 14 }}>
                      <strong>Answer: {roundData.year}</strong>
                    </p>
                  )}
                  {roundData.locationName ? (
                    <p style={{ margin: 0, fontSize: 14 }}>
                      Location: {roundData.locationName}
                    </p>
                  ) : roundData.latitude !== 0 && roundData.longitude !== 0 ? (
                    <p style={{ margin: 0, fontSize: 14 }}>
                      Location: {roundData.latitude.toFixed(4)}, {roundData.longitude.toFixed(4)}
                    </p>
                  ) : null}
                </div>
              );
            })()}
            {/* Final round map */}
            {(() => {
              const roundData = snapshot.rounds[snapshot.currentRoundIndex];
              if (!roundData) return null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: "#FF6B2B" }}>
                      Correct: {roundData.locationName ?? `${roundData.latitude.toFixed(2)}, ${roundData.longitude.toFixed(2)}`}
                    </span>
                  </div>
                  <StaticResultMap
                    key="session-complete"
                    correctLat={roundData.latitude}
                    correctLng={roundData.longitude}
                    guessLat={null}
                    guessLng={null}
                    playerGuesses={roundResults
                      ?.filter((r) => r.didSubmit && r.guessLat != null && r.guessLng != null)
                      .map((r) => ({
                        playerId: r.playerId,
                        lat: r.guessLat!,
                        lng: r.guessLng!,
                        label: playerLabel(snapshot.players, r.playerId),
                        color: r.playerId === playerId ? "#FF6B2B" : undefined,
                      })) ?? undefined}
                  />
                </div>
              );
            })()}
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
                        {!r.didSubmit && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: "var(--color-text-secondary)",
                            background: "var(--color-background-secondary)",
                            borderRadius: 4,
                            padding: "1px 6px"
                          }}>
                            No guess
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 0" }}>
                        {r.didSubmit ? r.score : "—"}
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 0" }}>
                        {r.didSubmit ? r.rank : "—"}
                      </td>
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
