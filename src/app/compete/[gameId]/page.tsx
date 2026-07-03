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
import { useTranslations } from 'next-intl';
import type { CompeteSessionSnapshot } from "@/core/types";
import { useIdentity } from "@/hooks/useIdentity";
import { HintModal } from "@/components/HintModal";
import type { HintPurchaseResult } from "@/components/HintModal";
import { RoundResult, AllRoundResult } from "@/core/competeTypes";
import SessionComplete from "@/components/compete/SessionComplete";
import RoundCompleteSection from "@/components/compete/RoundCompleteSection";
import LobbySection from "@/components/compete/LobbySection";
import RoundActiveSection from "@/components/compete/RoundActiveSection";
import NotificationBell from "@/components/NotificationBell";
import TopBar from "@/components/layout/TopBar";
import { NavModal } from "@/components/NavModal";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import useCompeteTimer from "@/hooks/useCompeteTimer";
import useCompeteSocket from "@/hooks/useCompeteSocket";
import btnStyles from "@/components/ui/Button.module.css";
import pageStyles from './page.module.css';

export default function CompeteGamePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";

  const t = useTranslations('game');

  const [snapshot, setSnapshot] = useState<CompeteSessionSnapshot | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[] | null>(null);
  const [allRoundResults, setAllRoundResults] = useState<AllRoundResult[] | null>(null);
  const [guessYear, setGuessYear] = useState<number | null>(null);
  const [guessLat, setGuessLat] = useState<number | null>(null);
  const [guessLng, setGuessLng] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localSubmitted, setLocalSubmitted] = useState(false);
  const [timerClamped, setTimerClamped] = useState(false);
  const [hintModalOpen, setHintModalOpen] = useState(false);
  const [hintResult, setHintResult] = useState<HintPurchaseResult>({
    purchasedIds: [],
    accPenalty: 0,
    xpPenalty: 0,
    whereAccPenalty: 0,
    whenAccPenalty: 0,
  });
  const [whereLbExpanded, setWhereLbExpanded] = useState(true);
  const [whenLbExpanded, setWhenLbExpanded] = useState(true);
  const [whereCluesExpanded, setWhereCluesExpanded] = useState(false);
  const [whenCluesExpanded, setWhenCluesExpanded] = useState(false);
  const [wsDisconnected, setWsDisconnected] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  // Lobby TopBar data (mirrors home page sourcing)
  const [showNavModal, setShowNavModal] = useState(false);
  const [topbarAccuracy, setTopbarAccuracy] = useState("--");
  const [topbarXp, setTopbarXp] = useState("--");
  const [topbarAvatarUrl, setTopbarAvatarUrl] = useState<string | null>(null);
  const [topbarInitials, setTopbarInitials] = useState("PL");
  const submittedHintPenaltyRef = useRef<{ accPenalty: number; xpPenalty: number; purchasedIds: string[]; whereAccPenalty: number; whenAccPenalty: number }>({
    accPenalty: 0,
    xpPenalty: 0,
    purchasedIds: [],
    whereAccPenalty: 0,
    whenAccPenalty: 0,
  });

  const router = useRouter();

  const { playerId, displayName, isLoading: identityLoading, error: identityError } = useIdentity();
  // Auto-submit on timer expiry using current input values.
  // Refs are necessary because useEffect closures cannot safely read state that changes frequently.
  const guessYearRef = useRef<number | null>(null);
  const guessLatRef = useRef<number | null>(null);
  const guessLngRef = useRef<number | null>(null);


  // Lobby TopBar: fetch viewer stats + profile (mirrors home page sourcing)
  useEffect(() => {
    if (!playerId) return;
    (async () => {
      try {
        const { data: stats } = await supabaseBrowser
          .from('player_global_stats')
          .select('avg_accuracy,total_xp')
          .eq('player_id', playerId)
          .single();
        if (stats) {
          setTopbarAccuracy(String(Math.round(Number(stats.avg_accuracy))));
          setTopbarXp(Number(stats.total_xp).toLocaleString('fr-FR'));
        }
      } catch {}
      try {
        const { data: profile } = await supabaseBrowser
          .from('profiles')
          .select('display_name,avatar_url')
          .eq('id', playerId)
          .single();
        if (profile) {
          if (profile.avatar_url) setTopbarAvatarUrl(profile.avatar_url);
          if (profile.display_name) setTopbarInitials(profile.display_name.slice(0, 2).toUpperCase());
        }
      } catch {}
    })();
  }, [playerId]);

  // Global error capture for React minified errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[GLOBAL_ERROR]", event.error);
    };

    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("error", handleError);
    };
  }, []);

  // Reset all game state when gameId changes (Play Again redirect, manual navigation)
  useEffect(() => {
    setSnapshot(null);
    setRoundResults(null);
    setAllRoundResults(null);
    setError(null);
    setBusy(false);
    setLocalSubmitted(false);
    setWsDisconnected(false);
  }, [gameId]);

  // Reset card expansion when round changes
  useEffect(() => {
    setWhereLbExpanded(true);
    setWhenLbExpanded(true);
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
    setHintResult({ purchasedIds: [], accPenalty: 0, xpPenalty: 0, whereAccPenalty: 0, whenAccPenalty: 0 });
    submittedHintPenaltyRef.current = { accPenalty: 0, xpPenalty: 0, purchasedIds: [], whereAccPenalty: 0, whenAccPenalty: 0 };
    setLocationName(null);
  }, [snapshot?.currentRoundIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all round results when session completes
  useEffect(() => {
    if (snapshot?.status === "SESSION_COMPLETE" && gameId && !allRoundResults) {
      fetch(`/api/compete/${gameId}/all-results?playerId=${playerId}`)
        .then(r => r.json())
        .then(data => setAllRoundResults(data.results ?? []))
        .catch(err => {
          console.error("[CompeteGamePage] Failed to fetch all round results:", err);
        });
    }
  }, [snapshot?.status, gameId, allRoundResults]);

  // Navigation guard: prevent refresh and back button during active game phases
  // Only applies to LOBBY, ROUND_ACTIVE, and ROUND_COMPLETE (not SESSION_COMPLETE)
  useEffect(() => {
    const isInGamePhase = snapshot?.status === "LOBBY" || 
                         snapshot?.status === "ROUND_ACTIVE" || 
                         snapshot?.status === "ROUND_COMPLETE";
    
    if (!isInGamePhase) return;

    // beforeunload: warn on refresh/close (shows native browser confirmation)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    // popstate: trap back button by re-pushing history state
    const handlePopState = (e: PopStateEvent) => {
      if (e.state === null) {
        // User pressed back button - push state back to trap them
        window.history.pushState({ gameId }, "", window.location.href);
      }
    };

    // Set up initial history state for back-button trap
    window.history.pushState({ gameId }, "", window.location.href);

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [snapshot?.status, gameId]);

  // Redirect to home if JOIN_ROOM fails before any snapshot is received
  useEffect(() => {
    if (error && !snapshot) {
      const timer = setTimeout(() => router.push("/home"), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, snapshot, router]);

  const {
    wsRef,
    toggleReady,
    startGame,
    submitGuess,
    readyNext,
    setTimer,
    setYearRange,
    setResultsTimer,
    setSubMode,
    kickPlayer,
    playAgain,
  } = useCompeteSocket({
    gameId,
    playerId,
    displayName: displayName ?? "",
    snapshot,
    roundResults,
    onStateUpdate: (newSnapshot) => {
      setBusy(false);
      console.log("[CLIENT_STATE_UPDATE]", {
        roundEndsAt: newSnapshot.roundEndsAt,
        status: newSnapshot.status,
        roundIndex: newSnapshot.currentRoundIndex,
      });
      console.log("[CLIENT_RECEIVED_PLAYERS]", {
        totalPlayers: newSnapshot.players?.length ?? null,
        players: newSnapshot.players?.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
        })),
      });
      console.log("[CLIENT_WS_MESSAGE_APPLIED]", {
        totalPlayers: newSnapshot.players.length,
      });
      setWsDisconnected(false);
      setSnapshot(newSnapshot);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onPlayerSubmitted: (submittedPlayerId, _playerName) => {
      if (submittedPlayerId !== playerId) {
        // Red flash for other players
        setTimerClamped(true);
        setTimeout(() => setTimerClamped(false), 600);
        // Haptic: short double pulse
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([60, 40, 60]);
        }
        // Alarm sound: short sharp beep via Web Audio API
        try {
          const ctx = new (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 660;
          osc.type = 'square';
          gain.gain.value = 0.18;
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
        } catch { /* audio not available */ }
      }
      // Self-submission overlay is driven by localSubmitted state — no action needed here
    },
    onTimerClamped: (newPhaseEndsAt) => {
      console.log("[TIMER_CLAMP_EVENT]", {
        newPhaseEndsAt,
      });
      setTimerClamped(true);
      setTimeout(() => setTimerClamped(false), 600);
    },
    onError: (message) => {
      setError(message);
    },
    onDisconnect: () => {
      setWsDisconnected(true);
    },
    onRoundResults: setRoundResults,
    onSetBusy: setBusy,
    onSetLocalSubmitted: setLocalSubmitted,
    onClearSubmissionToasts: () => {},
    onPlayAgain: (newGameId) => {
      router.push(`/compete/${newGameId}`);
    },
  });

  const handleAdvanceRound = useCallback(() => {
    if (!snapshot) return;
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send READY_NEXT action signal via WS.
    // Server validates phase — client must NOT silently no-op on stale snapshot.status.
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
    setLocalSubmitted,
    setBusy,
  });

  // Scroll to top when ROUND_COMPLETE loads
  useEffect(() => {
    if (snapshot?.status === "ROUND_COMPLETE") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [snapshot?.status]);

  // Preload next round image when current round changes
  useEffect(() => {
    if (snapshot?.status !== "ROUND_ACTIVE" && snapshot?.status !== "ROUND_COMPLETE") {
      return;
    }
    const currentRoundIndex = snapshot.currentRoundIndex ?? 0;
    const nextRoundIndex = currentRoundIndex + 1;
    if (nextRoundIndex >= (snapshot.rounds?.length ?? 0)) {
      return;
    }
    const nextImageUrl = snapshot.rounds?.[nextRoundIndex]?.imageUrl;
    if (!nextImageUrl) {
      return;
    }
    const img = new Image();
    img.src = nextImageUrl;
  }, [snapshot?.currentRoundIndex, snapshot?.status, snapshot?.rounds]);

  const viewer = useMemo(() => {
    if (!snapshot || !playerId) return null;
    return snapshot.players.find((p) => p.playerId === playerId) ?? null;
  }, [snapshot, playerId]);

  // Authoritative: derived from snapshot.players[].hasSubmitted (DB → snapshot).
  const hasSubmitted = viewer?.hasSubmitted ?? false;

  // Current player avatar for map marker
  const localPlayerAvatarUrl = snapshot?.players?.find(p => p.playerId === playerId)?.avatarUrl ?? null;

  const handleSetLocation = useCallback((location: { lat: number; lng: number }) => {
    guessLatRef.current = location.lat;
    guessLngRef.current = location.lng;
    setGuessLat(location.lat);
    setGuessLng(location.lng);
    // Reverse geocode to get location name for submission overlay
    const reverseGeocode = async (lat: number, lng: number) => {
      try {
        const res = await fetch(
          `/api/geocode/reverse?lat=${lat}&lon=${lng}&zoom=10`
        );
        if (!res.ok) throw new Error("Geocode failed");
        const data = await res.json();
        const addr = data.address ?? {};
        const primary =
          addr.city ||
          addr.town ||
          addr.village ||
          addr.municipality ||
          addr.county ||
          addr.state_district ||
          addr.state ||
          "";
        const country = addr.country || "";
        const name = primary && country
          ? `${primary}, ${country}`
          : primary || country || data.display_name?.split(",").slice(0, 2).join(",").trim() || "Unknown location";
        setLocationName(name);
      } catch {
        setLocationName(null);
      }
    };
    reverseGeocode(location.lat, location.lng);
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

  const handleSetTimer = useCallback((roundTimerSec: number) => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    setTimer(roundTimerSec);
  }, [playerId, setTimer]);

  const handleSetEraSelection = useCallback((selectedEras: string[], yearMin: number, yearMax: number) => {
    if (!playerId) return;
    wsRef.current?.setEraSelection(selectedEras, yearMin, yearMax);
  }, [playerId, wsRef]);

  const handleSetRegionSelection = useCallback((selectedRegions: string[]) => {
    if (!playerId) return;
    wsRef.current?.setRegionSelection(selectedRegions);
  }, [playerId, wsRef]);

  const handleSetYearRange = useCallback((yearMin: number, yearMax: number) => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    setYearRange(yearMin, yearMax);
  }, [playerId, setYearRange]);

  const handleSetResultsTimer = useCallback((resultsAutoAdvanceSec: number) => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    setResultsTimer(resultsAutoAdvanceSec);
  }, [playerId, setResultsTimer]);

  const handleSetSubMode = useCallback((mode: "sync" | "async", sessionDeadlineDays: number) => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send SET_SUB_MODE action signal via WS
    setSubMode(mode, sessionDeadlineDays);
  }, [playerId, setSubMode]);

  const handleKickPlayer = useCallback((targetPlayerId: string) => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    // Client → DO → DB: send action signal via WS
    kickPlayer(targetPlayerId);
  }, [playerId, kickPlayer]);

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
      hintResult.purchasedIds
    );
  }, [snapshot, playerId, guessYear, guessLat, guessLng, localSubmitted, hintResult, submitGuess]);

  if (!gameId) return null;

  if (identityLoading || identityError || !snapshot) {
    return (
      <div className={pageStyles.loadingScreen}>
        <div className={pageStyles.loadingBg} aria-hidden="true" />
        <div className={pageStyles.loadingScrim} aria-hidden="true" />
        <div className={pageStyles.loadingContent}>
          <div className={pageStyles.loadingSpinner} />
          <span className={pageStyles.loadingLabel}>
            {identityError ? t('identity_error') : t('loading_game')}
          </span>
          {error && (
            <span className={pageStyles.loadingError}>{error}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className={`app-shell ${pageStyles.pageShell}`}>
      {snapshot?.status === "ROUND_COMPLETE" && (
        <div className={pageStyles.notificationWrap}>
          <NotificationBell onlyShowWhenUnread />
        </div>
      )}
      {(snapshot?.status === "LOBBY" || snapshot?.status === "SESSION_COMPLETE") && (
        <>
          <TopBar
            accuracy={topbarAccuracy}
            xp={topbarXp}
            avatarUrl={topbarAvatarUrl}
            initials={topbarInitials}
            onAvatarClick={() => setShowNavModal(true)}
          />
          <NavModal
            isOpen={showNavModal}
            onClose={() => setShowNavModal(false)}
            avatarUrl={topbarAvatarUrl}
            initials={topbarInitials}
            displayName={displayName ?? ""}
          />
        </>
      )}
      <div className={pageStyles.bgImage} />
      <div className={pageStyles.bgScrim} />
      {timerClamped && (
        <div className={pageStyles.timerFlashOverlay} />
      )}
      {/* Post-submission overlay: shown to self only, persists until round ends */}
      {localSubmitted && snapshot?.status === 'ROUND_ACTIVE' && (
        <div className={pageStyles.submitOverlay}>
          <div className={pageStyles.submitOverlayCard}>
            <p className={pageStyles.submitOverlayTitle}>{t('guess_submitted')}</p>
            <div className={pageStyles.submitOverlayValues}>
              <div className={pageStyles.submitOverlayRow}>
                <span className={pageStyles.submitOverlayLabel}>{t('your_location')}</span>
                <span className={pageStyles.submitOverlayValue}>
                  {locationName ?? (guessLat !== null && guessLng !== null
                    ? `${guessLat.toFixed(2)}, ${guessLng.toFixed(2)}` 
                    : '—')}
                </span>
              </div>
              <div className={pageStyles.submitOverlayRow}>
                <span className={pageStyles.submitOverlayLabel}>{t('your_year')}</span>
                <span className={pageStyles.submitOverlayValue}>
                  {guessYear !== null ? guessYear : '—'}
                </span>
              </div>
            </div>
            <div className={pageStyles.submitOverlayWaiting}>
              <p className={pageStyles.submitOverlayWaitingLabel}>
                {snapshot.config.mode === 'async' ? t('guessed') : t('waiting_for')}
              </p>
              <ul className={pageStyles.submitOverlayPlayerList}>
                {snapshot.players
                  .filter(p => p.leftAt === null)
                  .map(p => (
                    <li
                      key={p.playerId}
                      className={
                        p.hasSubmitted
                          ? pageStyles.submitOverlayPlayerDone
                          : pageStyles.submitOverlayPlayerPending
                      }
                    >
                      <span className={p.hasSubmitted ? pageStyles.submitOverlayDotDone : pageStyles.submitOverlayDotPending} />
                      <span>
                        {p.displayName}
                        {p.playerId === playerId ? ` ${t('you')}` : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      <div className={pageStyles.pageContent}>
        <div className="shell-grid">
        {/* Toast stack - top-center (hidden during ROUND_COMPLETE) */}
        {/* REMOVED: Duplicate notification - avatar-side toasts in RoundActiveSection.tsx handle this */}


        {snapshot.status === "LOBBY" ? (
          <>
            <div className={pageStyles.lobbyTopBarSpacer} />
            {wsDisconnected && (
              <section
                className={`card ${pageStyles.connectionLostCard}`}
              >
                <p className={pageStyles.connectionLostText}>
                  {t('connection_lost')}
                </p>
                <button
                  type="button"
                  className={`${btnStyles.btn} ${btnStyles.primary}`}
                  onClick={() => {
                    setWsDisconnected(false);
                    wsRef.current?.reconnect();
                  }}
                >
                  {t('reconnect')}
                </button>
              </section>
            )}
            <LobbySection
              snapshot={snapshot}
              viewer={viewer}
              busy={busy}
              error={error}
              isConnected={!wsDisconnected}
              onToggleReady={handleReady}
              onStartGame={handleStart}
              onSetTimer={handleSetTimer}
              onSetYearRange={handleSetYearRange}
              onSetResultsTimer={handleSetResultsTimer}
              onSetSubMode={handleSetSubMode}
              onKickPlayer={handleKickPlayer}
              onSetEraSelection={handleSetEraSelection}
              onSetRegionSelection={handleSetRegionSelection}
            />
          </>
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
            hintsUsedCount={hintResult.purchasedIds.length}
            guessYearRef={guessYearRef}
            viewer={viewer}
            localPlayerAvatarUrl={localPlayerAvatarUrl}
            locationName={locationName}
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
            busy={busy}
          />
        ) : null}

        {snapshot.status === "SESSION_COMPLETE" ? (
          <SessionComplete
            snapshot={snapshot}
            playerId={playerId}
            allRoundResults={allRoundResults}
            sendMessage={(msg) => playAgain((msg as { newGameId: string }).newGameId)}
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
      </div>
    </main>
  );
}
