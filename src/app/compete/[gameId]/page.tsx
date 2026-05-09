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
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  isCompeteSessionSnapshot
} from "@/core/competeApi";
import { CompeteWebSocket } from "@/core/competeWebSocket";
import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { useIdentity } from "@/hooks/useIdentity";
import { HintModal } from "@/components/HintModal";
import type { HintPurchaseResult } from "@/components/HintModal";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

const StaticResultMap = dynamic(
  () => import("@/components/StaticResultMap").then((m) => m.StaticResultMap),
  { ssr: false }
);

const USERNAME_GRADIENT_PAIRS: [string, string][] = [
  ["#93c5fd", "#fb923c"], // blue → orange
  ["#93c5fd", "#c084fc"], // blue → purple
  ["#93c5fd", "#2dd4bf"], // blue → teal
  ["#fb923c", "#93c5fd"], // orange → blue
  ["#fb923c", "#c084fc"], // orange → purple
  ["#fb923c", "#2dd4bf"], // orange → teal
  ["#c084fc", "#93c5fd"], // purple → blue
  ["#c084fc", "#fb923c"], // purple → orange
  ["#c084fc", "#2dd4bf"], // purple → teal
  ["#2dd4bf", "#93c5fd"], // teal → blue
  ["#2dd4bf", "#fb923c"], // teal → orange
  ["#2dd4bf", "#c084fc"], // teal → purple
];

