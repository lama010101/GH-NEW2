"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useTranslations } from 'next-intl';
import { toProxiedImageUrl } from "@/lib/imageProxy";
import RainbowRing from "@/components/compete/RainbowRing";
import { MiniRing } from "@/components/compete/RoundCompleteSection";
import FullscreenImageViewer from "@/components/FullscreenImageViewer";
import type { BadgeDimension, BadgeTier, CompeteSessionSnapshot } from "@/core/types";
import type { AllRoundResult } from "@/core/competeTypes";
import { getUsernameGradientStyle, playerLabel } from "@/core/competeUtils";
import { createAsyncCompeteSession } from "@/core/competeCreate";
import { calculateBadges } from "@/core/rules";
import { rankForXp } from "@/core/rank";
import { formatDistance, getDistanceUnitPreference } from "@/lib/distance";
import ExperienceAccuracy from "@/components/ExperienceAccuracy";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import AccuracySuffix from "@/components/AccuracySuffix";
import { getAccuracyColor } from "@/core/accuracyColor";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import WhereIcon from "@/components/icons/WhereIcon";
import WhenIcon from "@/components/icons/WhenIcon";
import { Star, TrendingUp, Trophy } from "lucide-react";
import styles from "./SessionComplete.module.css";

const BADGE_DIMENSIONS: BadgeDimension[] = ["location", "year", "combo"];
const BADGE_TIERS: BadgeTier[] = ["gold", "silver", "bronze"];
const BADGE_DIMENSION_LABEL_KEY: Record<BadgeDimension, string> = {
  location: "badge_dim_location",
  year: "badge_dim_year",
  combo: "badge_dim_combo",
};
const BADGE_TIER_LABEL_KEY: Record<BadgeTier, string> = {
  gold: "badge_tier_gold",
  silver: "badge_tier_silver",
  bronze: "badge_tier_bronze",
};

type DailyResultPlayer = {
  player_id: string;
  rank: number;
  display_name: string | null;
  avatar_url: string | null;
  is_ai: boolean;
  avg_accuracy: number;
  total_xp: number;
  completed_at: string | null;
  best_round_accuracy: number | null;
};

interface SessionCompleteProps {
  snapshot: CompeteSessionSnapshot;
  playerId: string | null;
  allRoundResults: AllRoundResult[] | null;
  allRoundResultsError?: string | null;
  onRetryAllResults?: () => void;
  sendMessage: (msg: object) => void;
  onPlayAgain?: () => void;
}

