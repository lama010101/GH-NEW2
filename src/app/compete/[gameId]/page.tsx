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

function getScoreColor(accuracy: number): string {
  const clamped = Math.max(0, Math.min(100, accuracy));
  const hue = Math.round((clamped / 100) * 120);
  return `hsl(${hue}, 100%, 50%)`;
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

  // Helper: get ring color based on accuracy
  const getRingCoolor = useCallback((val: number): string => {
    if (val >= 80) return "#7ed957";
    if (val >= 60) return "#e8c022";
    if (val >= 40) return "#E87722";
    return "#e84422";
  }, []);

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
              const whereHue = Math.round((Math.max(0, Math.min(100, myResult?.locationScore ?? 0)) / 100) * 120);
              const whereAccColor = `hsl(${whereHue}, 100%, 50%)`;
              const whereAccBg = (myResult?.locationScore ?? 0) >= 60 ? "#1a2e1a" : (myResult?.locationScore ?? 0) >= 30 ? "#2e2a1a" : "#2e1a1a";
              return (
                <>
                  {/* Card 1 — Event Title */}
                  <div style={{ marginBottom: 2, marginLeft: 6, marginRight: 6, borderRadius: 12, overflow: "hidden", background: "#333", padding: 14 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{round.title}</div>
                  </div>
                  {/* Card 2 — Event Image */}
                  <div style={{ marginBottom: 2, marginLeft: 6, marginRight: 6, borderRadius: 12, overflow: "hidden", background: "#333" }}>
                    {round.imageUrl ? (
                      <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={round.imageUrl} alt={round.title}
                          style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-primary, #f97316)", marginTop: 8, textAlign: "center", padding: "0 14px 14px" }}>
                          {correctYear} · {correctName}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ height: 160, background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 12 }}>
                          No image
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-primary, #f97316)", marginTop: 8, textAlign: "center", padding: "0 14px 14px" }}>
                          {correctYear} · {correctName}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Card 5 — Event Description */}
                  <div style={{ marginBottom: 2, marginLeft: 6, marginRight: 6, borderRadius: 12, overflow: "hidden", background: "#333", padding: 14 }}>
                    <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>
                      {round.description ?? "No description available"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
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
                  {/* Card 6 — Accuracy Ring + XP */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, marginBottom: 2, marginLeft: 6, marginRight: 6 }}>
                    <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "1.5px", textAlign: "center", marginBottom: 10 }}>
                      Accuracy (%)
                    </div>
                    <RainbowRing value={accuracy} />
                    {submittedHintPenaltyRef.current.accPenalty > 0 && (
                      <div style={{ textAlign: "center", marginTop: 4, marginBottom: 2 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          background: "rgba(232,68,34,0.12)",
                          border: "0.5px solid rgba(232,68,34,0.35)",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 11,
                          color: "#e84422",
                          fontWeight: 600,
                        }}>
                          −{submittedHintPenaltyRef.current.accPenalty}% hints
                        </span>
                      </div>
                    )}
                    <div style={{ textAlign: "center", marginTop: 12, borderTop: "1px solid #444", paddingTop: 10 }}>
                      <span style={{ fontSize: 22, fontWeight: "bold", color: "#fff" }}>{myResult?.score ?? 0}</span>
                      <span style={{ fontSize: 13, color: "#f97316", marginLeft: 5 }}>XP</span>
                    </div>
                    {submittedHintPenaltyRef.current.xpPenalty > 0 && (
                      <div style={{ textAlign: "center", marginTop: 3 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          background: "rgba(232,68,34,0.12)",
                          border: "0.5px solid rgba(232,68,34,0.35)",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 11,
                          color: "#e84422",
                          fontWeight: 600,
                        }}>
                          −{submittedHintPenaltyRef.current.xpPenalty} XP hints
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Card — Badges */}
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
                        background: '#333', borderRadius: 12, padding: 14,
                        marginBottom: 2, marginLeft: 6, marginRight: 6,
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
                  {/* Card 4 — WHERE */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, marginBottom: 2, marginLeft: 6, marginRight: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: "#f97316" }}>Where</span>
                      {myResult != null && (
                        <span style={{ background: whereAccBg, color: whereAccColor, borderRadius: 999, padding: "2px 9px", fontSize: 18, fontWeight: 700 }}>
                          {Math.round(myResult.locationScore)}%
                        </span>
                      )}
                    </div>
                    {submittedHintPenaltyRef.current.accPenalty > 0 && (
                      <div style={{ textAlign: "right", marginBottom: 6, marginTop: -4 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          fontSize: 10, color: "#e84422", fontWeight: 600,
                        }}>
                          −{Math.round(submittedHintPenaltyRef.current.accPenalty / 2)}% hints
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "#fff", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                      <span>Correct:</span>
                      <span style={{ color: "#f97316" }}>{correctName}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                      {myDistanceKm != null && (
                        <span style={{ background: "#3a3a3a", color: "#bbb", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
                          {Math.round(myDistanceKm)} km away
                        </span>
                      )}
                    </div>
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
                                    <span style={{ color: r.playerId === playerId ? "#f97316" : "#fff", fontWeight: r.playerId === playerId ? 600 : 400 }}>
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
                  {/* Card 5 — WHEN */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, marginBottom: 2, marginLeft: 6, marginRight: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#f97316" }}>When</div>
                      {(() => {
                        const myWhenRow = whenRows.find(r => r.isMe);
                        const myWhenAcc = myWhenRow?.acc ?? null;
                        const hue = myWhenAcc != null ? Math.round((myWhenAcc / 100) * 120) : null;
                        const accColor = hue != null ? `hsl(${hue}, 100%, 50%)` : "#888";
                        const accBg = myWhenAcc != null
                          ? myWhenAcc >= 60 ? "#1a2e1a" : myWhenAcc >= 30 ? "#2e2a1a" : "#2e1a1a"
                          : "#2a2a2a";
                        return myWhenAcc != null ? (
                          <span style={{ background: accBg, color: accColor, borderRadius: 999, padding: "2px 9px", fontSize: 18, fontWeight: 700 }}>
                            {Math.round(myWhenAcc)}%
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {submittedHintPenaltyRef.current.accPenalty > 0 && (
                      <div style={{ textAlign: "right", marginBottom: 6, marginTop: -4 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          fontSize: 10, color: "#e84422", fontWeight: 600,
                        }}>
                          −{Math.round(submittedHintPenaltyRef.current.accPenalty / 2)}% hints
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "#fff", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
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
                        background: "var(--color-primary, #f97316)",
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
                          color: "var(--color-primary, #f97316)",
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
                  {submittedHintPenaltyRef.current.purchasedIds.length > 0 && (() => {
                    const usedHints = (snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? [])
                      .filter(h => submittedHintPenaltyRef.current.purchasedIds.includes(h.id))
                      .sort((a, b) => a.tier - b.tier);
                    if (usedHints.length === 0) return null;
                    return (
                      <div style={{
                        background: "#333", borderRadius: 12, padding: 14,
                        marginBottom: 2, marginLeft: 6, marginRight: 6,
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
                  {/* Card 9 — Round Leaderboard */}
                  <div style={{ background: "#333", borderRadius: 12, padding: 14, marginBottom: 2, marginLeft: 6, marginRight: 6 }}>
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
                  {/* Countdown Timer and Player Ready Status */}
                  {resultSecsLeft !== null && (
                    <div style={{
                      padding: "12px 14px",
                      background: "rgba(0,0,0,0.8)",
                      borderBottom: "1px solid #222",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      alignItems: "center",
                    }}>
                      {/* Countdown Timer */}
                      <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: resultSecsLeft <= 5 ? "#f97316" : "#fff",
                      }}>
                        Next round in {resultSecsLeft}s
                      </div>
                      {/* Per-player ready status */}
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        alignItems: "center",
                      }}>
                        <div style={{
                          fontSize: 11,
                          color: snapshot.readyForNext?.length === snapshot.players.filter(p => p.leftAt === null).length
                            ? "#7ed957"
                            : "#888",
                          fontWeight: 500,
                        }}>
                          {snapshot.readyForNext?.length === snapshot.players.filter(p => p.leftAt === null).length
                            ? "All ready! Starting..."
                            : "Waiting for next round"}
                        </div>
                        <div style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          justifyContent: "center",
                        }}>
                          {snapshot.players.filter(p => p.leftAt === null).map((player) => {
                            const isReady = snapshot.readyForNext?.includes(player.playerId);
                            const displayName = player.displayName || player.playerId.slice(0, 8);
                            const truncatedName = displayName.length > 10 ? displayName.slice(0, 10) + "..." : displayName;
                            return (
                              <div key={player.playerId} style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 8px",
                                borderRadius: 999,
                                background: isReady ? "rgba(126, 217, 87, 0.15)" : "rgba(255,255,255,0.05)",
                                border: isReady ? "1px solid rgba(126, 217, 87, 0.3)" : "1px solid #333",
                                fontSize: 11,
                                color: isReady ? "#7ed957" : "#888",
                              }}>
                                <span>{isReady ? "✓" : "⏳"}</span>
                                <span>{truncatedName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Spacer for fixed bottom bar */}
                  <div style={{ height: 70 }} />
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
                    zIndex: 1000,
                  }}>
                    <button
                      onClick={() => router.push("/")}
                      style={{
                        background: "transparent",
                        color: "#fff",
                        border: "none",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "8px 16px",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "middle" }}>
                        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
                        <polyline points="9 21 9 12 15 12 15 21" />
                      </svg>
                    </button>
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
                      disabled={snapshot.readyForNext?.includes(playerId ?? "")}
                      style={{
                        background: "#f97316",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 15,
                        border: "none",
                        borderRadius: 10,
                        padding: "11px 26px",
                        cursor: snapshot.readyForNext?.includes(playerId ?? "") ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                        opacity: snapshot.readyForNext?.includes(playerId ?? "") ? 0.5 : 1,
                      }}
                    >
                      {snapshot.currentRoundIndex === snapshot.rounds.length - 1 ? "Final Results" : "Next Round ›"}
                    </button>
                  </div>
                </>
              );
            })()}
            {renderError}
          </section>
        ) : null}

        {snapshot.status === "SESSION_COMPLETE" ? (
          <section style={{ background: "#000", paddingBottom: 80 }}>
            {/* Loading state */}
            {!allRoundResults ? (
              <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
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

              // Compute leaderboard
              // Compute round winners per round index
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
                  {/* HERO ACCURACY CARD */}
                  <div style={{
                    background: "#1e1e1e",
                    borderRadius: 14,
                    margin: 12,
                    padding: "20px 16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}>
                    <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 8 }}>
                      OVERALL ACCURACY
                    </div>
                    <svg viewBox="0 0 130 130" style={{ width: 130, height: 130 }}>
                      <circle cx={65} cy={65} r={54} fill="none" stroke="#2a2a2a" strokeWidth={10} />
                      <circle
                        cx={65} cy={65} r={54} fill="none"
                        stroke={getScoreColor(overallAccuracy)} strokeWidth={10} strokeLinecap="round"
                        strokeDasharray={339.3}
                        strokeDashoffset={339.3 * (1 - overallAccuracy / 100)}
                        transform={`rotate(-90 65 65)`}
                      />
                      <text x={65} y={65} textAnchor="middle" dominantBaseline="central"
                        fill={getScoreColor(overallAccuracy)} fontSize={42} fontWeight={500}>
                        {overallAccuracy}
                      </text>
                    </svg>
                    <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                      {overallXP} XP
                    </div>
                  </div>

                  {/* WHERE / WHEN SUB-CARDS */}
                  <div style={{ margin: "0 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {/* WHERE card */}
                    <div style={{
                      background: "#1e1e1e",
                      borderRadius: 12,
                      padding: "16px 10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}>
                      <div style={{ fontSize: 10, color: "#888", letterSpacing: "1.2px", textTransform: "uppercase", fontWeight: 500, marginBottom: 12 }}>
                        WHERE
                      </div>
                      <svg viewBox="0 0 84 84" style={{ width: 84, height: 84, marginBottom: 8 }}>
                        <circle cx={42} cy={42} r={34} fill="none" stroke="#2a2a2a" strokeWidth={8} />
                        <circle
                          cx={42} cy={42} r={34} fill="none"
                          stroke={getScoreColor(whereAccuracy)} strokeWidth={8} strokeLinecap="round"
                          strokeDasharray={213.6}
                          strokeDashoffset={213.6 * (1 - whereAccuracy / 100)}
                          transform={`rotate(-90 42 42)`}
                        />
                        <text x={42} y={42} textAnchor="middle" dominantBaseline="central"
                          fill={getScoreColor(whereAccuracy)} fontSize={36} fontWeight={700}>
                          {whereAccuracy}
                        </text>
                      </svg>
                      <div style={{ fontSize: 16, color: "#bbb", fontWeight: 400, marginBottom: 4 }}>
                        %
                      </div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        avg {Math.round(avgDistanceKm)} km away
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        {whereAccuracy} XP
                      </div>
                    </div>

                    {/* WHEN card */}
                    <div style={{
                      background: "#1e1e1e",
                      borderRadius: 12,
                      padding: "16px 10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}>
                      <div style={{ fontSize: 10, color: "#888", letterSpacing: "1.2px", textTransform: "uppercase", fontWeight: 500, marginBottom: 12 }}>
                        WHEN
                      </div>
                      <svg viewBox="0 0 84 84" style={{ width: 84, height: 84, marginBottom: 8 }}>
                        <circle cx={42} cy={42} r={34} fill="none" stroke="#2a2a2a" strokeWidth={8} />
                        <circle
                          cx={42} cy={42} r={34} fill="none"
                          stroke={getScoreColor(whenAccuracy)} strokeWidth={8} strokeLinecap="round"
                          strokeDasharray={213.6}
                          strokeDashoffset={213.6 * (1 - whenAccuracy / 100)}
                          transform={`rotate(-90 42 42)`}
                        />
                        <text x={42} y={42} textAnchor="middle" dominantBaseline="central"
                          fill={getScoreColor(whenAccuracy)} fontSize={36} fontWeight={700}>
                          {whenAccuracy}
                        </text>
                      </svg>
                      <div style={{ fontSize: 16, color: "#bbb", fontWeight: 400, marginBottom: 4 }}>
                        %
                      </div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        avg {Math.round(avgYearDiff)} yrs off
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        {whenAccuracy} XP
                      </div>
                    </div>
                  </div>

                  {/* LEADERBOARD SECTION */}
                  <div style={{
                    background: "#1e1e1e",
                    borderRadius: 12,
                    margin: "0 12px 12px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      fontSize: 11,
                      color: "#888",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      padding: "12px 16px 10px",
                      borderBottom: "0.5px solid #252525",
                    }}>
                      FINAL RANKINGS
                    </div>
                    {leaderboard.map((player, index) => {
                      const isCurrentPlayer = player.playerId === playerId;
                      const playerData = snapshot.players.find(p => p.playerId === player.playerId);
                      const displayName = playerLabel(snapshot.players, player.playerId);
                      const firstLetter = displayName ? displayName.charAt(0).toUpperCase() : "?";
                      return (
                        <div
                          key={player.playerId}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "20px 1fr auto",
                            padding: "11px 16px",
                            borderBottom: index === leaderboard.length - 1 ? "none" : "0.5px solid #1e1e1e",
                            background: isCurrentPlayer ? "#252525" : "transparent",
                          }}
                        >
                          <div style={{ fontSize: 13, color: "#bbb", width: 20, display: "flex", alignItems: "center" }}>
                            {index + 1}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {playerData?.avatarUrl ? (
                              <img
                                src={playerData.avatarUrl}
                                alt={displayName}
                                style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "#444",
                                color: "#fff",
                                fontSize: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}>
                                {firstLetter}
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: 13, ...getUsernameGradientStyle(player.playerId), fontWeight: 500 }}>
                                {displayName}
                                {isCurrentPlayer && (
                                  <span style={{ fontSize: 11, color: "#E87722", marginLeft: 4 }}>(you)</span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                                {Array.from({ length: snapshot.config.totalRounds }).map((_, i) => (
                                  <div key={i} style={{
                                    width: 20,
                                    height: 4,
                                    borderRadius: 2,
                                    background: player.wonRounds.includes(i) ? "#E87722" : "#2a2a2a",
                                  }} />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 18, color: "#fff", fontWeight: 700 }}>
                              {player.avgAccuracy}<span style={{ fontSize: 18, color: "#E87722", fontWeight: 700 }}>%</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#666" }}>
                              {player.totalScore} XP
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ROUND BREAKDOWN LABEL */}
                  <div style={{
                    fontSize: 10,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    margin: "4px 12px 8px",
                  }}>
                    ROUND BREAKDOWN
                  </div>

                  {/* ROUND CARDS */}
                  {snapshot.rounds.map((round, i) => {
                    const roundStats = computeRoundStats(i);
                    if (!roundStats) return null;
                    const bestPlayerData = snapshot.players.find(p => p.playerId === roundStats.bestPlayerId);
                    const bestPlayerName = playerLabel(snapshot.players, roundStats.bestPlayerId);
                    const bestPlayerFirstLetter = bestPlayerName ? bestPlayerName.charAt(0).toUpperCase() : "?";
                    return (
                      <div key={i} style={{
                        background: "#1e1e1e",
                        borderRadius: 12,
                        margin: "0 12px 8px",
                        overflow: "hidden",
                      }}>
                        {/* Photo strip */}
                        <div style={{ position: "relative" }}>
                          {round.imageUrl ? (
                            <>
                              <img
                                src={round.imageUrl}
                                alt={round.title}
                                style={{ width: "100%", height: 94, objectFit: "cover", display: "block" }}
                              />
                              <button
                                onClick={() => setFullscreenImg(round.imageUrl)}
                                style={{
                                  position: "absolute",
                                  top: 8,
                                  right: 8,
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  background: "rgba(0,0,0,0.55)",
                                  border: "none",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <div style={{
                              height: 94,
                              background: "#1e1e1e",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              color: "#3a3a3a",
                            }}>
                              {round.locationName || `${round.latitude.toFixed(2)}, ${round.longitude.toFixed(2)}`} · {round.year}
                            </div>
                          )}
                        </div>

                        {/* Card body */}
                        <div style={{ padding: "11px 14px 14px" }}>
                          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>
                            ROUND {i + 1}
                          </div>
                          <div style={{ fontSize: 13, color: "#fff", fontWeight: 500, lineHeight: 1.35, marginBottom: 3 }}>
                            {round.title}
                          </div>
                          {round.description && (
                            <div style={{
                              fontSize: 12,
                              color: "#888",
                              marginTop: 3,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              marginBottom: 10,
                            }}>
                              {round.description}
                            </div>
                          )}

                          {/* 3-column score row */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                            {/* TOTAL cell */}
                            <div style={{
                              background: "#1e1e1e",
                              borderRadius: 8,
                              padding: "8px 6px",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                            }}>
                              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <circle cx={12} cy={12} r={10} />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                TOTAL
                              </div>
                              <div style={{ fontSize: 18, color: getScoreColor(roundStats.avgAccuracy), fontWeight: 600, marginBottom: 2 }}>
                                {roundStats.avgAccuracy}<span style={{ fontSize: 12, color: "#bbb" }}>%</span>
                              </div>
                              <div style={{ fontSize: 10, color: "#666" }}>
                                {roundStats.totalScore} pts
                              </div>
                            </div>

                            {/* WHERE cell */}
                            <div style={{
                              background: "#1e1e1e",
                              borderRadius: 8,
                              padding: "8px 6px",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                            }}>
                              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                                <svg width={10} height={10} viewBox="0 0 24 24" fill="#E87722">
                                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                </svg>
                                WHERE
                              </div>
                              <div style={{ fontSize: 18, color: getScoreColor(roundStats.avgLocationScore), fontWeight: 600, marginBottom: 2 }}>
                                {roundStats.avgLocationScore}<span style={{ fontSize: 12, color: "#bbb" }}>%</span>
                              </div>
                              <div style={{ fontSize: 10, color: "#666" }}>
                                avg {Math.round(roundStats.avgDistanceKm)} km
                              </div>
                            </div>

                            {/* WHEN cell */}
                            <div style={{
                              background: "#1e1e1e",
                              borderRadius: 8,
                              padding: "8px 6px",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                            }}>
                              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#E87722" strokeWidth={2}>
                                  <rect x="3" y="4" width={18} height={18} rx={2} ry={2} />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                WHEN
                              </div>
                              <div style={{ fontSize: 18, color: getScoreColor(roundStats.avgTimeScore), fontWeight: 600, marginBottom: 2 }}>
                                {roundStats.avgTimeScore}<span style={{ fontSize: 12, color: "#bbb" }}>%</span>
                              </div>
                              <div style={{ fontSize: 10, color: "#666" }}>
                                avg {Math.round(roundStats.avgYearDiff)} yrs
                              </div>
                            </div>
                          </div>

                          {/* Round footer */}
                          <div style={{
                            borderTop: "0.5px solid #222",
                            marginTop: 9,
                            paddingTop: 9,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}>
                            <div style={{ fontSize: 11, color: "#666" }}>
                              Best player:
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {bestPlayerData?.avatarUrl ? (
                                <img
                                  src={bestPlayerData.avatarUrl}
                                  alt={bestPlayerName}
                                  style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }}
                                />
                              ) : (
                                <div style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: "50%",
                                  background: "#444",
                                  color: "#fff",
                                  fontSize: 10,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}>
                                  {bestPlayerFirstLetter}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: "#ccc", fontWeight: 500 }}>
                                {bestPlayerName}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* BOTTOM ACTION BAR */}
                  <div style={{
                    position: "fixed",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "#111",
                    borderTop: "0.5px solid #2a2a2a",
                    padding: "12px 16px",
                    display: "flex",
                    gap: 10,
                    zIndex: 1000,
                  }}>
                    <button
                      onClick={() => router.push("/")}
                      style={{
                        background: "transparent",
                        color: "#fff",
                        border: "none",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "8px 16px",
                      }}
                    >
                      Home
                    </button>
                    <button
                      onClick={() => router.push("/compete")}
                      style={{
                        flex: 1,
                        height: 46,
                        borderRadius: 10,
                        border: "none",
                        background: "#E87722",
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Play Again
                    </button>
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
