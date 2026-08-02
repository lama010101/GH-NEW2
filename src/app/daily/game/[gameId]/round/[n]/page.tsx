"use client";

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
import RoundActiveSection from "@/components/compete/RoundActiveSection";
import NotificationBell from "@/components/NotificationBell";
import TopBar from "@/components/layout/TopBar";
import { NavModal } from "@/components/NavModal";
import { supabaseBrowser, readSession } from "@/core/supabaseBrowser";
import { updateCachedDisplayName, updateCachedAvatarUrl } from "@/core/identity";
import { computeTimeRemaining } from "@/core/competeUtils";
import pageStyles from '@/app/practice/[gameId]/page.module.css';

export default function DailyRoundPage() {
  const params = useParams<{ gameId: string; n: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";

  const t = useTranslations('game');

  const [snapshot, setSnapshot] = useState<CompeteSessionSnapshot | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[] | null>(null);
  const [allRoundResults, setAllRoundResults] = useState<AllRoundResult[] | null>(null);
  const [allRoundResultsLoading, setAllRoundResultsLoading] = useState<boolean>(true);
  const [allRoundResultsError, setAllRoundResultsError] = useState<string | null>(null);
  const [guessYear, setGuessYear] = useState<number | null>(null);
  const [guessLat, setGuessLat] = useState<number | null>(null);
  const [guessLng, setGuessLng] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localSubmitted, setLocalSubmitted] = useState(false);
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
  const [locationName, setLocationName] = useState<string | null>(null);
  const [showNavModal, setShowNavModal] = useState(false);
  const [topbarAccuracy, setTopbarAccuracy] = useState("--");
  const [topbarXp, setTopbarXp] = useState("--");
  const [topbarAvatarUrl, setTopbarAvatarUrl] = useState<string | null>(null);
  const [topbarInitials, setTopbarInitials] = useState("PL");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const submittedHintPenaltyRef = useRef<{ accPenalty: number; xpPenalty: number; purchasedIds: string[]; whereAccPenalty: number; whenAccPenalty: number }>({
    accPenalty: 0,
    xpPenalty: 0,
    purchasedIds: [],
    whereAccPenalty: 0,
    whenAccPenalty: 0,
  });

  const router = useRouter();

  const { playerId, displayName, isLoading: identityLoading, error: identityError } = useIdentity();
  const guessYearRef = useRef<number | null>(null);
  const guessLatRef = useRef<number | null>(null);
  const guessLngRef = useRef<number | null>(null);
  const autoSubmitFiredRef = useRef(false);

  // Fetch initial snapshot — uses the compete GET endpoint (same snapshot shape)
  useEffect(() => {
    if (!gameId || !playerId) return;
    let cancelled = false;

    ;(async () => {
      try {
        const response = await fetch(`/api/compete/${gameId}?playerId=${playerId}`, { cache: "no-store" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? t('failed_load_session'));
        }
        const data = await response.json();
        if (cancelled) return;
        setSnapshot(data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('failed_load_session'));
      }
    })();

    return () => { cancelled = true };
  }, [gameId, playerId]);

  // Lobby TopBar: fetch viewer stats + profile
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
          if (profile.display_name) updateCachedDisplayName(profile.display_name);
          if (profile.avatar_url) updateCachedAvatarUrl(profile.avatar_url);
        }
      } catch {}
    })();
  }, [playerId]);

  // Reset card expansion when round changes
  useEffect(() => {
    setWhereLbExpanded(true);
    setWhenLbExpanded(true);
    setWhereCluesExpanded(false);
    setWhenCluesExpanded(false);
  }, [snapshot?.currentRoundIndex]);

  // Reset guess inputs whenever the active round changes
  useEffect(() => {
    if (!snapshot) return;
    setGuessYear(null);
    guessYearRef.current = null;
    setGuessLat(null);
    guessLatRef.current = null;
    setGuessLng(null);
    guessLngRef.current = null;
    setLocalSubmitted(false);
    autoSubmitFiredRef.current = false;
    setRoundResults(null);
    setHintResult({ purchasedIds: [], accPenalty: 0, xpPenalty: 0, whereAccPenalty: 0, whenAccPenalty: 0 });
    submittedHintPenaltyRef.current = { accPenalty: 0, xpPenalty: 0, purchasedIds: [], whereAccPenalty: 0, whenAccPenalty: 0 };
    setLocationName(null);
  }, [snapshot?.currentRoundIndex]);

  // Fetch all round results when session completes
  const refetchAllRoundResults = useCallback(async () => {
    if (!gameId || !playerId) return;
    setAllRoundResultsLoading(true);
    setAllRoundResultsError(null);
    try {
      const response = await fetch(`/api/compete/${gameId}/all-results?playerId=${playerId}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || t('failed_load_session'));
      }
      const data = await response.json();
      setAllRoundResults(data.results ?? []);
    } catch (err) {
      setAllRoundResultsError(err instanceof Error ? err.message : t('failed_load_session'));
      setAllRoundResults(null);
    } finally {
      setAllRoundResultsLoading(false);
    }
  }, [gameId, playerId, t]);

  const sessionStatus = snapshot?.status;
  useEffect(() => {
    if (sessionStatus !== "SESSION_COMPLETE") return;
    if (allRoundResults !== null) return;
    if (!gameId || !playerId) return;
    refetchAllRoundResults();
  }, [sessionStatus, allRoundResults, gameId, playerId, refetchAllRoundResults]);

  // Local UI-only timer derived from snapshot.roundEndsAt
  useEffect(() => {
    if (!snapshot || snapshot.status !== "ROUND_ACTIVE") {
      setTimeRemaining(null);
      return;
    }
    if (!snapshot.roundEndsAt || snapshot.config?.roundTimerSec === 0) {
      setTimeRemaining(null);
      return;
    }
    const tick = () => {
      setTimeRemaining(computeTimeRemaining(snapshot.roundEndsAt));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [snapshot]);

  // Auto-submit on timer expiry
  useEffect(() => {
    if (timeRemaining !== 0) return;
    if (snapshot?.status !== "ROUND_ACTIVE") return;
    if (snapshot?.config?.roundTimerSec === 0) return;
    if (localSubmitted || autoSubmitFiredRef.current) return;
    if (!playerId) return;

    const capturedYear = guessYearRef.current;
    const capturedLat = guessLatRef.current;
    const capturedLng = guessLngRef.current;

    if (capturedYear === null && capturedLat === null && capturedLng === null) return;

    autoSubmitFiredRef.current = true;
    submittedHintPenaltyRef.current = {
      accPenalty: hintResult.accPenalty,
      xpPenalty: hintResult.xpPenalty,
      purchasedIds: hintResult.purchasedIds,
      whereAccPenalty: hintResult.whereAccPenalty,
      whenAccPenalty: hintResult.whenAccPenalty,
    };
    setLocalSubmitted(true);
    setBusy(true);

    ;(async () => {
      try {
        const session = await readSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error(t('not_authenticated'));

        const response = await fetch(`/api/daily/${gameId}/guess`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            roundIndex: snapshot.currentRoundIndex,
            year: capturedYear,
            lat: capturedLat,
            lng: capturedLng,
            hintsUsed: hintResult.purchasedIds,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to submit guess');
        }

        const data = await response.json();
        setSnapshot(data);
        if (data.results) {
          setRoundResults(data.results);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit guess');
        setLocalSubmitted(false);
        autoSubmitFiredRef.current = false;
      } finally {
        setBusy(false);
      }
    })();
  }, [timeRemaining, snapshot?.status, snapshot?.currentRoundIndex, playerId, hintResult, gameId, snapshot]);

  // Scroll to top when ROUND_COMPLETE loads
  useEffect(() => {
    if (snapshot?.status === "ROUND_COMPLETE") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [snapshot?.status]);

  // Preload next round image when current round changes
  useEffect(() => {
    if (snapshot?.status !== "ROUND_ACTIVE" && snapshot?.status !== "ROUND_COMPLETE") return;
    const currentRoundIndex = snapshot.currentRoundIndex ?? 0;
    const nextRoundIndex = currentRoundIndex + 1;
    if (nextRoundIndex >= (snapshot.rounds?.length ?? 0)) return;
    const nextImageUrl = snapshot.rounds?.[nextRoundIndex]?.imageUrl;
    if (!nextImageUrl) return;
    const img = new Image();
    img.src = nextImageUrl;
  }, [snapshot?.currentRoundIndex, snapshot?.status, snapshot?.rounds]);

  const viewer = useMemo(() => {
    if (!snapshot || !playerId) return null;
    return snapshot.players.find((p) => p.playerId === playerId) ?? null;
  }, [snapshot, playerId]);

  const hasSubmitted = viewer?.hasSubmitted ?? false;
  const localPlayerAvatarUrl = snapshot?.players?.find(p => p.playerId === playerId)?.avatarUrl ?? null;

  const handleSetLocation = useCallback((location: { lat: number; lng: number }) => {
    guessLatRef.current = location.lat;
    guessLngRef.current = location.lng;
    setGuessLat(location.lat);
    setGuessLng(location.lng);
    const reverseGeocode = async (lat: number, lng: number) => {
      try {
        const res = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lng}&zoom=10`);
        if (!res.ok) throw new Error("Geocode failed");
        const data = await res.json();
        const addr = data.address ?? {};
        const primary =
          addr.city || addr.town || addr.village || addr.municipality ||
          addr.county || addr.state_district || addr.state || "";
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

  const handleSubmitGuess = useCallback(() => {
    if (!snapshot || snapshot.status !== 'ROUND_ACTIVE') return;
    if (!playerId) return;
    if (guessYear === null || guessLat === null || guessLng === null) return;
    if (localSubmitted) return;

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

    ;(async () => {
      try {
        const session = await readSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error(t('not_authenticated'));

        const response = await fetch(`/api/daily/${gameId}/guess`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            roundIndex: snapshot.currentRoundIndex,
            year: guessYear,
            lat: guessLat,
            lng: guessLng,
            hintsUsed: hintResult.purchasedIds,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to submit guess');
        }

        const data = await response.json();
        setSnapshot(data);
        if (data.results) {
          setRoundResults(data.results);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit guess');
        setLocalSubmitted(false);
      } finally {
        setBusy(false);
      }
    })();
  }, [snapshot, playerId, guessYear, guessLat, guessLng, localSubmitted, hintResult, gameId]);

  const handleAdvanceRound = useCallback(() => {
    if (!snapshot || !playerId) return;
    setBusy(true);
    setError(null);

    ;(async () => {
      try {
        const session = await readSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error(t('not_authenticated'));

        const response = await fetch(`/api/daily/${gameId}/advance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            roundIndex: snapshot.currentRoundIndex,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to advance round');
        }

        const data = await response.json();
        setSnapshot(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to advance round');
      } finally {
        setBusy(false);
      }
    })();
  }, [snapshot, playerId, gameId]);

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
      {snapshot?.status === "SESSION_COMPLETE" && (
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
          </div>
        </div>
      )}
      <div className={pageStyles.pageContent}>
        <div className="shell-grid">
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
              resultSecsLeft={null}
              onAdvanceRound={handleAdvanceRound}
              busy={busy}
              // Daily has no WebSocket connection — always treated as "OPEN" so the connection guard (added for Compete/Relax) never blocks Daily's Next button.
              connectionState="OPEN"
            />
          ) : null}

          {snapshot.status === "SESSION_COMPLETE" ? (
            <SessionComplete
              snapshot={snapshot}
              playerId={playerId}
              allRoundResults={allRoundResults}
              allRoundResultsLoading={allRoundResultsLoading}
              allRoundResultsError={allRoundResultsError}
              onRetryAllRoundResults={refetchAllRoundResults}
              onPlayAgain={() => router.push('/home')}
              sendMessage={() => router.push('/home')}
            />
          ) : null}
        </div>

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
