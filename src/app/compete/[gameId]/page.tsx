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
import type { CompeteSessionSnapshot } from "@/core/types";
import { useIdentity } from "@/hooks/useIdentity";
import { HintModal } from "@/components/HintModal";
import type { HintPurchaseResult } from "@/components/HintModal";
import { RoundResult, AllRoundResult } from "@/core/competeTypes";
import {
  shortId,
  getBadgeSoundPath
} from "@/core/competeUtils";
import BadgePopup from "@/components/compete/BadgePopup";
import SessionComplete from "@/components/compete/SessionComplete";
import RoundCompleteSection from "@/components/compete/RoundCompleteSection";
import LobbySection from "@/components/compete/LobbySection";
import RoundActiveSection from "@/components/compete/RoundActiveSection";
import useCompeteTimer from "@/hooks/useCompeteTimer";
import useCompeteSocket from "@/hooks/useCompeteSocket";

export default function CompeteGamePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";

  const [snapshot, setSnapshot] = useState<CompeteSessionSnapshot | null>(null);
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
    whereAccPenalty: 0,
    whenAccPenalty: 0,
  });
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [whereLbExpanded, setWhereLbExpanded] = useState(false);
  const [whenLbExpanded, setWhenLbExpanded] = useState(false);
  const [whereCluesExpanded, setWhereCluesExpanded] = useState(false);
  const [whenCluesExpanded, setWhenCluesExpanded] = useState(false);
  const [showBadgePopup, setShowBadgePopup] = useState(false);
  const submittedHintPenaltyRef = useRef<{ accPenalty: number; xpPenalty: number; purchasedIds: string[]; whereAccPenalty: number; whenAccPenalty: number }>({
    accPenalty: 0,
    xpPenalty: 0,
    purchasedIds: [],
    whereAccPenalty: 0,
    whenAccPenalty: 0,
  });
  const badgePopupShownForRoundRef = useRef<number>(-1);

  const { playerId, isLoading: identityLoading, error: identityError } = useIdentity();
  // Auto-submit on timer expiry using current input values.
  // Refs are necessary because useEffect closures cannot safely read state that changes frequently.
  const guessYearRef = useRef<number | null>(null);
  const guessLatRef = useRef<number | null>(null);
  const guessLngRef = useRef<number | null>(null);


  // Reset card expansion when round changes
  useEffect(() => {
    setWhereLbExpanded(false);
    setWhenLbExpanded(false);
    setWhereCluesExpanded(false);
    setWhenCluesExpanded(false);
  }, [snapshot?.currentRoundIndex]);

  // No REST fallback — WS is the ONLY state source.
  // If WS fails, the onError callback surfaces the error to the user.

  // Reset guess inputs whenever the active round changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!snapshot) return;
    setGuessYear(null);
    guessYearRef.current = null;
    setGuessLat(null);
    guessLatRef.current = null;
    setGuessLng(null);
    guessLngRef.current = null;
    setLocalSubmitted(false);
    setRoundResults(null);
    setSubmissionToasts([]);
    setHintResult({ purchasedIds: [], accPenalty: 0, xpPenalty: 0, whereAccPenalty: 0, whenAccPenalty: 0 });
    submittedHintPenaltyRef.current = { accPenalty: 0, xpPenalty: 0, purchasedIds: [], whereAccPenalty: 0, whenAccPenalty: 0 };
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

  const {
    wsRef,
    toggleReady,
    startGame,
    submitGuess,
    readyNext,
  } = useCompeteSocket({
    gameId,
    playerId,
    snapshot,
    roundResults,
    onStateUpdate: setSnapshot,
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
      setSnapshot((prev) => {
        if (!prev) return prev;
        return { ...prev, roundEndsAt: newPhaseEndsAt };
      });
      setTimerClamped(true);
      setTimeout(() => setTimerClamped(false), 600);
    },
    onError: (message) => {
      setError(message);
    },
    onRoundResults: setRoundResults,
    onSetBusy: setBusy,
    onSetLocalSubmitted: setLocalSubmitted,
    onClearSubmissionToasts: () => setSubmissionToasts([]),
  });

  const handleAdvanceRound = useCallback(() => {
    if (!snapshot || snapshot.status !== 'ROUND_COMPLETE') return;
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send READY_NEXT action signal via WS
    readyNext(snapshot.currentRoundIndex);
    setTimeout(() => setBusy(false), 5000);
  }, [snapshot, playerId, readyNext]);

  const { timeRemaining, resultSecsLeft } = useCompeteTimer({
    snapshot,
    playerId,
    localSubmitted,
    guessYearRef,
    guessLatRef,
    guessLngRef,
    hintResult,
    wsRef,
    submittedHintPenaltyRef,
    onAdvanceRound: handleAdvanceRound,
    setLocalSubmitted,
    setBusy,
  });

  // Scroll to top when ROUND_COMPLETE loads
  useEffect(() => {
    if (snapshot?.status === "ROUND_COMPLETE") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [snapshot?.status]);

  // Auto-open badge popup on ROUND_COMPLETE when badges or near-misses exist
  useEffect(() => {
    if (snapshot?.status === "ROUND_COMPLETE") {
      const currentRound = snapshot?.currentRoundIndex ?? -1;
      const myResult = roundResults?.find(r => r.playerId === playerId);
      if (
        myResult &&
        ((myResult.badges?.length ?? 0) > 0 || (myResult.nearMisses?.length ?? 0) > 0) &&
        badgePopupShownForRoundRef.current !== currentRound
      ) {
        badgePopupShownForRoundRef.current = currentRound;
        // Delay 600ms to allow accuracy ring animation to start first
        setTimeout(() => setShowBadgePopup(true), 600);
      }
    }
    // Reset popup on round change so it doesn't re-open on reconnect
    // Do NOT reset badgePopupShownForRoundRef — it must persist to prevent re-trigger on same round
    if (snapshot?.status === "ROUND_ACTIVE") {
      setShowBadgePopup(false);
    }
  }, [snapshot?.status, snapshot?.currentRoundIndex, roundResults, playerId]);

  useEffect(() => {
    if (!showBadgePopup) return;
    const myResult = roundResults?.find(r => r.playerId === playerId);
    const badges = myResult?.badges ?? [];
    badges.forEach((badge, i) => {
      setTimeout(() => {
        try {
          const soundPath = getBadgeSoundPath(badge.tier, badge.dimension);
          const audio = new Audio(soundPath);
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch { /* silent */ }
      }, i * 220 + 100);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBadgePopup]);

  const viewer = useMemo(() => {
    if (!snapshot || !playerId) return null;
    return snapshot.players.find((p) => p.playerId === playerId) ?? null;
  }, [snapshot, playerId]);

  // Authoritative: derived from snapshot.players[].hasSubmitted (DB → snapshot).
  const hasSubmitted = viewer?.hasSubmitted ?? false;

  const handleSetLocation = useCallback((location: { lat: number; lng: number }) => {
    guessLatRef.current = location.lat;
    guessLngRef.current = location.lng;
    setGuessLat(location.lat);
    setGuessLng(location.lng);
  }, []);

  const handleSetYear = useCallback((year: number | null) => {
    guessYearRef.current = year;
    setGuessYear(year);
  }, []);

  const handleReady = useCallback(() => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    toggleReady();
    // DO will broadcast STATE_UPDATE or ERROR via WS callbacks
    // busy flag cleared when STATE_UPDATE arrives (snapshot changes)
  }, [playerId, toggleReady]);

  const handleStart = useCallback(() => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    startGame();
  }, [playerId, startGame]);

  const handleSubmitGuess = useCallback(() => {
    if (!snapshot || snapshot.status !== 'ROUND_ACTIVE') return;
    if (!playerId) return;
    if (guessYear === null || guessLat === null || guessLng === null) return;
    if (localSubmitted) return;       // synchronous guard — no re-render needed
    submittedHintPenaltyRef.current = {
      accPenalty: hintResult.accPenalty,
      xpPenalty: hintResult.xpPenalty,
      purchasedIds: hintResult.purchasedIds,
      whereAccPenalty: hintResult.whereAccPenalty,
      whenAccPenalty: hintResult.whenAccPenalty,
    };
    setLocalSubmitted(true);
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    submitGuess(
      snapshot.currentRoundIndex,
      guessYear,
      guessLat,
      guessLng,
      hintResult.purchasedIds,
      hintResult.accPenalty,
      hintResult.xpPenalty
    );
  }, [snapshot, playerId, guessYear, guessLat, guessLng, localSubmitted, hintResult, submitGuess]);

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

  return (
    <main className="app-shell" style={{ background: snapshot?.status === "SESSION_COMPLETE" ? "#000" : undefined }}>
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

        {snapshot.status !== "ROUND_COMPLETE" && snapshot.status !== "SESSION_COMPLETE" && (
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
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Room code: </span>
              <code style={{ fontSize: 16, fontWeight: 800, letterSpacing: '3px', color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '3px 10px', borderRadius: 6 }}>
                {snapshot.roomCode}
              </code>
              {viewer?.isHost ? (
                <button
                  type="button"
                  className="button secondary"
                  style={{ marginLeft: 8, padding: "2px 8px", fontSize: "0.8em" }}
                  onClick={() => { navigator.clipboard.writeText(snapshot.roomCode); }}
                >
                  Copy
                </button>
              ) : null}
              {viewer ? <> · You: {viewer.displayName || shortId(viewer.playerId)}</> : null}
            </p>
          </section>
        )}

        {snapshot.status === "LOBBY" ? (
          <LobbySection
            snapshot={snapshot}
            viewer={viewer}
            busy={busy}
            error={error}
            onToggleReady={handleReady}
            onStartGame={handleStart}
          />
        ) : null}

        {snapshot.status === "ROUND_ACTIVE" ? (
          <RoundActiveSection
            snapshot={snapshot}
            playerId={playerId}
            timeRemaining={timeRemaining}
            guessYear={guessYear}
            guessLat={guessLat}
            guessLng={guessLng}
            hasSubmitted={hasSubmitted}
            localSubmitted={localSubmitted}
            busy={busy}
            onSetLocation={handleSetLocation}
            onSetYear={handleSetYear}
            onSubmit={handleSubmitGuess}
            onOpenHints={() => setHintModalOpen(true)}
            guessYearRef={guessYearRef}
            viewer={viewer}
          />
        ) : null}

        {snapshot.status === "ROUND_COMPLETE" ? (
          <RoundCompleteSection
            snapshot={snapshot}
            roundResults={roundResults}
            playerId={playerId}
            guessLat={guessLat}
            guessLng={guessLng}
            submittedHintPenaltyRef={submittedHintPenaltyRef}
            descriptionExpanded={descriptionExpanded}
            setDescriptionExpanded={setDescriptionExpanded}
            whereLbExpanded={whereLbExpanded}
            setWhereLbExpanded={setWhereLbExpanded}
            whenLbExpanded={whenLbExpanded}
            setWhenLbExpanded={setWhenLbExpanded}
            whereCluesExpanded={whereCluesExpanded}
            setWhereCluesExpanded={setWhereCluesExpanded}
            whenCluesExpanded={whenCluesExpanded}
            setWhenCluesExpanded={setWhenCluesExpanded}
            resultSecsLeft={resultSecsLeft}
            onAdvanceRound={handleAdvanceRound}
          />
        ) : null}

        {snapshot.status === "SESSION_COMPLETE" ? (
          <SessionComplete
            snapshot={snapshot}
            playerId={playerId}
            allRoundResults={allRoundResults}
            setFullscreenImg={setFullscreenImg}
          />
        ) : null}
      </div>

      {/* HintModal */}
      <HintModal
        hints={snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? []}
        isOpen={hintModalOpen}
        purchasedIds={hintResult.purchasedIds}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenImg}
            alt="Fullscreen"
            style={{ maxWidth: "100vw", maxHeight: "100vh", objectFit: "contain" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {showBadgePopup && (() => {
        const myResult = roundResults?.find(r => r.playerId === playerId);
        const badges = myResult?.badges ?? []
        const nearMisses = myResult?.nearMisses ?? []
        return (
          <BadgePopup badges={badges} nearMisses={nearMisses} onDismiss={() => setShowBadgePopup(false)} />
        )
      })()}
    </main>
  );
}