export default function SessionComplete({
  snapshot,
  playerId,
  allRoundResults,
  allRoundResultsError,
  onRetryAllResults,
  sendMessage,
  onPlayAgain,
}: SessionCompleteProps) {
  const router = useRouter();
  const t = useTranslations('compete_page');
  const tGame = useTranslations('game');
  const tRank = useTranslations('rank');
  const tLobby = useTranslations('lobby');
  const distanceUnit = getDistanceUnitPreference();
  const isPractice = snapshot.config.mode === "practice";
  const isDaily = snapshot.config.mode === "daily";
  const isAsync = snapshot.config.mode === "async";
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set([0]));
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerAlt, setViewerAlt] = useState<string>("");
  const [totalXp, setTotalXp] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [dailyResults, setDailyResults] = useState<DailyResultPlayer[] | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [dailyRetryCount, setDailyRetryCount] = useState(0);

  // A round "counts" for final stats if the player actually submitted a guess
  // or if the round was deadline-finalized while they were absent (score 0).
  // Truly "not started" players have no round result rows at all.
  const hasResult = (r?: AllRoundResult | null) => !!r && (r.didSubmit || r.absent);

  // For async (Relax), derive final stats from the live snapshot rounds; for sync/
  // daily/practice, keep the REST allRoundResults fallback unchanged.
  const isAsyncResults = snapshot.config.mode === "async";
  const effectiveResults = useMemo<AllRoundResult[]>(() => {
    if (isAsyncResults) {
      return snapshot.rounds.flatMap((round, roundIndex) =>
        Object.entries(round.playerRoundResults ?? {})
          .map(([playerId, r]) => ({
            playerId,
            roundIndex,
            score: r.score,
            rank: r.rank,
            distanceKm: r.distanceKm,
            yearDiff: r.yearDiff,
            locationScore: r.locationScore,
            timeScore: r.timeScore,
            didSubmit: r.didSubmit,
            region: r.region ?? round.region ?? null,
            absent: r.absent ?? false,
          }))
          .filter((r) => hasResult(r))
      );
    }
    return (allRoundResults ?? []).filter((r) => hasResult(r));
  }, [isAsyncResults, snapshot.rounds, allRoundResults]);

  // Scroll final results to top once the session reaches completion.
  useEffect(() => {
    if (snapshot?.status === "SESSION_COMPLETE") {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [snapshot?.status]);

  // Fetch viewer's global total XP for the rank title progress card
  // (single source of truth: player_global_stats.total_xp → rankForXp → RankCard)
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: stats } = await supabaseBrowser
          .from('player_global_stats')
          .select('total_xp')
          .eq('player_id', playerId)
          .single();
        if (cancelled) return;
        if (stats) setTotalXp(Number(stats.total_xp));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  // Fetch the global all-players Daily leaderboard once the session completes.
  useEffect(() => {
    if (!isDaily || snapshot.status !== "SESSION_COMPLETE") return;
    let cancelled = false;
    setDailyLoading(true);
    setDailyError(null);
    (async () => {
      try {
        const response = await fetch("/api/daily/results");
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load daily results");
        }
        const json = await response.json();
        if (cancelled) return;
        setDailyResults(json.rows ?? []);
      } catch (error) {
        console.error("Failed to fetch daily results:", error);
        if (!cancelled) {
          setDailyError(error instanceof Error ? error.message : "Failed to load daily results");
        }
      } finally {
        if (!cancelled) setDailyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isDaily, snapshot.status, dailyRetryCount]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isHost = snapshot.players?.find((p: any) => p.playerId === playerId)?.isHost ?? false;
  const deadlinePassed = snapshot.config.mode === "async" && snapshot.config.sessionDeadline !== null && new Date(snapshot.config.sessionDeadline).getTime() < Date.now();

  const handlePlayAgain = async () => {
    if (!playerId) return;
    if (!isHost) return;

    setIsCreatingLobby(true);
    setLobbyError(null);
    try {
      const currentDisplayName = playerLabel(snapshot.players, playerId);
      const response = await fetch("/api/compete/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          displayName: currentDisplayName,
          mode: snapshot.config.mode,
          roundTimerSec: snapshot.config.roundTimerSec,
          yearMin: snapshot.config.yearMin,
          yearMax: snapshot.config.yearMax,
          resultsAutoAdvanceSec: snapshot.config.resultsAutoAdvanceSec,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('failed_lobby'));
      }
      const data = await response.json();
      // Broadcast PLAY_AGAIN to the current room. Navigation is triggered by the
      // echoed PLAY_AGAIN message via CompeteGamePage's useCompeteSocket
      // onPlayAgain callback, so the broadcast is delivered to all guests before
      // the host disconnects to join the new lobby.
      sendMessage({ type: "PLAY_AGAIN", playerId, newGameId: data.gameId });
    } catch (error) {
      console.error("Failed to create lobby:", error);
      setLobbyError(t('failed_lobby_retry'));
      setIsCreatingLobby(false);
    }
  };

  const handleGuestCreateGame = async () => {
    const currentDisplayName = playerLabel(snapshot.players, playerId ?? "");
    if (!playerId || !currentDisplayName) {
      router.push("/home");
      return;
    }
    setIsCreatingLobby(true);
    setLobbyError(null);
    try {
      const gameId = await createAsyncCompeteSession(playerId, currentDisplayName);
      router.push('/compete/' + gameId);
    } catch (error) {
      console.error("Failed to create game:", error);
      setLobbyError(t('failed_lobby_retry'));
      setIsCreatingLobby(false);
    }
  };

  const handleShareLink = async () => {
    try {
      const link = typeof window !== "undefined" ? window.location.href : "";
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Helper: compute derived stats for a player
  const computePlayerStats = (pid: string) => {
    if (!effectiveResults) return null;
    const playerResults = effectiveResults.filter(r => r.playerId === pid && hasResult(r));
    if (playerResults.length === 0) return null;

    const totalScore = playerResults.reduce((sum, r) => sum + r.score, 0);
    const totalLocationScore = playerResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0);
    const totalYearScore = playerResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0);
    const bestRoundResult = playerResults.reduce((best, r) => (r.score > best.score ? r : best), playerResults[0]);
    const bestRoundScore = bestRoundResult.score;
    const bestRoundAccuracy = ((bestRoundResult.locationScore ?? 0) + (bestRoundResult.timeScore ?? 0)) / 2;
    const avgAccuracy = playerResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / playerResults.length;
    const avgLocationAccuracy = playerResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / playerResults.length;
    const avgYearAccuracy = playerResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / playerResults.length;
    const avgConsistency = playerResults.reduce((sum, r) => sum + Math.min(r.locationScore ?? 0, r.timeScore ?? 0), 0) / playerResults.length;
    const avgDistanceKm = playerResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0) / playerResults.length;
    const avgYearDiff = playerResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0) / playerResults.length;

    return { totalScore, totalLocationScore, totalYearScore, bestRoundScore, bestRoundAccuracy, avgAccuracy, avgLocationAccuracy, avgYearAccuracy, avgConsistency, avgDistanceKm, avgYearDiff };
  };

  // Helper: compute per-round stats for all players
  const computeRoundStats = (roundIndex: number) => {
    if (!effectiveResults) return null;
    const roundResults = effectiveResults.filter(r => r.roundIndex === roundIndex && hasResult(r));
    if (roundResults.length === 0) {
      return { avgAccuracy: 0, avgLocationScore: 0, avgTimeScore: 0, avgDistanceKm: 0, avgYearDiff: 0, totalScore: 0, bestPlayerId: null };
    }

    const avgAccuracy = roundResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / roundResults.length;
    const avgLocationScore = roundResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / roundResults.length;
    const avgTimeScore = roundResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / roundResults.length;
    const avgDistanceKm = roundResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0) / roundResults.length;
    const avgYearDiff = roundResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0) / roundResults.length;
    const totalScore = roundResults.reduce((sum, r) => sum + r.score, 0);
    const bestPlayer = roundResults.length > 0
      ? roundResults.reduce((best, r) => r.score > best.score ? r : best, roundResults[0])
      : null;

    return { avgAccuracy, avgLocationScore, avgTimeScore, avgDistanceKm, avgYearDiff, totalScore, bestPlayerId: bestPlayer?.playerId ?? null };
  };

  return (
    <section className={styles.section} data-testid="session-complete-section" data-status={snapshot.status}>
      {(() => {
        if (!playerId) return null;
        if (effectiveResults.length === 0) {
          if (allRoundResultsError) {
            return (
              <div className={styles.content}>
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.accentBar} />
                    <h2 className={styles.cardTitle}>{tGame('session_complete')}</h2>
                  </div>
                  <p style={{ padding: 24, textAlign: 'center', color: 'var(--gh-text-secondary)' }}>{allRoundResultsError}</p>
                  <div className={styles.cta}>
                    {onRetryAllResults && (
                      <button type="button" className={styles.playBtn} onClick={onRetryAllResults}>
                        {tGame('retry')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className={styles.content}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{tGame('session_complete')}</h2>
                </div>
                <p style={{ padding: 24, textAlign: 'center', color: 'var(--gh-text-secondary)' }}>{tGame('loading')}</p>
              </div>
            </div>
          );
        }
        const myStats = computePlayerStats(playerId);
        const overallAccuracy = myStats?.avgAccuracy ?? 0;
        const overallXP = myStats?.totalScore ?? 0;
        const whereAccuracy = myStats?.avgLocationAccuracy ?? 0;
        const whenAccuracy = myStats?.avgYearAccuracy ?? 0;
        const avgDistanceKm = myStats?.avgDistanceKm ?? 0;
        const avgYearDiff = myStats?.avgYearDiff ?? 0;

        const roundWinners = new Map<number, string[]>();
        for (let i = 0; i < snapshot.config.totalRounds; i++) {
          const roundResults = effectiveResults.filter(r => r.roundIndex === i);
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
              if (winners?.includes(p.playerId)) wonRounds.push(i);
            }
            return {
              playerId: p.playerId,
              displayName: p.displayName,
              totalScore: stats?.totalScore ?? 0,
              avgAccuracy: stats?.avgAccuracy ?? 0,
              hasPlayed: stats != null,
              wonRounds,
              roundStatus: p.roundStatus,
              currentRoundIndex: p.currentRoundIndex,
            };
          })
          // Relax (async): append pending invitees so they render as "Invited".
          // They carry no results → avgAccuracy 0 → sort to the bottom naturally.
          .concat(isAsyncResults ? snapshot.pendingInvitees.map(pi => ({
            playerId: pi.playerId,
            displayName: pi.displayName,
            totalScore: 0,
            avgAccuracy: 0,
            hasPlayed: false,
            wonRounds: [] as number[],
            roundStatus: 'invited' as const,
            currentRoundIndex: null,
          })) : [])
          // Rank by accuracy% only (desc). totalScore is a deterministic tiebreaker
          // for exactly equal accuracy (spec §5.10 / GAME_MODES_SPEC amendment).
          .sort((a, b) => {
            if (b.avgAccuracy !== a.avgAccuracy) return b.avgAccuracy - a.avgAccuracy;
            return b.totalScore - a.totalScore;
          });

        const myRank = leaderboard.findIndex(p => p.playerId === playerId) + 1;
        const wonRoundsByMe = leaderboard.find(p => p.playerId === playerId)?.wonRounds.length ?? 0;
        const rankSuffix = (n: number) => n === 1 ? tGame('rank_st') : n === 2 ? tGame('rank_nd') : n === 3 ? tGame('rank_rd') : tGame('rank_th');

        // ── MVP Awards ──
        type MvpPlayer = {
          playerId: string;
          avatarUrl: string | null;
          displayName: string;
          isMe: boolean;
          stats: NonNullable<ReturnType<typeof computePlayerStats>>;
          totalScore: number;
          totalDistanceKm: number;
          totalYearDiff: number;
          roundCount: number;
        };

        const mvpPlayers: MvpPlayer[] = snapshot.players
          .map((p) => {
            const playerResults = effectiveResults.filter((r) => r.playerId === p.playerId);
            const stats = computePlayerStats(p.playerId);
            if (!stats) return null;
            return {
              playerId: p.playerId,
              avatarUrl: p.avatarUrl ?? null,
              displayName: playerLabel(snapshot.players, p.playerId),
              isMe: p.playerId === playerId,
              stats,
              totalScore: stats.totalScore,
              totalDistanceKm: playerResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0),
              totalYearDiff: playerResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0),
              roundCount: playerResults.length,
            };
          })
          .filter((p): p is MvpPlayer => p !== null && p.roundCount === snapshot.config.totalRounds);

        type IconComponent = React.ComponentType<{ size?: number | string; className?: string }>;

        type MvpCategory = {
          key: string;
          label: string;
          icon: IconComponent;
          getValue: (stats: MvpPlayer['stats']) => number;
        };

        const mvpCategories: MvpCategory[] = [
          { key: 'year', label: tGame('mvp_year'), icon: WhenIcon, getValue: (s: MvpPlayer['stats']) => s.avgYearAccuracy },
          { key: 'location', label: tGame('mvp_location'), icon: WhereIcon, getValue: (s: MvpPlayer['stats']) => s.avgLocationAccuracy },
          { key: 'consistency', label: tGame('mvp_consistency'), icon: TrendingUp, getValue: (s: MvpPlayer['stats']) => s.avgConsistency },
          { key: 'bestRound', label: tGame('mvp_best_round'), icon: Trophy, getValue: (s: MvpPlayer['stats']) => s.bestRoundAccuracy },
        ];

        const mvpAwards = mvpCategories
          .map((cat) => {
            if (mvpPlayers.length === 0) return null;
            const sorted = [...mvpPlayers].sort((a, b) => {
              const aVal = cat.getValue(a.stats);
              const bVal = cat.getValue(b.stats);
              if (bVal !== aVal) return bVal - aVal;
              if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
              if (a.totalDistanceKm !== b.totalDistanceKm) return a.totalDistanceKm - b.totalDistanceKm;
              if (a.totalYearDiff !== b.totalYearDiff) return a.totalYearDiff - b.totalYearDiff;
              return 0;
            });
            const first = sorted[0];
            const winners = cat.key === 'bestRound'
              ? sorted.filter((p) => cat.getValue(p.stats) === cat.getValue(first.stats))
              : sorted.filter((p) => (
                  cat.getValue(p.stats) === cat.getValue(first.stats) &&
                  p.totalScore === first.totalScore &&
                  p.totalDistanceKm === first.totalDistanceKm &&
                  p.totalYearDiff === first.totalYearDiff
                ));
            return { ...cat, winners };
          })
          .filter((award): award is MvpCategory & { winners: MvpPlayer[] } => award !== null);

        // ── Achievements: badges, XP per era/region, stats ──
        const myRoundResults = effectiveResults.filter(r => r.playerId === playerId);
        const eraForYear = (year: number): string => {
          if (year < 476) return 'era_ancient';
          if (year < 1492) return 'era_medieval';
          if (year < 1789) return 'era_earlymodern';
          if (year < 1945) return 'era_modern';
          return 'era_contemporary';
        };
        // Era display metadata — mirrors the lobby era rail (LobbySection ERAS)
        // so the final-results "When" breakdown uses the same icons, year spans,
        // stock images, and chronological ordering as the lobby.
        const ERA_META: Record<string, { icon: string; span: string; order: number; stockImg: string }> = {
          era_ancient:      { icon: '🏛️', span: '-3000 – 476',  order: 0, stockImg: ERA_STOCK_IMAGES.ancient },
          era_medieval:     { icon: '⚔️', span: '476 – 1492',   order: 1, stockImg: ERA_STOCK_IMAGES.medieval },
          era_earlymodern:  { icon: '⛵', span: '1492 – 1789',  order: 2, stockImg: ERA_STOCK_IMAGES.earlymodern },
          era_modern:       { icon: '🏭', span: '1789 – 1945',  order: 3, stockImg: ERA_STOCK_IMAGES.modern },
          era_contemporary: { icon: '🚀', span: '1945 – 2025',  order: 4, stockImg: ERA_STOCK_IMAGES.contemporary },
        };

        // Region display metadata — mirrors the lobby region rail (LobbySection REGIONS)
        // so the final-results "Where" breakdown uses the same icons, stock images,
        // and ordering as the lobby. Keyed by continent name (the value stored in
        // AllRoundResult.region), matching the lobby's REGIONS[].continents mapping.
        const REGION_META: Record<string, { icon: string; stockImg: string; order: number }> = {
          'Europe':         { icon: '🏰', stockImg: REGION_STOCK_IMAGES.europe,             order: 0 },
          'Asia':           { icon: '🏯', stockImg: REGION_STOCK_IMAGES.asia,               order: 1 },
          'North America':  { icon: '🗽', stockImg: REGION_STOCK_IMAGES.north_america,      order: 2 },
          'South America':  { icon: '🦜', stockImg: REGION_STOCK_IMAGES.south_america,      order: 3 },
          'Africa':         { icon: '🌍', stockImg: REGION_STOCK_IMAGES.africa,             order: 4 },
          'Oceania':        { icon: '🏝️', stockImg: REGION_STOCK_IMAGES.oceania_antarctica, order: 5 },
          'Antarctica':     { icon: '🏝️', stockImg: REGION_STOCK_IMAGES.oceania_antarctica, order: 5 },
        };

        // Aggregate badges across all rounds by dimension + tier
        const badgeCountsByTier: Record<BadgeDimension, Record<BadgeTier, number>> = {
          location: { gold: 0, silver: 0, bronze: 0 },
          year: { gold: 0, silver: 0, bronze: 0 },
          combo: { gold: 0, silver: 0, bronze: 0 },
        };
        for (const r of myRoundResults) {
          const loc = r.locationScore ?? 0;
          const time = r.timeScore ?? 0;
          const combo = (loc + time) / 2;
          const badges = calculateBadges({ yearAccuracy: time, locationAccuracy: loc, comboAccuracy: combo });
          for (const b of badges) {
            badgeCountsByTier[b.dimension][b.tier]++;
          }
        }
        const earnedBadges = BADGE_DIMENSIONS.flatMap((dim) =>
          BADGE_TIERS.filter((tier) => badgeCountsByTier[dim][tier] > 0)
            .map((tier) => ({ dim, tier, count: badgeCountsByTier[dim][tier] }))
        );

        // XP per era (for ExperienceAccuracy component)
        const byWhenMap = new Map<string, { totalXp: number; totalAcc: number; roundCount: number }>();
        for (const r of myRoundResults) {
          const round = snapshot.rounds[r.roundIndex];
          if (!round) continue;
          const eraKey = eraForYear(round.year);
          const acc = ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2;
          const existing = byWhenMap.get(eraKey) ?? { totalXp: 0, totalAcc: 0, roundCount: 0 };
          existing.totalXp += r.score;
          existing.totalAcc += acc;
          existing.roundCount++;
          byWhenMap.set(eraKey, existing);
        }
        const byWhen = [...byWhenMap.entries()]
          .sort(([, a], [, b]) => b.totalXp - a.totalXp)
          .map(([eraKey, val]) => ({
            label: tGame(eraKey),
            avgAccuracy: Math.round(val.totalAcc / val.roundCount),
            totalXp: val.totalXp,
            roundCount: val.roundCount,
            icon: ERA_META[eraKey]?.icon,
            span: ERA_META[eraKey]?.span,
            stockImg: ERA_META[eraKey]?.stockImg,
          }));

        // XP per region (for ExperienceAccuracy component)
        const byWhereMap = new Map<string, { totalXp: number; totalAcc: number; roundCount: number }>();
        for (const r of myRoundResults) {
          const region = r.region ?? 'unknown_region';
          const acc = ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2;
          const existing = byWhereMap.get(region) ?? { totalXp: 0, totalAcc: 0, roundCount: 0 };
          existing.totalXp += r.score;
          existing.totalAcc += acc;
          existing.roundCount++;
          byWhereMap.set(region, existing);
        }
        const byWhere = [...byWhereMap.entries()]
          .sort(([, a], [, b]) => b.totalXp - a.totalXp)
          .map(([regionKey, val]) => {
            const meta = REGION_META[regionKey];
            // Use the same i18n key pattern as the lobby: region_<continent_lowered_with_underscores>
            const i18nKey = `region_${regionKey.toLowerCase().replace(/\s+/g, '_')}`;
            return {
              label: meta ? tGame(i18nKey) : (regionKey === 'unknown_region' ? tGame('unknown_region') : regionKey),
              avgAccuracy: Math.round(val.totalAcc / val.roundCount),
              totalXp: val.totalXp,
              roundCount: val.roundCount,
              icon: meta?.icon,
              stockImg: meta?.stockImg,
            };
          });

        const eventsSeenCount = myRoundResults.length;
        const countriesCount = new Set(myRoundResults.map(r => r.region).filter(Boolean)).size;

        // Stats
        const myScores = myRoundResults.map(r => r.score);
        const bestRoundScore = myScores.length > 0 ? Math.max(...myScores) : 0;
        const bestRoundIdx = myRoundResults.findIndex(r => r.score === bestRoundScore);

        return (
          <>
            <div className={styles.content}>
              {/* HERO ACCURACY CARD — banner + ring + Where/When stat tiles */}
              <section className={`${styles.card} ${styles.heroCard}`}>
                <div className={styles.banner}>
                  <span className={styles.bannerKicker}>{tGame('game_complete')}</span>
                  <h1 className={styles.bannerTitle}>
                    {tGame('you_finished')} <span className={styles.bannerRank}>{myRank}{rankSuffix(myRank)}</span>
                  </h1>
                  <div className={styles.bannerStats}>
                    {tGame('rounds_won', { n: wonRoundsByMe, s: wonRoundsByMe === 1 ? "" : "s" })}
                  </div>
                </div>
                <span className={styles.gameAccLabel}>{tGame('game_accuracy_pct')}</span>
                {myStats ? (
                  <div className={styles.heroRingWrap}>
                    <RainbowRing value={Math.ceil(overallAccuracy)} />
                  </div>
                ) : (
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--gh-text-muted)' }}>—</span>
                )}
                <div className={styles.statPair}>
                  <div className={styles.statTile}>
                    <span className={styles.statTileLabelWhere}><WhereIcon size={14} className={styles.statTileIconWhere} />{tGame('where')}</span>
                    {myStats ? (
                      <>
                        <MiniRing value={Math.ceil(whereAccuracy)} color={getAccuracyColor(Math.ceil(whereAccuracy))} />
                      </>
                    ) : (
                      <span className={styles.statTileVal} style={{ color: 'var(--gh-text-muted)' }}>{tGame('not_started')}</span>
                    )}
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statTileLabelWhen}><WhenIcon size={14} className={styles.statTileIconWhen} />{tGame('when')}</span>
                    {myStats ? (
                      <>
                        <MiniRing value={Math.ceil(whenAccuracy)} color={getAccuracyColor(Math.ceil(whenAccuracy))} />
                      </>
                    ) : (
                      <span className={styles.statTileVal} style={{ color: 'var(--gh-text-muted)' }}>{tGame('not_started')}</span>
                    )}
                  </div>
                </div>
              </section>

              <div className={styles.gridZone}>
              {/* FINAL RANKINGS — hidden in practice (solo) mode */}
              {!isPractice && !isDaily && (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{tGame('final_rankings')}</h2>
                </div>
                <div className={styles.ranks}>
                {leaderboard.map((player, index) => {
                  const isCurrentPlayer = player.playerId === playerId;
                  const playerData = snapshot.players.find(p => p.playerId === player.playerId);
                  const displayName = player.displayName || playerLabel(snapshot.players, player.playerId);
                  // Relax (async) player status. Sync (Rush) keeps hasPlayed-only behavior:
                  // roundStatus/currentRoundIndex are undefined there per types.ts.
                  let showAccuracy = player.hasPlayed;
                  let statusLabel: React.ReactNode = null;
                  if (isAsyncResults) {
                    const rs = player.roundStatus;
                    if (rs === 'invited') {
                      showAccuracy = false;
                      statusLabel = tGame('invited');
                    } else if (rs === 'playing') {
                      showAccuracy = true;
                      statusLabel = null;
                    } else if ((rs === 'joined' || rs === 'ready') && !player.hasPlayed) {
                      showAccuracy = false;
                      statusLabel = tGame('not_started');
                    }
                  }
                  return (
                    <div key={player.playerId} className={`${styles.rankRow} ${isCurrentPlayer ? styles.rankRowMe : ""}`} data-testid="session-rank-row">
                      <span className={`${styles.medal} ${index === 0 ? styles.medalGold : index === 1 ? styles.medalSilver : index === 2 ? styles.medalBronze : ""}`}>
                        <span>{index + 1}</span>
                      </span>
                      <div className={styles.avatarWrap}>
                        <PlayerAvatar
                          avatarUrl={playerData?.avatarUrl ?? null}
                          displayName={displayName}
                          playerId={player.playerId}
                          size={38}
                          className={isCurrentPlayer ? styles.avatarMe : undefined}
                        />
                      </div>
                      <div className={styles.rankMain}>
                        <div className={styles.rankNameLine}>
                          <span
                            className={styles.rankName}
                            style={getUsernameGradientStyle(player.playerId)}
                          >
                            {displayName}
                          </span>
                        </div>
                        <div className={styles.bar}>
                          {showAccuracy ? (
                            <div
                              className={styles.barFill}
                              style={{ width: `${Math.max(0, Math.min(100, player.avgAccuracy))}%` }}
                            />
                          ) : null}
                        </div>
                      </div>
                      <div className={styles.rankScore}>
                        {showAccuracy ? (
                          <span className={styles.rankAcc} style={{ color: getAccuracyColor(Math.ceil(player.avgAccuracy)) }}>{Math.ceil(player.avgAccuracy)}<span className={styles.rankPctSuffix}>%</span></span>
                        ) : (
                          <span className={styles.rankStatus}>{statusLabel ?? tGame('not_started')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </section>
              )}

              {isDaily && (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{tGame('final_rankings')}</h2>
                </div>
                {dailyLoading ? (
                  <p style={{ padding: 24, textAlign: 'center', color: 'var(--gh-text-secondary)' }}>{tGame('loading')}</p>
                ) : dailyError ? (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <p style={{ color: 'var(--gh-text-secondary)', marginBottom: 12 }}>{dailyError}</p>
                    <button
                      type="button"
                      className={styles.playBtn}
                      onClick={() => setDailyRetryCount(n => n + 1)}
                    >
                      {tGame('retry')}
                    </button>
                  </div>
                ) : dailyResults && dailyResults.length > 0 ? (
                <div className={styles.ranks}>
                {dailyResults.map((player) => {
                  const isCurrentPlayer = player.player_id === playerId;
                  const displayName = player.display_name || (player.is_ai ? "AI" : "?");
                  return (
                    <div key={player.player_id} className={`${styles.rankRow} ${isCurrentPlayer ? styles.rankRowMe : ""}`} data-testid="daily-rank-row">
                      <span className={`${styles.medal} ${player.rank === 1 ? styles.medalGold : player.rank === 2 ? styles.medalSilver : player.rank === 3 ? styles.medalBronze : ""}`}>
                        <span>{player.rank}</span>
                      </span>
                      <div className={styles.avatarWrap}>
                        <PlayerAvatar
                          avatarUrl={player.avatar_url ?? null}
                          displayName={displayName}
                          playerId={player.player_id}
                          size={38}
                          className={isCurrentPlayer ? styles.avatarMe : undefined}
                        />
                      </div>
                      <div className={styles.rankMain}>
                        <div className={styles.rankNameLine}>
                          <span
                            className={styles.rankName}
                            style={getUsernameGradientStyle(player.player_id)}
                          >
                            {displayName}
                          </span>
                        </div>
                        <div className={styles.bar}>
                          <div
                            className={styles.barFill}
                            style={{ width: `${Math.max(0, Math.min(100, player.avg_accuracy))}%` }}
                          />
                        </div>
                      </div>
                      <div className={styles.rankScore}>
                        <span className={styles.rankAcc} style={{ color: getAccuracyColor(Math.ceil(player.avg_accuracy)) }}>{Math.ceil(player.avg_accuracy)}<AccuracySuffix /></span>
                        <span className={styles.rankXp}>+{player.total_xp} {tGame('xp_unit')}</span>
                      </div>
                    </div>
                  );
                })}
                </div>
                ) : (
                  <p style={{ padding: 24, textAlign: 'center', color: 'var(--gh-text-secondary)' }}>{tGame('not_started')}</p>
                )}
              </section>
              )}

              {!isPractice && snapshot.players.length > 1 && mvpAwards.length > 0 && (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{tGame('best_player')}</h2>
                </div>
                <div className={styles.mvpList}>
                  {mvpAwards.map((award) => (
                    <div key={award.key} className={styles.mvpRow}>
                      <span
                        className={`${styles.mvpDisk} ${
                          award.key === 'year'
                            ? styles.mvpDiskYear
                            : award.key === 'location'
                            ? styles.mvpDiskLocation
                            : styles.mvpDiskOrange
                        }`}
                      >
                        <award.icon size={18} />
                      </span>
                      <span className={styles.mvpLabel}>{award.label}</span>
                      <span className={styles.mvpNames}>
                        {award.winners.map((w, i) => (
                          <span key={w.playerId} className={styles.mvpWinner}>
                            <span className={styles.mvpAvatarWrap}>
                              <PlayerAvatar
                                avatarUrl={w.avatarUrl}
                                displayName={w.displayName}
                                playerId={w.playerId}
                                size={24}
                                className={w.isMe ? styles.avatarMe : undefined}
                              />
                            </span>
                            <span className={styles.mvpName}>
                              {w.displayName}
                            </span>
                            <span className={styles.mvpValue} style={{ color: getAccuracyColor(Math.ceil(award.getValue(w.stats))) }}>
                              {Math.ceil(award.getValue(w.stats))}
                              <AccuracySuffix />
                            </span>
                            {i < award.winners.length - 1 && (
                              <span className={styles.mvpAnd}>{tGame('mvp_and')}</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {/* BADGES & STATS */}
              <div className={styles.achievementsGroup}>
                <section className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.accentBar} />
                    <h2 className={styles.cardTitle}>{tGame('badges_won')}</h2>
                  </div>
                  <div className={styles.achievementsBody}>
                    {earnedBadges.length === 0 ? (
                      <span className={styles.noBadges}>{tGame('no_badges')}</span>
                    ) : (
                      <div className={styles.badgeTally}>
                        {earnedBadges.map(({ dim, tier, count }) => (
                          <span key={`${dim}-${tier}`} className={styles.badgeTallyItem}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/badges/${dim}_${tier}.webp`} alt={`${tGame(BADGE_TIER_LABEL_KEY[tier])} ${tGame(BADGE_DIMENSION_LABEL_KEY[dim])}`} width={28} height={28} />
                            <span className={styles.badgeTallyCount}>{count}</span>
                            <span className={styles.badgeTallyTier}>{tGame(BADGE_DIMENSION_LABEL_KEY[dim])}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.accentBar} />
                    <h2 className={styles.cardTitle}>{tGame('game_stats')}</h2>
                  </div>
                  <div className={styles.achievementsBody}>
                    <div className={styles.gameStatsGrid}>
                      <div className={styles.gameStatTile}>
                        <span className={styles.gameStatVal}>{myStats ? formatDistance(avgDistanceKm, distanceUnit) : '—'}</span>
                        <span className={styles.gameStatLabel}>{tGame('avg_km_away_label')}</span>
                      </div>
                      <div className={styles.gameStatTile}>
                        <span className={styles.gameStatVal}>{myStats ? Math.round(avgYearDiff) : '—'}</span>
                        <span className={styles.gameStatLabel}>{tGame('avg_yrs_off_label')}</span>
                      </div>
                      {bestRoundIdx >= 0 && (
                        <div className={styles.gameStatTile}>
                          <span className={styles.gameStatVal}>{Math.ceil(((myRoundResults[bestRoundIdx].locationScore ?? 0) + (myRoundResults[bestRoundIdx].timeScore ?? 0)) / 2)}</span>
                          <span className={styles.gameStatLabel}>{tGame('best_round_pct')}</span>
                        </div>
                      )}
                      {bestRoundIdx >= 0 && (
                        <div className={styles.gameStatTile}>
                          <span className={styles.gameStatVal}>{bestRoundScore.toLocaleString()}</span>
                          <span className={styles.gameStatLabel}>{tGame('best_round_xp')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* EXPERIENCE & ACCURACY (shared component) — rank card rendered inside,
                  before the when/where tabs */}
              <ExperienceAccuracy
                hideAccuracy
                hideStatsRow
                embedded
                rankCard={(() => {
                  const info = rankForXp(totalXp ?? 0);
                  const title = tRank(info.titleKey);
                  const nextTitle = info.nextTitleKey ? tRank(info.nextTitleKey) : null;
                  return (
                    <div className={styles.customRankCard}>
                      <div className={styles.customRankMedallion}>
                        <span className={styles.customRankTier}>T{info.tier}</span>
                        <span className={styles.customRankStars}>
                          {Array.from({ length: info.tier }, (_, i) => (
                            <Star key={i} size={8} fill="var(--gh-gold)" color="var(--gh-gold)" />
                          ))}
                        </span>
                      </div>
                      <div className={styles.customRankBody}>
                        <div className={styles.customRankHead}>
                          <span className={styles.customRankTitle}>{title}</span>
                          <span className={styles.customRankXpGroup}>
                            <span className={styles.customRankSessionXp}>+{overallXP.toLocaleString()} XP</span>
                            <span className={styles.customRankTotalXp}>{Math.floor(totalXp ?? 0).toLocaleString()} XP</span>
                          </span>
                        </div>
                        <div className={styles.customRankNext}>
                          <span className={styles.customRankNextLabel}>{tRank('next_label')}:</span>
                          {info.isMaxRank ? (
                            <span className={styles.customRankNextTitle}>{tRank('max_rank')}</span>
                          ) : (
                            <>
                              <span className={styles.customRankNextTitle}>{nextTitle}</span>
                              <span className={styles.customRankNextXp}>{info.xpToNext?.toLocaleString()} XP</span>
                            </>
                          )}
                        </div>
                        <div className={styles.customRankBar}>
                          <div className={styles.customRankBarFill} style={{ width: `${info.progressPct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
                data={{
                  byWhen,
                  byWhere,
                  eventsSeenCount,
                  countriesCount,
                  roundsPlayed: myRoundResults.length,
                }}
              />

              {/* ROUND BREAKDOWN */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{tGame('round_breakdown')}</h2>
                </div>
                <div className={styles.roundList}>
                {(() => {
                  return snapshot.rounds.map((round, i) => {
                  const roundStats = computeRoundStats(i) ?? {
                    avgAccuracy: 0, avgLocationScore: 0, avgTimeScore: 0,
                    avgDistanceKm: 0, avgYearDiff: 0, totalScore: 0, bestPlayerId: null
                  };
                  const bestPlayerName = roundStats.bestPlayerId ? playerLabel(snapshot.players, roundStats.bestPlayerId) : null;
                  const bestPlayerData = roundStats.bestPlayerId ? snapshot.players.find(p => p.playerId === roundStats.bestPlayerId) : null;
                  const isCurrentBestPlayer = roundStats.bestPlayerId !== null && roundStats.bestPlayerId === playerId;
                  const myRoundResult = effectiveResults.find(r => r.roundIndex === i && r.playerId === playerId);
                  const myRoundAcc = hasResult(myRoundResult)
                    ? ((myRoundResult!.locationScore ?? 0) + (myRoundResult!.timeScore ?? 0)) / 2
                    : null;
                  const open = openRounds.has(i);
                  return (
                    <div key={i} className={`${styles.roundItem} ${open ? styles.roundItemOpen : ""}`}>
                      <button
                        type="button"
                        className={styles.roundTop}
                        onClick={() => setOpenRounds(prev => {
                          const next = new Set(prev);
                          if (next.has(i)) { next.delete(i); } else { next.add(i); }
                          return next;
                        })}
                        aria-expanded={open}
                      >
                        <span className={styles.roundNum}>R{i + 1}</span>
                        <div className={styles.roundInfo}>
                          <span className={styles.roundTitle}>{round.title}</span>
                          <span className={styles.roundMeta}>{round.year} · {round.locationName || (round.latitude != null && round.longitude != null ? `${round.latitude.toFixed(2)}, ${round.longitude.toFixed(2)}` : '—')}</span>
                        </div>
                        {myRoundAcc != null && (
                          <span className={styles.roundMyAcc} style={{ color: getAccuracyColor(Math.ceil(myRoundAcc)) }}>
                            {Math.ceil(myRoundAcc)}
                            <AccuracySuffix />
                          </span>
                        )}
                        <span className={styles.chev} style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
                      </button>

                      {open && (
                        <div className={styles.roundDetail}>
                          {round.imageUrl && (
                            <div className={styles.photo}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={toProxiedImageUrl(round.imageUrl) ?? ''}
                                alt={round.title}
                                onClick={() => { setViewerSrc(toProxiedImageUrl(round.imageUrl) ?? ''); setViewerAlt(round.title); }}
                              />
                            </div>
                          )}
                          <div className={styles.miniGrid}>
                            <div className={styles.miniTile}>
                              <span className={styles.miniVal} style={{ color: getAccuracyColor(Math.ceil(roundStats.avgAccuracy)) }}>
                                {Math.ceil(roundStats.avgAccuracy)}
                                <AccuracySuffix />
                              </span>
                              <span className={styles.miniLabel}>{tGame('total')}</span>
                              <span className={styles.miniSub}>{roundStats.totalScore.toLocaleString()} {tGame('xp_unit')}</span>
                            </div>
                            <div className={styles.miniTile}>
                              <span className={styles.miniVal} style={{ color: getAccuracyColor(Math.ceil(roundStats.avgLocationScore)) }}>
                                {Math.ceil(roundStats.avgLocationScore)}
                                <AccuracySuffix />
                              </span>
                              <span className={styles.miniLabelWhere}><WhereIcon size={14} className={styles.miniIconWhere} />{tGame('where')}</span>
                              <span className={styles.miniSub}>{tGame('distance_label', { distance: formatDistance(roundStats.avgDistanceKm, distanceUnit) })}</span>
                            </div>
                            <div className={styles.miniTile}>
                              <span className={styles.miniVal} style={{ color: getAccuracyColor(Math.ceil(roundStats.avgTimeScore)) }}>
                                {Math.ceil(roundStats.avgTimeScore)}
                                <AccuracySuffix />
                              </span>
                              <span className={styles.miniLabelWhen}><WhenIcon size={14} className={styles.miniIconWhen} />{tGame('when')}</span>
                              <span className={styles.miniSub}>{tGame('year_diff_label', { n: Math.round(roundStats.avgYearDiff) })}</span>
                            </div>
                          </div>

                          {bestPlayerName && (
                            <div className={`${styles.bestRow} ${isCurrentBestPlayer ? styles.bestRowMe : ""}`}>
                              <span className={styles.bestLabel}>🏆 {tGame('best_player')}</span>
                              <span className={styles.bestPlayerRight}>
                                <span className={styles.bestAvatarWrap}>
                                  <PlayerAvatar
                                    avatarUrl={bestPlayerData?.avatarUrl ?? null}
                                    displayName={bestPlayerName}
                                    playerId={roundStats.bestPlayerId ?? undefined}
                                    size={24}
                                    className={isCurrentBestPlayer ? styles.avatarMe : undefined}
                                  />
                                </span>
                                <span className={`${styles.bestName} ${isCurrentBestPlayer ? styles.bestNameMe : ""}`}>
                                  {bestPlayerName}
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
                })()}
                </div>
              </section>
              </div>

              <div className={styles.dockSpacer} />

              {/* BOTTOM CTA */}
              <div className={styles.cta}>
                <button
                  type="button"
                  className={styles.homeBtn}
                  onClick={() => router.push("/home")}
                >
                  {tGame('home')}
                </button>
                {isAsync && (!snapshot.config.sessionDeadline || new Date(snapshot.config.sessionDeadline) > new Date()) && (
                  <button
                    type="button"
                    className={styles.ctaSecondary}
                    onClick={handleShareLink}
                    data-testid="session-share-link"
                  >
                    {linkCopied ? tLobby('link_copied') : tLobby('copy_link')}
                  </button>
                )}
                {!isDaily && (isHost ? (
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={onPlayAgain ?? handlePlayAgain}
                    disabled={isCreatingLobby}
                    data-testid="session-play-again-btn"
                  >
                    {isCreatingLobby ? tGame('creating_lobby') : tGame('play_again')}
                  </button>
                ) : deadlinePassed ? (
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={handleGuestCreateGame}
                    disabled={isCreatingLobby}
                    data-testid="session-guest-create-game-btn"
                  >
                    {isCreatingLobby ? tGame('creating_lobby') : tGame('create_game')}
                  </button>
                ) : (
                  <GuestPlayAgainButton styles={styles} />
                ))}
                {lobbyError && (
                  <div className={styles.lobbyError}>{lobbyError}</div>
                )}
              </div>
            </div>
          </>
        );
      })()}
      {viewerSrc && (
        <FullscreenImageViewer
          src={viewerSrc}
          alt={viewerAlt}
          onClose={() => setViewerSrc(null)}
        />
      )}
    </section>
  );
}

function GuestPlayAgainButton({ styles }: { styles: Record<string, string> }) {
  const t = useTranslations('game');
  const [waiting, setWaiting] = useState(false);
  return (
    <button
      type="button"
      className={`${styles.playBtn} ${waiting ? styles.playBtnWaiting : ""}`}
      onClick={() => setWaiting(true)}
      disabled={waiting}
    >
      {waiting ? t('waiting_for_host') : t('play_again')}
    </button>
  );
}