function getUsernameGradientStyle(playerId: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  const [from, to] = USERNAME_GRADIENT_PAIRS[hash % USERNAME_GRADIENT_PAIRS.length];
  return {
    background: `linear-gradient(90deg, ${from}, ${to})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    fontWeight: 500,
    display: "inline",
  };
}

function PlayerAvatar({ avatarUrl, displayName, size = 26 }: {
  avatarUrl: string | null;
  displayName: string;
  size?: number;
}) {
  const initial = (displayName || "?")[0].toUpperCase();
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "hidden",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#2a2a3a",
    border: "1.5px solid rgba(255,255,255,0.18)",
    fontSize: size * 0.42,
    fontWeight: 600,
    color: "rgba(255,255,255,0.75)",
    verticalAlign: "middle",
  };
  if (avatarUrl) {
    return (
      <span style={containerStyle}>
        <img
          src={avatarUrl}
          alt={displayName}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </span>
    );
  }
  return <span style={containerStyle}>{initial}</span>;
}

type RoundResult = {
  playerId: string;
  score: number;
  rank: number;
  accuracy: number;
  locationScore: number;
  didSubmit: boolean;
  guessYear: number | null;
  guessLat?: number | null;
  guessLng?: number | null;
  timeScore: number;
  badges: Array<{ dimension: 'year' | 'location' | 'combo'; tier: 'gold' | 'silver' | 'bronze'; accuracy: number }>;
  nearMisses: Array<{ dimension: 'year' | 'location' | 'combo'; accuracy: number }>;
};

type AllRoundResult = {
  playerId: string;
  roundIndex: number;
  score: number;
  rank: number;
  distanceKm: number | null;
  yearDiff: number | null;
  locationScore: number | null;
  timeScore: number | null;
  didSubmit: boolean;
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

  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (value <= 0) {
      setDisplayed(0);
      return;
    }

    const steps = Math.round(value);
    const totalDuration = 900; // ms
    const stepDuration = totalDuration / steps;

    // Build haptic pattern: 10ms vibration, 10ms gap per step
    // navigator.vibrate accepts [vibrate, pause, vibrate, pause, ...]
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      const pattern: number[] = [];
      for (let i = 0; i < steps; i++) {
        pattern.push(10);  // vibrate 10ms
        if (i < steps - 1) pattern.push(Math.max(0, Math.round(stepDuration) - 10)); // gap
      }
      navigator.vibrate(pattern);
    }

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setDisplayed(current);
      if (current >= steps) clearInterval(interval);
    }, stepDuration);

    return () => {
      clearInterval(interval);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(0); // cancel haptic on unmount
      }
    };
  }, [value]);

  const clamped = Math.max(0, Math.min(100, displayed));
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
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={52} fontWeight="bold">
        {clamped}
      </text>
    </svg>
  );
}

export default function CompeteGamePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<CompeteSessionSnapshot | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[] | null>(null);
  const [allRoundResults, setAllRoundResults] = useState<AllRoundResult[] | null>(null);
  const [guessYear, setGuessYear] = useState<number | null>(null);
  const [guessLat, setGuessLat] = useState<number | null>(null);
  const [guessLng, setGuessLng] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localSubmitted, setLocalSubmitted] = useState(false);
  const [submissionToasts, setSubmissionToasts] = useState<string[]>([]);
  const [timerClamped, setTimerClamped] = useState(false);
  const [hintModalOpen, setHintModalOpen] = useState(false);
  const [hintResult, setHintResult] = useState<HintPurchaseResult>({
    purchasedIds: [],
    accPenalty: 0,
    xpPenalty: 0,
  });
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  const [resultSecsLeft, setResultSecsLeft] = useState<number | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const submittedHintPenaltyRef = useRef<{ accPenalty: number; xpPenalty: number; purchasedIds: string[] }>({
    accPenalty: 0,
    xpPenalty: 0,
    purchasedIds: [],
  });

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
        if (submittedPlayerId !== playerId) {
          setTimerClamped(true);
          setTimeout(() => setTimerClamped(false), 600);
        }
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
    submittedHintPenaltyRef.current = {
      accPenalty: hintResult.accPenalty,
      xpPenalty: hintResult.xpPenalty,
      purchasedIds: hintResult.purchasedIds,
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
  }, [timeRemaining, snapshot, localSubmitted, playerId, hintResult]);

  // Reset guess inputs whenever the active round changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!snapshot) return;
    setGuessYear(null);
    setGuessLat(null);
    setGuessLng(null);
    setLocalSubmitted(false);
    setRoundResults(null);
    setSubmissionToasts([]);
    setHintResult({ purchasedIds: [], accPenalty: 0, xpPenalty: 0 });
    submittedHintPenaltyRef.current = { accPenalty: 0, xpPenalty: 0, purchasedIds: [] };
  }, [snapshot?.currentRoundIndex]);

  // Fetch all round results when session completes
  useEffect(() => {
    if (snapshot?.status === "SESSION_COMPLETE" && gameId && !allRoundResults) {
      fetch(`/api/compete/${gameId}/all-results`)
        .then(r => r.json())
        .then(data => setAllRoundResults(data.results ?? []))
        .catch(err => {
          console.error("[CompeteGamePage] Failed to fetch all round results:", err);
        });
    }
  }, [snapshot?.status, gameId, allRoundResults]);

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

  // Helper: compute derived stats for a player
  const computePlayerStats = useCallback((pid: string) => {
    if (!allRoundResults) return null;
    const playerResults = allRoundResults.filter(r => r.playerId === pid && r.didSubmit);
    if (playerResults.length === 0) return null;

    const totalScore = playerResults.reduce((sum, r) => sum + r.score, 0);
    const avgAccuracy = Math.round(playerResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / playerResults.length);
    const avgLocationAccuracy = Math.round(playerResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / playerResults.length);
    const avgYearAccuracy = Math.round(playerResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / playerResults.length);
    const avgConsistency = Math.round(playerResults.reduce((sum, r) => sum + Math.min(r.locationScore ?? 0, r.timeScore ?? 0), 0) / playerResults.length);
    const avgDistanceKm = playerResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0) / playerResults.length;
    const avgYearDiff = playerResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0) / playerResults.length;

    return { totalScore, avgAccuracy, avgLocationAccuracy, avgYearAccuracy, avgConsistency, avgDistanceKm, avgYearDiff };
  }, [allRoundResults]);

  // Helper: compute per-round stats for all players
  const computeRoundStats = useCallback((roundIndex: number) => {
    if (!allRoundResults) return null;
    const roundResults = allRoundResults.filter(r => r.roundIndex === roundIndex && r.didSubmit);
    if (roundResults.length === 0) return null;

    const avgAccuracy = Math.round(roundResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / roundResults.length);
    const avgLocationScore = Math.round(roundResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / roundResults.length);
    const avgTimeScore = Math.round(roundResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / roundResults.length);
    const avgDistanceKm = roundResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0) / roundResults.length;
    const avgYearDiff = roundResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0) / roundResults.length;
    const totalScore = roundResults.reduce((sum, r) => sum + r.score, 0);
    const bestPlayer = roundResults.reduce((best, r) => r.score > best.score ? r : best, roundResults[0]);

    return { avgAccuracy, avgLocationScore, avgTimeScore, avgDistanceKm, avgYearDiff, totalScore, bestPlayerId: bestPlayer.playerId };
  }, [allRoundResults]);

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
    submittedHintPenaltyRef.current = {
      accPenalty: hintResult.accPenalty,
      xpPenalty: hintResult.xpPenalty,
      purchasedIds: hintResult.purchasedIds,
    };
    setLocalSubmitted(true);
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    wsRef.current.submitGuess(
      snapshot.currentRoundIndex,
      guessYear,
      guessLat,
      guessLng,
      hintResult.purchasedIds,
      hintResult.accPenalty,
      hintResult.xpPenalty
    );
  }, [snapshot, playerId, guessYear, guessLat, guessLng, localSubmitted, hintResult]);

  const handleAdvanceRound = useCallback(() => {
    if (!snapshot || !playerId || !wsRef.current) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send READY_NEXT action signal via WS
    wsRef.current.readyNext(snapshot.currentRoundIndex);
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
    <main className="app-shell" style={{ background: snapshot?.status === "ROUND_COMPLETE" ? "#000" : undefined }}>
      <div className="shell-grid">
        {/* Toast stack - top-center (hidden during ROUND_COMPLETE) */}
        {snapshot.status !== "ROUND_COMPLETE" && (
          <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 50, pointerEvents: 'none' }}>
            {submissionToasts.map((label, i) => (
              <div key={i} style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '0.875rem', padding: '0.5rem 1rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                {label}
              </div>
            ))}
          </div>
        )}

        {/* Red flash overlay */}
        {timerClamped && (
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none', backgroundColor: 'rgba(220, 38, 38, 0.35)' }}
          />
        )}

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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName || shortId(p.playerId)} />
                      <span style={getUsernameGradientStyle(p.playerId)}>{p.displayName || shortId(p.playerId)}</span>
                    </span>
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
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentEvent.imageUrl}
                        alt={currentEvent.title}
                        style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 8, display: "block" }}
                      />
                    </div>
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
                  localPlayerAvatarUrl={viewer?.avatarUrl ?? null}
                  localPlayerDisplayName={viewer?.displayName}
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
              <button
                type="button"
                className="button secondary"
                onClick={() => setHintModalOpen(true)}
                disabled={busy || hasSubmitted || localSubmitted}
              >
                Hints
              </button>
            </div>
            {renderError}
          </section>
        ) : null}

        {snapshot.status === "ROUND_COMPLETE" ? (
          <div style={{ padding: "0 12px", paddingBottom: "72px", maxWidth: "720px", margin: "0 auto", width: "100%" }}>
            <style>{`
              @media (min-width: 768px) {
                .round-complete-grid {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 12px;
                }
                .round-complete-desktop-bottom {
                  position: static !important;
                  display: flex;
                  justify-content: flex-end;
                  padding: 16px 0;
                  background: transparent;
                  border: none;
                  height: auto;
                }
                .round-complete-event-image {
                  height: 240px !important;
                }
              }
            `}</style>
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
                  playerId: r.playerId,
                  rank: i + 1,
                  displayName: snapshot.players.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8),
                  accuracy: r.accuracy,
                  isMe: r.playerId === playerId,
                }));
              const whenRows = snapshot.players
                .map(p => {
                  const resultRow = roundResults?.find(r => r.playerId === p.playerId);
                  const theirGuessYear = resultRow?.guessYear ?? null;
                  const acc = resultRow?.timeScore ?? null;
                  const diff = theirGuessYear != null && correctYear != null
                    ? Math.abs(theirGuessYear - correctYear)
                    : null;
                  return {
                    playerId: p.playerId,
                    displayName: p.displayName || p.playerId.slice(0, 8),
                    guessYear: theirGuessYear,
                    acc,
                    diff,
                    isMe: p.playerId === playerId,
                  };
                })
                .sort((a, b) => {
                  if (a.acc == null && b.acc == null) return 0;
                  if (a.acc == null) return 1;
                  if (b.acc == null) return -1;
                  return b.acc - a.acc;
                });
              return (
                <>
                  {/* EVENT CARD */}
                  <div style={{ background: "#333", borderRadius: 12, overflow: "hidden", marginBottom: "10px", minHeight: "50vh" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", textAlign: "center", padding: "14px 16px 10px" }}>
                      {round.title}
                    </div>
                    {round.imageUrl ? (
                      <img
                        src={round.imageUrl}
                        alt={round.title}
                        style={{ width: "100%", height: "180px", objectFit: "cover", display: "block" }}
                        className="round-complete-event-image"
                      />
                    ) : (
                      <div style={{ width: "100%", height: "180px", background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 12 }}>
                        No image available
                      </div>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#f97316", textAlign: "center", padding: "8px 16px" }}>
                      {correctYear} · {correctName}
                    </div>
                    <div style={{ padding: "0 16px 16px" }}>
                      <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.5, display: descriptionExpanded ? "block" : "-webkit-box", WebkitLineClamp: descriptionExpanded ? "unset" : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {round.description ?? "No description available"}
                      </div>
                      {!descriptionExpanded && (round.description?.length ?? 0) > 0 && (
                        <button
                          onClick={() => setDescriptionExpanded(true)}
                          style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 0, marginTop: 4 }}
                        >
                          more
                        </button>
                      )}
                      {(round as unknown as { sourceUrl?: string }).sourceUrl && (
                        <button
                          onClick={() => window.open((round as unknown as { sourceUrl?: string }).sourceUrl, "_blank")}
                          style={{ background: "transparent", border: "1px solid #6b7280", color: "#6b7280", fontSize: 11, borderRadius: 6, padding: "4px 10px", cursor: "pointer", marginTop: 8 }}
                        >
                          Source
                        </button>
                      )}
                    </div>
                  </div>
                  {/* ACCURACY RING CARD */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <RainbowRing value={accuracy} />
                        <span style={{
                          position: "absolute",
                          right: "-28px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 26,
                          fontWeight: 700,
                          color: "#fff",
                          lineHeight: 1,
                        }}>%</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "center", marginTop: 12 }}>
                      <span style={{ fontSize: 13, color: "#9ca3af" }}>{myResult?.score ?? 0} XP</span>
                    </div>
                    {submittedHintPenaltyRef.current.xpPenalty > 0 && (
                      <div style={{ textAlign: "center", marginTop: 4 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          background: "#7f1d1d",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 10,
                          color: "#fca5a5",
                          fontWeight: 600,
                        }}>
                          −{submittedHintPenaltyRef.current.xpPenalty} XP hints
                        </span>
                      </div>
                    )}
                  </div>
                  {/* BADGES CARD */}
                  {(() => {
                    const badges = myResult?.badges ?? [];
                    const nearMisses = myResult?.nearMisses ?? [];
                    if (badges.length === 0 && nearMisses.length === 0) return null;

                    const tierColor: Record<string, string> = {
                      gold: '#FFD700',
                      silver: '#C0C0C0',
                      bronze: '#CD7F32',
                    };
                    const tierBg: Record<string, string> = {
                      gold: 'rgba(255,215,0,0.12)',
                      silver: 'rgba(192,192,192,0.12)',
                      bronze: 'rgba(205,127,50,0.12)',
                    };
                    const dimLabel: Record<string, string> = {
                      location: 'WHERE',
                      year: 'WHEN',
                      combo: 'COMBO',
                    };
                    const dimIcon: Record<string, string> = {
                      location: '📍',
                      year: '📅',
                      combo: '⚡',
                    };

                    return (
                      <div style={{
                        background: '#333', borderRadius: 12, padding: 16,
                        marginBottom: '10px',
                      }}>
                        <div style={{
                          fontSize: 10, color: '#999', textTransform: 'uppercase',
                          letterSpacing: '1.5px', textAlign: 'center', marginBottom: 10,
                        }}>
                          Badges
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {badges.map((badge, i) => (
                            <div key={i} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              gap: 3, background: tierBg[badge.tier],
                              border: `1px solid ${tierColor[badge.tier]}44`,
                              borderRadius: 10, padding: '8px 12px', minWidth: 64,
                            }}>
                              <span style={{ fontSize: 18 }}>{dimIcon[badge.dimension]}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: tierColor[badge.tier],
                                textTransform: 'uppercase', letterSpacing: '1px',
                              }}>
                                {badge.tier}
                              </span>
                              <span style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' }}>
                                {dimLabel[badge.dimension]}
                              </span>
                              <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>
                                {badge.accuracy}%
                              </span>
                            </div>
                          ))}
                          {nearMisses.map((nm, i) => (
                            <div key={`nm-${i}`} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              gap: 3, background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: 10, padding: '8px 12px', minWidth: 64,
                              opacity: 0.7,
                            }}>
                              <span style={{ fontSize: 18 }}>{dimIcon[nm.dimension]}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: '#888',
                                textTransform: 'uppercase', letterSpacing: '1px',
                              }}>
                                CLOSE
                              </span>
                              <span style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' }}>
                                {dimLabel[nm.dimension]}
                              </span>
                              <span style={{ fontSize: 11, color: '#aaa', fontWeight: 600 }}>
                                {nm.accuracy}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* ROUND LEADERBOARD CARD */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Round leaderboard</div>
                    {leaderboardRows.map(row => {
                      const hue = Math.round((Math.max(0, Math.min(100, row.accuracy)) / 100) * 120);
                      const accColor = `hsl(${hue}, 100%, 50%)`;
                      const accBg = row.accuracy >= 60 ? "#1a2e1a" : row.accuracy >= 30 ? "#2e2a1a" : "#2e1a1a";
                      const avatarUrl = snapshot.players.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
                      return (
                        <div key={row.rank} style={{
                          display: "flex", alignItems: "center", padding: "7px 8px",
                          borderRadius: 8, marginBottom: 3, gap: 6,
                          background: row.isMe ? "#2e2e2e" : "transparent",
                        }}>
                          <span style={{ fontSize: 11, color: "#777", minWidth: 14 }}>{row.rank}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                              <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} />
                              <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                                {row.displayName}
                              </span>
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
                      snapshot.players.map((p) => {
                        const isMe = p.playerId === playerId;
                        return (
                          <div key={p.playerId} style={{
                            display: "flex", alignItems: "center", padding: "7px 8px",
                            borderRadius: 8, marginBottom: 3, gap: 6,
                            background: isMe ? "#2e2e2e" : "transparent",
                          }}>
                            <span style={{ fontSize: 11, color: "#777", minWidth: 14 }}>—</span>
                            <span style={{ flex: 1, fontSize: 13 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                                <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName || p.playerId.slice(0, 8)} />
                                <span style={{ ...getUsernameGradientStyle(p.playerId), fontWeight: isMe ? 700 : 500 }}>
                                  {p.displayName || p.playerId.slice(0, 8)}
                                </span>
                              </span>
                              {isMe && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                              <span style={{ color: "#555", fontSize: 11, fontStyle: "italic", marginLeft: 4 }}>No guess</span>
                            </span>
                            <span style={{ background: "#2a2a2a", color: "#888", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
                              —
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="round-complete-grid">
                  {/* WHERE CARD */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb" }}>Where</span>
                      </div>
                      {myResult != null && (() => {
                        const locScore = Math.round(myResult.locationScore);
                        const locHue = Math.round((Math.max(0, Math.min(100, locScore)) / 100) * 120);
                        const locColor = `hsl(${locHue}, 100%, 50%)`;
                        return (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                            <span style={{ fontSize: 22, fontWeight: 700, color: locColor }}>{locScore}</span>
                            <span style={{ fontSize: 11, color: locColor }}>%</span>
                          </div>
                        );
                      })()}
                    </div>
                    {submittedHintPenaltyRef.current.accPenalty > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          fontSize: 10, color: "#fca5a5", fontWeight: 600,
                          background: "#7f1d1d",
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}>
                          −{Math.round(submittedHintPenaltyRef.current.accPenalty / 2)}% hints
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: "#fff", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                      <span>Correct:</span>
                      <span style={{ color: "#f97316" }}>{correctName}</span>
                    </div>
                    {myDistanceKm != null && (
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: "#fff" }}>{Math.round(myDistanceKm)} km away</span>
                      </div>
                    )}
                    {guessLat != null && guessLng != null ? (
                      <>
                        <div style={{ borderRadius: 8, overflow: "hidden", height: 200 }}>
                          <StaticResultMap
                            key={`result-map-${snapshot.currentRoundIndex}`}
                            correctLat={correctLat}
                            correctLng={correctLng}
                            guessLat={guessLat}
                            guessLng={guessLng}
                            playerGuesses={roundResults
                              ?.filter(r => r.didSubmit && r.guessLat != null && r.guessLng != null)
                              .map(r => {
                                const player = snapshot.players.find(p => p.playerId === r.playerId);
                                return {
                                  playerId: r.playerId,
                                  lat: r.guessLat!,
                                  lng: r.guessLng!,
                                  label: player?.displayName ?? r.playerId.slice(0, 8),
                                  color: r.playerId === playerId ? "#f97316" : undefined,
                                  avatarUrl: player?.avatarUrl ?? null,
                                };
                              }) ?? undefined}
                          />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          {(roundResults ?? [])
                            .slice()
                            .sort((a, b) => a.rank - b.rank)
                            .map((r, idx) => {
                              const distanceKm = r.guessLat != null && r.guessLng != null
                                ? haversineKm(r.guessLat, r.guessLng, correctLat, correctLng)
                                : null;
                              const locationAcc = r.locationScore;
                              const locHue = locationAcc != null ? Math.round((locationAcc / 100) * 120) : null;
                              const locAccColor = locHue != null ? `hsl(${locHue}, 100%, 50%)` : "#888";
                              const locAccBg = locationAcc != null
                                ? locationAcc >= 60 ? "#1a2e1a" : locationAcc >= 30 ? "#2e2a1a" : "#2e1a1a"
                                : "#2a2a2a";
                              return (
                                <div key={r.playerId} style={{
                                  display: "flex", alignItems: "center", padding: "7px 8px", gap: 6,
                                  borderRadius: 6,
                                  background: r.playerId === playerId ? "rgba(255,255,255,0.06)" : "transparent",
                                  borderBottom: idx < (roundResults?.length ?? 0) - 1 ? "1px solid #333" : "none",
                                }}>
                                  <span style={{ minWidth: 20, color: "#888", fontSize: 13, fontWeight: 600 }}>
                                    {r.rank ?? "—"}
                                  </span>
                                  <span style={{ flex: 1, fontSize: 13 }}>
                                    <span style={{ ...getUsernameGradientStyle(r.playerId), fontWeight: r.playerId === playerId ? 600 : 400 }}>
                                      {snapshot.players.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8)}
                                    </span>
                                    {r.playerId === playerId && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                                  </span>
                                  <span style={{ color: "#bbb", fontSize: 11, fontWeight: 600 }}>
                                    {distanceKm != null ? `${Math.round(distanceKm)} km away` : "—"}
                                  </span>
                                  {locationAcc != null && (
                                    <span style={{ background: locAccBg, color: locAccColor, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                                      {locationAcc}%
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </>
                    ) : (
                      <p style={{ color: "#888", fontSize: 13, margin: 0 }}>No location submitted</p>
                    )}
                  </div>
                  {/* WHEN CARD */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb" }}>When</span>
                      </div>
                      {(() => {
                        const myWhenRow = whenRows.find(r => r.isMe);
                        const myWhenAcc = myWhenRow?.acc ?? null;
                        return myWhenAcc != null ? (() => {
                          const whenScore = Math.round(myWhenAcc);
                          const whenHue = Math.round((Math.max(0, Math.min(100, whenScore)) / 100) * 120);
                          const whenColor = `hsl(${whenHue}, 100%, 50%)`;
                          return (
                            <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                              <span style={{ fontSize: 22, fontWeight: 700, color: whenColor }}>{whenScore}</span>
                              <span style={{ fontSize: 11, color: whenColor }}>%</span>
                            </div>
                          );
                        })() : null;
                      })()}
                    </div>
                    {submittedHintPenaltyRef.current.accPenalty > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          fontSize: 10, color: "#fca5a5", fontWeight: 600,
                          background: "#7f1d1d",
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}>
                          −{Math.round(submittedHintPenaltyRef.current.accPenalty / 2)}% hints
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: "#fff", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                      <span>Correct:</span>
                      <span style={{ color: "#f97316" }}>{correctYear}</span>
                    </div>
                    {/* Year timeline */}
                    <div style={{ width: "100%", height: 96, position: "relative", margin: "12px 0", background: "#1a1a2a", borderRadius: 8, padding: "0 16px", boxSizing: "border-box" }}>
                      {/* Horizontal gradient bar */}
                      <div style={{
                        position: "absolute",
                        top: "50%",
                        height: 4,
                        left: 16,
                        right: 16,
                        background: "#555555",
                        borderRadius: 3,
                        transform: "translateY(-50%)",
                      }} />
                      {/* Correct year marker */}
                      <div style={{
                        position: "absolute",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 4,
                        height: 32,
                        background: "#f97316",
                        borderRadius: 2,
                        left: "50%",
                      }}>
                        <div style={{
                          position: "absolute",
                          top: -20,
                          left: "50%",
                          transform: "translateX(-50%)",
                          fontSize: 9,
                          color: "#888",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                        }}>
                          Correct
                        </div>
                        <div style={{
                          position: "absolute",
                          top: 32,
                          left: "50%",
                          transform: "translateX(-50%)",
                          fontSize: 10,
                          color: "#f97316",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                        }}>
                          {correctYear}
                        </div>
                      </div>
                      {/* Player guess markers */}
                      {(() => {
                        const timelineMin = Math.max(0, correctYear - 150);
                        const timelineMax = correctYear + 150;
                        const timelineRange = timelineMax - timelineMin;
                        const yearCounts = new Map<number, number>();
                        whenRows.forEach(row => {
                          if (row.guessYear != null) {
                            yearCounts.set(row.guessYear, (yearCounts.get(row.guessYear) || 0) + 1);
                          }
                        });
                        return whenRows.map((row) => {
                          if (row.guessYear == null) return null;
                          const position = ((row.guessYear - timelineMin) / timelineRange) * 100;
                          const clampedPosition = Math.max(0, Math.min(100, position));
                          const sameYearPlayers = whenRows.filter(r => r.guessYear === row.guessYear);
                          const myIndexInGroup = sameYearPlayers.findIndex(r => r.playerId === row.playerId);
                          const verticalOffset = myIndexInGroup * 18;
                          return (
                            <div key={row.playerId} style={{
                              position: "absolute",
                              top: "50%",
                              transform: `translate(-50%, calc(-50% + ${verticalOffset}px))`,
                              left: `${clampedPosition}%`,
                            }}>
                              <div style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                background: row.isMe ? "#f97316" : "#60a5fa",
                                border: "2px solid #fff",
                              }} />
                              <div style={{
                                position: "absolute",
                                top: 18,
                                left: "50%",
                                transform: "translateX(-50%)",
                                fontSize: 10,
                                color: row.isMe ? "#f97316" : "#60a5fa",
                                whiteSpace: "nowrap",
                                textAlign: "center",
                              }}>
                                {row.guessYear}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    {whenRows.map((row, idx) => {
                      const hue = row.acc != null ? Math.round((row.acc / 100) * 120) : null;
                      const accColor = hue != null ? `hsl(${hue}, 100%, 50%)` : "#888";
                      const accBg = row.acc != null
                        ? row.acc >= 60 ? "#1a2e1a" : row.acc >= 30 ? "#2e2a1a" : "#2e1a1a"
                        : "#2a2a2a";
                      const resultRow = roundResults?.find(r => r.playerId === row.playerId);
                      const rank = resultRow?.rank ?? null;
                      const avatarUrl = snapshot.players.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
                      return (
                        <div key={row.playerId} style={{
                          display: "flex", alignItems: "center", padding: "7px 8px", gap: 6,
                          borderRadius: 6,
                          background: row.isMe ? "rgba(255,255,255,0.06)" : "transparent",
                          borderBottom: idx < whenRows.length - 1 ? "1px solid #333" : "none",
                        }}>
                          <span style={{ minWidth: 20, color: "#888", fontSize: 13, fontWeight: 600 }}>
                            {rank ?? "—"}
                          </span>
                          <span style={{ flex: 1, fontSize: 13 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                              <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} />
                              <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                                {row.displayName}
                              </span>
                            </span>
                            {row.isMe && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                          </span>
                          <span style={{ color: "#bbb", fontSize: 11, fontWeight: 600 }}>
                            {row.diff != null ? `${row.diff} yrs off` : "—"}
                          </span>
                          <span style={{ background: accBg, color: accColor, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                            {row.acc != null ? `${row.acc}%` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                  {/* HINTS USED CARD */}
                  {submittedHintPenaltyRef.current.purchasedIds.length > 0 && (() => {
                    const usedHints = (snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? [])
                      .filter(h => submittedHintPenaltyRef.current.purchasedIds.includes(h.id))
                      .sort((a, b) => a.tier - b.tier);
                    if (usedHints.length === 0) return null;
                    return (
                      <div style={{
                        background: "#333", borderRadius: 12, padding: 16,
                        marginBottom: "10px",
                      }}>
                        <div style={{
                          fontSize: 12, fontWeight: 600, color: "#aaa",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                          marginBottom: 10,
                        }}>
                          Hints used
                        </div>
                        {usedHints.map((hint, idx) => {
                          const tierPenaltyAcc = [0,10,20,30,40,50][hint.tier] ?? 0;
                          const meta = hint.metadata as { km?: number; years?: number | string } | null;
                          let revealedText = hint.content;
                          if (hint.type === "where" && (hint.tier === 2 || hint.tier === 4) && meta?.km != null) {
                            revealedText = `${hint.content} — ${meta.km} km away`;
                          } else if (hint.type === "when" && (hint.tier === 2 || hint.tier === 4) && meta?.years != null) {
                            revealedText = `${hint.content} — ${meta.years} years off`;
                          }
                          const labelMap: Record<string, Record<number, string>> = {
                            when: { 1: "Century", 2: "Historical Event", 3: "Decade", 4: "Contemporary Event", 5: "Visual Clues" },
                            where: { 1: "Continent", 2: "Remote Landmark", 3: "Region", 4: "Nearby Landmark", 5: "Visual Clues" },
                          };
                          const label = labelMap[hint.type]?.[hint.tier] ?? "Hint";
                          return (
                            <div key={hint.id} style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "7px 0",
                              borderBottom: idx < usedHints.length - 1 ? "1px solid #3a3a3a" : "none",
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "#ccc" }}>{label}</div>
                                <div style={{ fontSize: 11, color: "#aaa", fontStyle: "italic", marginTop: 1 }}>
                                  {revealedText}
                                </div>
                              </div>
                              <span style={{
                                display: "inline-flex", alignItems: "center",
                                background: "rgba(232,68,34,0.12)",
                                border: "0.5px solid rgba(232,68,34,0.35)",
                                borderRadius: 999,
                                padding: "2px 7px",
                                fontSize: 10,
                                color: "#e84422",
                                fontWeight: 600,
                                flexShrink: 0,
                              }}>
                                −{tierPenaltyAcc}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {/* FIXED BOTTOM BAR */}
                  <div className="round-complete-desktop-bottom" style={{
                    position: "fixed",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "#111111",
                    borderTop: "1px solid #222222",
                    height: "56px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 16px",
                    paddingBottom: "env(safe-area-inset-bottom, 0px)",
                    zIndex: 1000,
                  }}>
                    <button
                      onClick={() => router.push("/")}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 8,
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
                        <polyline points="9 21 9 12 15 12 15 21" />
                      </svg>
                    </button>
                    <div style={{ fontSize: 13, color: "#9ca3af" }}>
                      Round {snapshot.currentRoundIndex + 1} / {snapshot.rounds.length}
                    </div>
                    {resultSecsLeft !== null && (
                      <p className="text-sm text-gray-400 text-center mb-2">
                        Auto-advancing in {resultSecsLeft}s
                      </p>
                    )}
                    <button
                      onClick={handleAdvanceRound}
                      disabled={snapshot.readyForNext?.includes(playerId ?? "")}
                      style={{
                        background: "#f97316",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 14,
                        border: "none",
                        borderRadius: 8,
                        padding: "10px 18px",
                        cursor: snapshot.readyForNext?.includes(playerId ?? "") ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                        opacity: snapshot.readyForNext?.includes(playerId ?? "") ? 0.5 : 1,
                      }}
                    >
                      Next Round →
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}

        {snapshot.status === "SESSION_COMPLETE" ? (
          <section className="gh-final-section">
            <style>{`
              .gh-final-section {
                min-height: 100vh;
                width: 100%;
                overflow-x: hidden;
                background: #000000;
                padding: 0 0 96px;
                color: #ffffff;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              }
              .gh-final-section * {
                box-sizing: border-box;
              }
              .gh-final-topbar {
                width: 100%;
                min-height: 48px;
                background: rgba(17, 24, 39, 0.72);
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 14px;
              }
              .gh-final-title {
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .gh-final-profile {
                position: relative;
              }
              .gh-final-profile summary {
                list-style: none;
              }
              .gh-final-profile summary::-webkit-details-marker {
                display: none;
              }
              .gh-final-avatar-button {
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 999px;
                background: #333333;
                color: #ffffff;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                cursor: pointer;
                font-size: 13px;
                font-weight: 700;
              }
              .gh-final-profile-menu {
                position: absolute;
                top: 40px;
                right: 0;
                z-index: 20;
                min-width: 112px;
                border-radius: 10px;
                background: #333333;
                padding: 6px;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
              }
              .gh-final-profile-menu button {
                width: 100%;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: #ffffff;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                padding: 8px 10px;
                text-align: left;
              }
              .gh-final-wrap {
                width: 100%;
                max-width: 680px;
                margin: 0 auto;
                padding: 14px 12px 0;
              }
              .gh-final-score-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 12px;
                margin-bottom: 12px;
              }
              .gh-final-score-hero {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px 12px 18px;
              }
              .gh-final-ring-row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              }
              .gh-final-ring-box {
                position: relative;
                width: 154px;
                height: 154px;
                flex: 0 0 auto;
              }
              .gh-final-ring-box svg {
                width: 154px;
                height: 154px;
                display: block;
              }
              .gh-final-ring-number {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                font-size: 48px;
                font-weight: 700;
                line-height: 1;
              }
              .gh-final-ring-percent {
                color: #ffffff;
                font-size: 24px;
                font-weight: 700;
                line-height: 1;
                transform: translateY(10px);
              }
              .gh-final-xp {
                margin-top: 8px;
                color: #9ca3af;
                font-size: 13px;
                font-weight: 400;
              }
              .gh-final-card {
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-stat-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
              }
              .gh-final-stat-card {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 15px 10px;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-stat-icon {
                width: 16px;
                height: 16px;
                color: #9ca3af;
                margin-bottom: 8px;
              }
              .gh-final-percent-line {
                display: inline-flex;
                align-items: baseline;
                justify-content: center;
                color: #ffffff;
                font-weight: 700;
                line-height: 1;
              }
              .gh-final-stat-number {
                font-size: 24px;
              }
              .gh-final-stat-symbol {
                font-size: 12px;
                margin-left: 1px;
              }
              .gh-final-stat-sub {
                margin-top: 7px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                text-align: center;
              }
              .gh-final-panel {
                overflow: hidden;
                margin-bottom: 12px;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-panel-heading {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                padding: 13px 14px 10px;
              }
              .gh-final-rank-row {
                display: grid;
                grid-template-columns: 22px 30px minmax(0, 1fr) auto;
                align-items: center;
                gap: 9px;
                padding: 11px 12px;
                border-left: 3px solid transparent;
              }
              .gh-final-rank-row + .gh-final-rank-row {
                border-top: 1px solid #374151;
              }
              .gh-final-rank-number {
                color: #9ca3af;
                font-size: 13px;
                font-weight: 400;
              }
              .gh-final-rank-avatar {
                width: 30px;
                height: 30px;
                border-radius: 999px;
                background: #1a1a1a;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                font-size: 12px;
                font-weight: 700;
              }
              .gh-final-rank-main {
                min-width: 0;
              }
              .gh-final-rank-name-line {
                min-width: 0;
                display: flex;
                align-items: center;
                gap: 5px;
              }
              .gh-final-rank-name {
                min-width: 0;
                color: #ffffff;
                font-size: 13px;
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .gh-final-you-tag {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 400;
                flex: 0 0 auto;
              }
              .gh-final-progress-track {
                width: 100%;
                height: 4px;
                background: #1a1a1a;
                border-radius: 999px;
                margin-top: 6px;
                overflow: hidden;
              }
              .gh-final-progress-fill {
                height: 100%;
                border-radius: 999px;
                background: #9ca3af;
              }
              .gh-final-rank-score {
                text-align: right;
                white-space: nowrap;
              }
              .gh-final-rank-percent {
                color: #ffffff;
                font-size: 15px;
                font-weight: 700;
                line-height: 1;
              }
              .gh-final-rank-xp {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 400;
                margin-top: 4px;
              }
              .gh-final-rounds {
                display: grid;
                grid-template-columns: 1fr;
                gap: 10px;
              }
              .gh-final-round-card {
                overflow: hidden;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-photo {
                position: relative;
                width: 100%;
                height: 112px;
                overflow: hidden;
                background: #1a1a1a;
              }
              .gh-final-photo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                cursor: pointer;
              }
              .gh-final-round-badge {
                position: absolute;
                top: 9px;
                left: 9px;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.72);
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                padding: 5px 8px;
              }
              .gh-final-photo-fallback {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 12px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                text-align: center;
              }
              .gh-final-round-body {
                padding: 11px 12px 12px;
              }
              .gh-final-round-title {
                color: #ffffff;
                font-size: 14px;
                font-weight: 600;
                line-height: 1.35;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                margin-bottom: 10px;
              }
              .gh-final-mini-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 6px;
              }
              .gh-final-mini-tile {
                min-width: 0;
                background: #1a1a1a;
                border-radius: 8px;
                padding: 9px 4px 8px;
                text-align: center;
              }
              .gh-final-mini-number {
                font-size: 20px;
              }
              .gh-final-mini-symbol {
                font-size: 11px;
                margin-left: 1px;
              }
              .gh-final-mini-label {
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.04em;
                line-height: 1;
                margin-top: 6px;
                text-transform: uppercase;
              }
              .gh-final-mini-sub {
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                line-height: 1.15;
                margin-top: 5px;
              }
              .gh-final-best-row {
                border-top: 1px solid #374151;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-top: 10px;
                padding-top: 10px;
              }
              .gh-final-best-label {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.05em;
                text-transform: uppercase;
              }
              .gh-final-best-name {
                min-width: 0;
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                overflow: hidden;
                text-align: right;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .gh-final-cta {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 30;
                display: flex;
                gap: 10px;
                width: 100%;
                background: #000000;
                padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
              }
              .gh-final-cta button {
                height: 46px;
                border-radius: 12px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
              }
              .gh-final-home {
                flex: 1;
                background: #1a1a1a;
                border: 1px solid #374151;
                color: #9ca3af;
              }
              .gh-final-play {
                flex: 1.25;
                background: #f97316;
                border: 1px solid #f97316;
                color: #ffffff;
              }
              @keyframes ghFinalRing {
                from {
                  stroke-dashoffset: 339.292;
                }
                to {
                  stroke-dashoffset: var(--gh-final-ring-offset);
                }
              }
              @media (min-width: 768px) {
                .gh-final-section {
                  padding-bottom: 48px;
                }
                .gh-final-topbar {
                  padding-left: 24px;
                  padding-right: 24px;
                }
                .gh-final-wrap {
                  padding-top: 22px;
                }
                .gh-final-score-grid {
                  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                  align-items: stretch;
                }
                .gh-final-score-hero {
                  min-height: 230px;
                }
                .gh-final-stat-grid {
                  height: 100%;
                  align-content: stretch;
                }
                .gh-final-stat-card {
                  min-height: 109px;
                }
                .gh-final-cta {
                  position: static;
                  max-width: 680px;
                  margin: 18px auto 0;
                  padding: 0 12px;
                }
              }
            `}</style>
            {/* Loading state */}
            {!allRoundResults ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Loading results…
              </div>
            ) : (() => {
              if (!playerId) return null;
              const myStats = computePlayerStats(playerId);
              const overallAccuracy = myStats?.avgAccuracy ?? 0;
              const overallXP = myStats?.totalScore ?? 0;
              const whereAccuracy = myStats?.avgLocationAccuracy ?? 0;
              const whenAccuracy = myStats?.avgYearAccuracy ?? 0;
              const avgDistanceKm = myStats?.avgDistanceKm ?? 0;
              const avgYearDiff = myStats?.avgYearDiff ?? 0;
              const currentPlayerData = snapshot.players.find(p => p.playerId === playerId);
              const currentDisplayName = playerLabel(snapshot.players, playerId);
              const currentInitial = currentDisplayName ? currentDisplayName.charAt(0).toUpperCase() : "?";
              const ringRadius = 54;
              const ringCircumference = 2 * Math.PI * ringRadius;
              const ringOffset = ringCircumference * (1 - Math.max(0, Math.min(100, overallAccuracy)) / 100);

              const roundWinners = new Map<number, string[]>();
              for (let i = 0; i < snapshot.config.totalRounds; i++) {
                const roundResults = allRoundResults.filter(r => r.roundIndex === i);
                const maxScore = Math.max(...roundResults.map(r => r.score));
                if (maxScore > 0) {
                  const winners = roundResults.filter(r => r.score === maxScore).map(r => r.playerId);
                  roundWinners.set(i, winners);
                }
              }
              const leaderboard = snapshot.players
                .map(p => {
                  const stats = computePlayerStats(p.playerId);
                  const wonRounds: number[] = [];
                  for (let i = 0; i < snapshot.config.totalRounds; i++) {
                    const winners = roundWinners.get(i);
                    if (winners?.includes(p.playerId)) {
                      wonRounds.push(i);
                    }
                  }
                  return {
                    playerId: p.playerId,
                    displayName: p.displayName,
                    totalScore: stats?.totalScore ?? 0,
                    avgAccuracy: stats?.avgAccuracy ?? 0,
                    wonRounds,
                  };
                })
                .sort((a, b) => b.totalScore - a.totalScore);

              return (
                <>
                  <div className="gh-final-topbar">
                    <div className="gh-final-title">Guess History</div>
                    <details className="gh-final-profile">
                      <summary aria-label="Open profile menu">
                        <span className="gh-final-avatar-button">
                          {currentPlayerData?.avatarUrl ? (
                            <img
                              src={currentPlayerData.avatarUrl}
                              alt={currentDisplayName}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : currentInitial}
                        </span>
                      </summary>
                      <div className="gh-final-profile-menu">
                        <button type="button">Sign Out</button>
                      </div>
                    </details>
                  </div>

                  <div className="gh-final-wrap">
                    {/* HERO ACCURACY CARD */}
                    <div className="gh-final-score-grid">
                      <div className="gh-final-score-hero gh-final-card">
                        <div className="gh-final-ring-row">
                          <div className="gh-final-ring-box">
                            <svg viewBox="0 0 154 154" aria-hidden="true">
                              <circle cx={77} cy={77} r={ringRadius} fill="none" stroke="#1a1a1a" strokeWidth={10} />
                              <circle
                                cx={77}
                                cy={77}
                                r={ringRadius}
                                fill="none"
                                stroke="#f97316"
                                strokeWidth={10}
                                strokeLinecap="round"
                                strokeDasharray={ringCircumference}
                                strokeDashoffset={ringCircumference}
                                transform="rotate(-90 77 77)"
                                style={{
                                  "--gh-final-ring-offset": `${ringOffset}`,
                                  animation: "ghFinalRing 900ms ease-out forwards",
                                } as React.CSSProperties}
                              />
                            </svg>
                            <div className="gh-final-ring-number">{overallAccuracy}</div>
                          </div>
                          <span className="gh-final-ring-percent">%</span>
                        </div>
                        <div className="gh-final-xp">{overallXP} XP</div>
                      </div>

                      {/* WHERE / WHEN SUB-CARDS */}
                      <div className="gh-final-stat-grid">
                        {/* WHERE card */}
                        <div className="gh-final-stat-card">
                          <svg className="gh-final-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
                            <circle cx={12} cy={10} r={2.5} />
                          </svg>
                          <div className="gh-final-percent-line">
                            <span className="gh-final-stat-number">{whereAccuracy}</span>
                            <span className="gh-final-stat-symbol">%</span>
                          </div>
                          <div className="gh-final-stat-sub">avg {Math.round(avgDistanceKm)} km away</div>
                        </div>
                        {/* WHEN card */}
                        <div className="gh-final-stat-card">
                          <svg className="gh-final-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x={4} y={5} width={16} height={15} rx={2} />
                            <path d="M8 3v4M16 3v4M4 10h16" />
                          </svg>
                          <div className="gh-final-percent-line">
                            <span className="gh-final-stat-number">{whenAccuracy}</span>
                            <span className="gh-final-stat-symbol">%</span>
                          </div>
                          <div className="gh-final-stat-sub">avg {Math.round(avgYearDiff)} yrs off</div>
                        </div>
                      </div>
                    </div>

                    {/* LEADERBOARD SECTION */}
                    <div className="gh-final-panel">
                      <div className="gh-final-panel-heading">Final Rankings</div>
                      {leaderboard.map((player, index) => {
                        const isCurrentPlayer = player.playerId === playerId;
                        const playerData = snapshot.players.find(p => p.playerId === player.playerId);
                        const displayName = playerLabel(snapshot.players, player.playerId);
                        const firstLetter = displayName ? displayName.charAt(0).toUpperCase() : "?";
                        return (
                          <div
                            key={player.playerId}
                            className="gh-final-rank-row"
                            style={{
                              borderLeftColor: index === 0 ? "#f59e0b" : "transparent",
                            }}
                          >
                            <div className="gh-final-rank-number">{index + 1}</div>
                            <div className="gh-final-rank-avatar">
                              {playerData?.avatarUrl ? (
                                <img
                                  src={playerData.avatarUrl}
                                  alt={displayName}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : firstLetter}
                            </div>
                            <div className="gh-final-rank-main">
                              <div className="gh-final-rank-name-line">
                                <span
                                  className="gh-final-rank-name"
                                  style={{ color: isCurrentPlayer ? "#f97316" : "#ffffff" }}
                                >
                                  {displayName}
                                </span>
                                {isCurrentPlayer ? <span className="gh-final-you-tag">(you)</span> : null}
                              </div>
                              <div className="gh-final-progress-track">
                                <div
                                  className="gh-final-progress-fill"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, player.avgAccuracy))}%`,
                                    background: "#9ca3af",
                                  }}
                                />
                              </div>
                            </div>
                            <div className="gh-final-rank-score">
                              <div className="gh-final-rank-percent">{player.avgAccuracy}%</div>
                              <div className="gh-final-rank-xp">{player.totalScore} XP</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ROUND BREAKDOWN LABEL */}
                    <div className="gh-final-panel-heading" style={{ paddingLeft: 2 }}>Round Breakdown</div>
                    {/* ROUND CARDS */}
                    <div className="gh-final-rounds">
                      {snapshot.rounds.map((round, i) => {
                        const roundStats = computeRoundStats(i);
                        if (!roundStats) return null;
                        const bestPlayerName = playerLabel(snapshot.players, roundStats.bestPlayerId);
                        const isCurrentBestPlayer = roundStats.bestPlayerId === playerId;
                        return (
                          <div key={i} className="gh-final-round-card">
                            {/* Photo strip */}
                            <div className="gh-final-photo">
                              {round.imageUrl ? (
                                <img
                                  src={round.imageUrl}
                                  alt={round.title}
                                  onClick={() => setFullscreenImg(round.imageUrl)}
                                />
                              ) : (
                                <div className="gh-final-photo-fallback">
                                  {round.locationName || `${round.latitude.toFixed(2)}, ${round.longitude.toFixed(2)}`} · {round.year}
                                </div>
                              )}
                              <div className="gh-final-round-badge">ROUND {i + 1}</div>
                            </div>

                            {/* Card body */}
                            <div className="gh-final-round-body">
                              <div className="gh-final-round-title">{round.title}</div>

                              {/* 3-column score row */}
                              <div className="gh-final-mini-grid">
                                {/* TOTAL cell */}
                                <div className="gh-final-mini-tile">
                                  <div className="gh-final-percent-line">
                                    <span className="gh-final-mini-number">{roundStats.avgAccuracy}</span>
                                    <span className="gh-final-mini-symbol">%</span>
                                  </div>
                                  <div className="gh-final-mini-label">Total</div>
                                  <div className="gh-final-mini-sub">{roundStats.totalScore} pts</div>
                                </div>

                                <div className="gh-final-mini-tile">
                                  <div className="gh-final-percent-line">
                                    <span className="gh-final-mini-number">{roundStats.avgLocationScore}</span>
                                    <span className="gh-final-mini-symbol">%</span>
                                  </div>
                                  <div className="gh-final-mini-label">Where</div>
                                  <div className="gh-final-mini-sub">avg {Math.round(roundStats.avgDistanceKm)} km</div>
                                </div>

                                <div className="gh-final-mini-tile">
                                  <div className="gh-final-percent-line">
                                    <span className="gh-final-mini-number">{roundStats.avgTimeScore}</span>
                                    <span className="gh-final-mini-symbol">%</span>
                                  </div>
                                  <div className="gh-final-mini-label">When</div>
                                  <div className="gh-final-mini-sub">avg {Math.round(roundStats.avgYearDiff)} yrs</div>
                                </div>
                              </div>

                              {/* Round footer */}
                              <div className="gh-final-best-row">
                                <div className="gh-final-best-label">
                                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M8 21h8" />
                                    <path d="M12 17v4" />
                                    <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
                                    <path d="M5 6H3a3 3 0 0 0 3 3h1" />
                                    <path d="M19 6h2a3 3 0 0 1-3 3h-1" />
                                  </svg>
                                  Best Player
                                </div>
                                <div
                                  className="gh-final-best-name"
                                  style={{ color: isCurrentBestPlayer ? "#f97316" : "#9ca3af" }}
                                >
                                  {bestPlayerName}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* BOTTOM ACTION BAR */}
                    <div className="gh-final-cta">
                      <button
                        type="button"
                        className="gh-final-home"
                        onClick={() => router.push("/")}
                      >
                        Home
                      </button>
                      <button
                        type="button"
                        className="gh-final-play"
                        onClick={() => router.push("/compete")}
                      >
                        Play Again
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        ) : null}
      </div>

      {/* HintModal */}
      <HintModal
        hints={snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? []}
        isOpen={hintModalOpen}
        onClose={(result: HintPurchaseResult) => {
          setHintResult(result);
          setHintModalOpen(false);
        }}
      />
      {/* Fullscreen image overlay */}
      {fullscreenImg && (
        <div
          onClick={() => setFullscreenImg(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <img
            src={fullscreenImg}
            alt="Fullscreen"
            style={{ maxWidth: "100vw", maxHeight: "100vh", objectFit: "contain" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
