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
  const r = 80;
  const cx = 100;
  const cy = 100;
  const strokeWidth = 15;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  const hue = Math.round((clamped / 100) * 120);
  const color = `hsl(${hue}, 100%, 50%)`;
  return (
    <svg viewBox="0 0 200 200" style={{ width: 170, height: 170, display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.6s ease" }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={52} fontWeight="bold">
        {Math.round(clamped)}
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

        {/* Home button */}
        <Link
          href="/"
          style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 50, textDecoration: 'none' }}
        >
          <span style={{ fontSize: 20, color: '#fff' }}>&#8592;</span>
        </Link>

        {snapshot.status !== "ROUND_COMPLETE" && (
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
        )}

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
          <section className="card stack" style={{ background: "#000" }}>
            {(() => {
              const round = snapshot.rounds[snapshot.currentRoundIndex];
              if (!round) return null;
              const myResult = roundResults?.find(r => r.playerId === playerId);
              const accuracy = myResult?.accuracy ?? 0;
              const correctLat = round.latitude;
              const correctLng = round.longitude;
              const correctName = round.locationName;
              const correctYear = round.year;
              const myDistanceKm = (guessLat != null && guessLng != null)
                ? haversineKm(guessLat, guessLng, correctLat, correctLng)
                : null;
              const leaderboardRows = (roundResults ?? [])
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((r, i) => ({
                  rank: i + 1,
                  displayName: snapshot.players.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8),
                  accuracy: r.accuracy,
                  isMe: r.playerId === playerId,
                }));
              const whenRows = snapshot.players
                .map(p => {
                  const resultRow = roundResults?.find(r => r.playerId === p.playerId);
                  const theirGuessYear = resultRow?.guessYear ?? null;
                  const diff = theirGuessYear != null ? Math.abs(theirGuessYear - correctYear) : null;
                  const acc = yearAccuracyPct(diff);
                  return {
                    playerId: p.playerId,
                    displayName: p.displayName || p.playerId.slice(0, 8),
                    guessYear: theirGuessYear,
                    diff,
                    acc,
                    isMe: p.playerId === playerId,
                  };
                })
                .sort((a, b) => {
                  if (a.acc == null && b.acc == null) return 0;
                  if (a.acc == null) return 1;
                  if (b.acc == null) return -1;
                  return b.acc - a.acc;
                });
              const whereHue = Math.round((Math.max(0, Math.min(100, myResult?.accuracy ?? 0)) / 100) * 120);
              const whereAccColor = `hsl(${whereHue}, 100%, 50%)`;
              const whereAccBg = (myResult?.accuracy ?? 0) >= 60 ? "#1a2e1a" : (myResult?.accuracy ?? 0) >= 30 ? "#2e2a1a" : "#2e1a1a";
              return (
                <>
                  {/* Card 1 — Accuracy Ring */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, margin: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "1.5px", textAlign: "center", marginBottom: 10 }}>
                      Accuracy
                    </div>
                    <RainbowRing value={accuracy} />
                  </div>
                  {/* Card 2 — XP */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, margin: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>
                      Experience
                    </div>
                    <span style={{ fontSize: 22, fontWeight: "bold", color: "#fff" }}>{myResult?.score ?? 0}</span>
                    <span style={{ fontSize: 13, color: "#f97316", marginLeft: 5 }}>XP</span>
                  </div>
                  {/* Card 3 — Event photo + info */}
                  <div style={{ margin: "8px 10px", borderRadius: 12, overflow: "hidden", background: "#333" }}>
                    {round.imageUrl ? (
                      <img src={round.imageUrl} alt={round.title}
                        style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ height: 160, background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 12 }}>
                        No image
                      </div>
                    )}
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{round.title}</div>
                      {(round as unknown as { description?: string }).description && (
                        <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5, marginBottom: 8 }}>{(round as unknown as { description?: string }).description}</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#aaa" }}>
                          Confidence: <span style={{ color: "#fff" }}>{(round as unknown as { confidencePct?: number }).confidencePct ?? "—"}%</span>
                        </span>
                        {(round as unknown as { sourceUrl?: string }).sourceUrl && (
                          <button
                            onClick={() => window.open((round as unknown as { sourceUrl?: string }).sourceUrl, "_blank")}
                            style={{ background: "#3a3a3a", border: "none", color: "#bbb", fontSize: 11, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                            Source
                          </button>
                        )}
                        <button
                          style={{ background: "#3a3a3a", border: "none", color: "#bbb", fontSize: 11, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                          Rate
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Card 4 — Round Leaderboard */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, margin: "8px 10px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Round leaderboard</div>
                    {leaderboardRows.map(row => {
                      const hue = Math.round((Math.max(0, Math.min(100, row.accuracy)) / 100) * 120);
                      const accColor = `hsl(${hue}, 100%, 50%)`;
                      const accBg = row.accuracy >= 60 ? "#1a2e1a" : row.accuracy >= 30 ? "#2e2a1a" : "#2e1a1a";
                      return (
                        <div key={row.rank} style={{
                          display: "flex", alignItems: "center", padding: "7px 8px",
                          borderRadius: 8, marginBottom: 3, gap: 6,
                          background: row.isMe ? "#2e2e2e" : "transparent",
                        }}>
                          <span style={{ fontSize: 11, color: "#777", minWidth: 14 }}>{row.rank}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>
                            <span style={{ color: row.isMe ? "#f97316" : "#fff", fontWeight: row.isMe ? 600 : 400 }}>
                              {row.displayName}
                            </span>
                            {row.isMe && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                          </span>
                          <span style={{ background: accBg, color: accColor, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
                            {Math.round(row.accuracy)}%
                          </span>
                        </div>
                      );
                    })}
                    {leaderboardRows.length === 0 && (
                      <p style={{ color: "#888", textAlign: "center", margin: 0, fontSize: 13 }}>Waiting for results…</p>
                    )}
                  </div>
                  {/* Card 5 — WHERE */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, margin: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Where</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {myDistanceKm != null && (
                          <span style={{ background: "#3a3a3a", color: "#bbb", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
                            {Math.round(myDistanceKm)} km away
                          </span>
                        )}
                        {myResult != null && (
                          <span style={{ background: whereAccBg, color: whereAccColor, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
                            {Math.round(myResult.accuracy)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#fff", marginBottom: 8 }}>
                      Correct: <span style={{ color: "#f97316" }}>{correctName}</span>
                    </div>
                    {guessLat != null && guessLng != null ? (
                      <div style={{ borderRadius: 8, overflow: "hidden", height: 200 }}>
                        <StaticResultMap
                          key={`result-map-${snapshot.currentRoundIndex}`}
                          correctLat={correctLat}
                          correctLng={correctLng}
                          guessLat={guessLat}
                          guessLng={guessLng}
                          playerGuesses={roundResults
                            ?.filter(r => r.didSubmit && r.guessLat != null && r.guessLng != null)
                            .map(r => ({
                              playerId: r.playerId,
                              lat: r.guessLat!,
                              lng: r.guessLng!,
                              label: `${Math.round(r.accuracy)}%`,
                              color: r.playerId === playerId ? "#f97316" : undefined,
                            })) ?? undefined}
                        />
                      </div>
                    ) : (
                      <p style={{ color: "#888", fontSize: 13, margin: 0 }}>No location submitted</p>
                    )}
                  </div>
                  {/* Card 6 — WHEN */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, margin: "8px 10px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>When</div>
                    <div style={{ fontSize: 12, color: "#fff", marginBottom: 10 }}>
                      Correct year: <span style={{ color: "#f97316" }}>{correctYear}</span>
                    </div>
                    {whenRows.map((row, idx) => {
                      const hue = row.acc != null ? Math.round((row.acc / 100) * 120) : null;
                      const accColor = hue != null ? `hsl(${hue}, 100%, 50%)` : "#888";
                      const accBg = row.acc != null
                        ? row.acc >= 60 ? "#1a2e1a" : row.acc >= 30 ? "#2e2a1a" : "#2e1a1a"
                        : "#2a2a2a";
                      return (
                        <div key={row.playerId} style={{
                          display: "flex", alignItems: "center", padding: "7px 0", gap: 6,
                          borderBottom: idx < whenRows.length - 1 ? "1px solid #333" : "none",
                        }}>
                          <span style={{ flex: 1, fontSize: 13 }}>
                            <span style={{ color: row.isMe ? "#f97316" : "#fff", fontWeight: row.isMe ? 600 : 400 }}>
                              {row.displayName}
                            </span>
                            {row.isMe && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                          </span>
                          <span style={{ fontSize: 12, color: "#aaa", minWidth: 36, textAlign: "center" }}>
                            {row.guessYear ?? "—"}
                          </span>
                          <span style={{ background: "#3a3a3a", color: "#bbb", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                            {row.diff != null ? `${row.diff} yrs off` : "—"}
                          </span>
                          <span style={{ background: accBg, color: accColor, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                            {row.acc != null ? `${row.acc}%` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Bottom Bar */}
                  <div style={{
                    position: "fixed",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "#000",
                    borderTop: "1px solid #222",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    zIndex: 50,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#999" }}>
                      Round {snapshot.currentRoundIndex + 1} / {snapshot.rounds.length}
                      <div style={{ display: "flex", gap: 3 }}>
                        {snapshot.rounds.map((_, i) => (
                          <div key={i} style={{
                            width: 26, height: 4, borderRadius: 2,
                            background: i < snapshot.currentRoundIndex
                              ? "#f97316"
                              : i === snapshot.currentRoundIndex
                              ? "#553311"
                              : "#333",
                          }} />
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleAdvanceRound}
                      style={{
                        background: "#f97316",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 15,
                        border: "none",
                        borderRadius: 10,
                        padding: "11px 26px",
                        cursor: "pointer",
                      }}
                    >
                      Next Round ›
                    </button>
                  </div>
                </>
              );
            })()}
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
