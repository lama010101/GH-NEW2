"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from 'next-intl';
import RainbowRing from "@/components/compete/RainbowRing";
import FullscreenImageViewer from "@/components/FullscreenImageViewer";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { AllRoundResult } from "@/core/competeTypes";
import { getUsernameGradientStyle, playerLabel } from "@/core/competeUtils";
import { calculateBadges } from "@/core/rules";
import { NavModal } from "@/components/NavModal";
import styles from "./SessionComplete.module.css";

interface SessionCompleteProps {
  snapshot: CompeteSessionSnapshot;
  playerId: string | null;
  allRoundResults: AllRoundResult[] | null;
  sendMessage: (msg: object) => void;
}

export default function SessionComplete({
  snapshot,
  playerId,
  allRoundResults,
  sendMessage,
}: SessionCompleteProps) {
  const router = useRouter();
  const t = useTranslations('compete_page');
  const tGame = useTranslations('game');
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set([0]));
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [navModalOpen, setNavModalOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerAlt, setViewerAlt] = useState<string>("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isHost = snapshot.players?.find((p: any) => p.playerId === playerId)?.isHost ?? false;

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
          totalRounds: snapshot.config.totalRounds,
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
      sendMessage({ type: "PLAY_AGAIN", playerId, newGameId: data.gameId });
      await new Promise(resolve => setTimeout(resolve, 300));
      router.push(`/compete/${data.gameId}`);
    } catch (error) {
      console.error("Failed to create lobby:", error);
      setLobbyError(t('failed_lobby_retry'));
    } finally {
      setIsCreatingLobby(false);
    }
  };

  // Helper: compute derived stats for a player
  const computePlayerStats = (pid: string) => {
    if (!allRoundResults) return null;
    const playerResults = allRoundResults.filter(r => r.playerId === pid);
    if (playerResults.length === 0) return null;

    const totalScore = playerResults.reduce((sum, r) => sum + r.score, 0);
    const avgAccuracy = Math.round(playerResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / playerResults.length);
    const avgLocationAccuracy = Math.round(playerResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / playerResults.length);
    const avgYearAccuracy = Math.round(playerResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / playerResults.length);
    const avgConsistency = Math.round(playerResults.reduce((sum, r) => sum + Math.min(r.locationScore ?? 0, r.timeScore ?? 0), 0) / playerResults.length);
    const avgDistanceKm = playerResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0) / playerResults.length;
    const avgYearDiff = playerResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0) / playerResults.length;

    return { totalScore, avgAccuracy, avgLocationAccuracy, avgYearAccuracy, avgConsistency, avgDistanceKm, avgYearDiff };
  };

  // Helper: compute per-round stats for all players
  const computeRoundStats = (roundIndex: number) => {
    if (!allRoundResults) return null;
    const roundResults = allRoundResults.filter(r => r.roundIndex === roundIndex);
    if (roundResults.length === 0) {
      return { avgAccuracy: 0, avgLocationScore: 0, avgTimeScore: 0, avgDistanceKm: 0, avgYearDiff: 0, totalScore: 0, bestPlayerId: null };
    }

    const avgAccuracy = Math.round(roundResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / roundResults.length);
    const avgLocationScore = Math.round(roundResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / roundResults.length);
    const avgTimeScore = Math.round(roundResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / roundResults.length);
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
        if (!playerId || !allRoundResults) return null;
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

        const roundWinners = new Map<number, string[]>();
        for (let i = 0; i < snapshot.config.totalRounds; i++) {
          const roundResults = (allRoundResults ?? []).filter(r => r.roundIndex === i);
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
              wonRounds,
            };
          })
          .sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            return b.avgAccuracy - a.avgAccuracy;
          });

        const myRank = leaderboard.findIndex(p => p.playerId === playerId) + 1;
        const wonRoundsByMe = leaderboard.find(p => p.playerId === playerId)?.wonRounds.length ?? 0;
        const rankSuffix = (n: number) => n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";

        // ── Achievements: badges, XP per era/region, stats ──
        const myRoundResults = (allRoundResults ?? []).filter(r => r.playerId === playerId);
        const eraForYear = (year: number): string => {
          if (year < 476) return 'era_ancient';
          if (year < 1492) return 'era_medieval';
          if (year < 1789) return 'era_earlymodern';
          if (year < 1945) return 'era_modern';
          return 'era_contemporary';
        };

        // Aggregate badges across all rounds
        const badgeCounts = { gold: 0, silver: 0, bronze: 0 };
        for (const r of myRoundResults) {
          const loc = r.locationScore ?? 0;
          const time = r.timeScore ?? 0;
          const combo = (loc + time) / 2;
          const badges = calculateBadges({ yearAccuracy: time, locationAccuracy: loc, comboAccuracy: combo });
          for (const b of badges) { badgeCounts[b.tier]++; }
        }

        // XP per era
        const xpPerEra = new Map<string, number>();
        for (const r of myRoundResults) {
          const round = snapshot.rounds[r.roundIndex];
          if (!round) continue;
          const eraKey = eraForYear(round.year);
          xpPerEra.set(eraKey, (xpPerEra.get(eraKey) ?? 0) + r.score);
        }

        // XP per region
        const xpPerRegion = new Map<string, number>();
        for (const r of myRoundResults) {
          const region = r.region ?? 'unknown_region';
          xpPerRegion.set(region, (xpPerRegion.get(region) ?? 0) + r.score);
        }

        // Stats
        const myScores = myRoundResults.map(r => r.score);
        const bestRoundScore = myScores.length > 0 ? Math.max(...myScores) : 0;
        const bestRoundIdx = myRoundResults.findIndex(r => r.score === bestRoundScore);
        const totalDistance = myRoundResults.reduce((s, r) => s + (r.distanceKm ?? 0), 0);
        const consistency = myRoundResults.length > 0
          ? Math.round(100 - (Math.sqrt(myRoundResults.reduce((s, r) => {
              const acc = ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2;
              const mean = myRoundResults.reduce((ms, rr) => ms + ((rr.locationScore ?? 0) + (rr.timeScore ?? 0)) / 2, 0) / myRoundResults.length;
              return s + Math.pow(acc - mean, 2);
            }, 0) / myRoundResults.length)))
          : 0;
        const totalBadges = badgeCounts.gold + badgeCounts.silver + badgeCounts.bronze;

        return (
          <>
            {/* TOP BAR */}
            <div className={styles.topbar}>
              <div className={styles.siteTitle}>{tGame('guess_history')}</div>
              <>
                <button
                  type="button"
                  className={styles.avatarBtn}
                  onClick={() => setNavModalOpen(true)}
                  aria-label={t('open_profile_menu')}
                >
                  {currentPlayerData?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentPlayerData.avatarUrl}
                      alt={currentDisplayName}
                      className={styles.avatarImg}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
                    />
                  ) : null}
                  {currentInitial}
                </button>
                <NavModal
                  isOpen={navModalOpen}
                  onClose={() => setNavModalOpen(false)}
                  avatarUrl={currentPlayerData?.avatarUrl ?? null}
                  initials={currentInitial}
                  displayName={currentDisplayName}
                />
              </>
            </div>

            <div className={styles.content}>
              {/* VICTORY BANNER */}
              <div className={styles.banner}>
                <span className={styles.bannerKicker}>{tGame('game_complete')}</span>
                <h1 className={styles.bannerTitle}>
                  {tGame('you_finished')} <span className={styles.bannerRank}>{myRank}{rankSuffix(myRank)}</span>
                </h1>
                <div className={styles.bannerStats}>
                  <span>{overallXP.toLocaleString()} XP</span>
                  <span className={styles.bannerDot}>·</span>
                  <span>{tGame('rounds_won', { n: wonRoundsByMe, s: wonRoundsByMe === 1 ? "" : "s" })}</span>
                </div>
              </div>

              {/* HERO ACCURACY CARD — ring + Where/When stat tiles */}
              <section className={`${styles.card} ${styles.heroCard}`}>
                <RainbowRing value={overallAccuracy} />
                <div className={styles.statPair}>
                  <div className={styles.statTile}>
                    <span className={styles.statTileLabelWhere}>{tGame('where')}</span>
                    <span className={styles.statTileVal} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, whereAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{whereAccuracy}%</span>
                    <span className={styles.statTileSub}>{t('avg_km_away', { n: Math.round(avgDistanceKm) })}</span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statTileLabelWhen}>{tGame('when')}</span>
                    <span className={styles.statTileVal} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, whenAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{whenAccuracy}%</span>
                    <span className={styles.statTileSub}>{t('avg_yrs_off', { n: Math.round(avgYearDiff) })}</span>
                  </div>
                </div>
              </section>

              {/* FINAL RANKINGS */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{tGame('final_rankings')}</h2>
                </div>
                <div className={styles.ranks}>
                {leaderboard.map((player, index) => {
                  const isCurrentPlayer = player.playerId === playerId;
                  const playerData = snapshot.players.find(p => p.playerId === player.playerId);
                  const displayName = playerLabel(snapshot.players, player.playerId);
                  const firstLetter = displayName ? displayName.charAt(0).toUpperCase() : "?";
                  return (
                    <div key={player.playerId} className={`${styles.rankRow} ${isCurrentPlayer ? styles.rankRowMe : ""}`}>
                      <span className={`${styles.medal} ${index === 0 ? styles.medalGold : index === 1 ? styles.medalSilver : index === 2 ? styles.medalBronze : ""}`}>
                        {index + 1}
                      </span>
                      <div className={styles.avatarWrap}>
                        <div className={styles.rankAvatar}>
                          {playerData?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={playerData.avatarUrl}
                              alt={displayName}
                              className={styles.avatarImg}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }}
                            />
                          ) : null}
                          {firstLetter}
                        </div>
                      </div>
                      <div className={styles.rankMain}>
                        <div className={styles.rankNameLine}>
                          <span
                            className={styles.rankName}
                            style={getUsernameGradientStyle(player.playerId)}
                          >
                            {displayName}
                          </span>
                          {isCurrentPlayer ? <span className={styles.youTag}>{tGame('you')}</span> : null}
                          {player.wonRounds.length > 0 && <span className={styles.winTag}>🏆 {player.wonRounds.length}</span>}
                        </div>
                        <div className={styles.bar}>
                          <div
                            className={styles.barFill}
                            style={{ width: `${Math.max(0, Math.min(100, player.avgAccuracy))}%` }}
                          />
                        </div>
                      </div>
                      <div className={styles.rankScore}>
                        <span className={styles.rankAcc} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, player.avgAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{player.avgAccuracy}%</span>
                        <span className={styles.rankXp}>{player.totalScore.toLocaleString()} XP</span>
                      </div>
                    </div>
                  );
                })}
                </div>
              </section>

              {/* ACHIEVEMENTS — badges, XP per era/region, game stats */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.accentBar} />
                  <h2 className={styles.cardTitle}>{tGame('achievements')}</h2>
                </div>

                <div className={styles.achievementsBody}>
                  {/* Badge totals */}
                  <div className={styles.badgeSummary}>
                    <span className={styles.badgeSummaryLabel}>{tGame('badges_won')}</span>
                    {totalBadges === 0 ? (
                      <span className={styles.noBadges}>{tGame('no_badges')}</span>
                    ) : (
                      <div className={styles.badgeTally}>
                        {badgeCounts.gold > 0 && (
                          <span className={`${styles.badgeTallyItem} ${styles.badgeTallyGold}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/badges/combo_gold.webp" alt="gold" width={28} height={28} />
                            <span className={styles.badgeTallyCount}>{badgeCounts.gold}</span>
                            <span className={styles.badgeTallyTier}>{tGame('gold_badges')}</span>
                          </span>
                        )}
                        {badgeCounts.silver > 0 && (
                          <span className={`${styles.badgeTallyItem} ${styles.badgeTallySilver}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/badges/combo_silver.webp" alt="silver" width={28} height={28} />
                            <span className={styles.badgeTallyCount}>{badgeCounts.silver}</span>
                            <span className={styles.badgeTallyTier}>{tGame('silver_badges')}</span>
                          </span>
                        )}
                        {badgeCounts.bronze > 0 && (
                          <span className={`${styles.badgeTallyItem} ${styles.badgeTallyBronze}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/badges/combo_bronze.webp" alt="bronze" width={28} height={28} />
                            <span className={styles.badgeTallyCount}>{badgeCounts.bronze}</span>
                            <span className={styles.badgeTallyTier}>{tGame('bronze_badges')}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* XP per era */}
                  {xpPerEra.size > 0 && (
                    <div className={styles.statGroup}>
                      <span className={styles.statGroupLabel}>{tGame('xp_per_era')}</span>
                      <div className={styles.statGroupList}>
                        {[...xpPerEra.entries()].sort((a, b) => b[1] - a[1]).map(([eraKey, xp]) => (
                          <div key={eraKey} className={styles.statGroupRow}>
                            <span className={styles.statGroupRowLabel}>{tGame(eraKey)}</span>
                            <span className={styles.statGroupRowBar}>
                              <span className={styles.statGroupRowFill} style={{ width: `${Math.max(4, Math.min(100, (xp / overallXP) * 100))}%` }} />
                            </span>
                            <span className={styles.statGroupRowVal}>+{xp.toLocaleString()} XP</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* XP per region */}
                  {xpPerRegion.size > 0 && (
                    <div className={styles.statGroup}>
                      <span className={styles.statGroupLabel}>{tGame('xp_per_region')}</span>
                      <div className={styles.statGroupList}>
                        {[...xpPerRegion.entries()].sort((a, b) => b[1] - a[1]).map(([regionKey, xp]) => (
                          <div key={regionKey} className={styles.statGroupRow}>
                            <span className={styles.statGroupRowLabel}>{regionKey === 'unknown_region' ? tGame('unknown_region') : regionKey}</span>
                            <span className={styles.statGroupRowBar}>
                              <span className={styles.statGroupRowFill} style={{ width: `${Math.max(4, Math.min(100, (xp / overallXP) * 100))}%` }} />
                            </span>
                            <span className={styles.statGroupRowVal}>+{xp.toLocaleString()} XP</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Game stats grid */}
                  <div className={styles.gameStatsGrid}>
                    <div className={styles.gameStatTile}>
                      <span className={styles.gameStatVal}>{myRoundResults.length}</span>
                      <span className={styles.gameStatLabel}>{tGame('rounds_played')}</span>
                    </div>
                    <div className={styles.gameStatTile}>
                      <span className={styles.gameStatVal}>{Math.round(totalDistance).toLocaleString()} km</span>
                      <span className={styles.gameStatLabel}>{tGame('total_distance')}</span>
                    </div>
                    <div className={styles.gameStatTile}>
                      <span className={styles.gameStatVal}>{consistency}%</span>
                      <span className={styles.gameStatLabel}>{tGame('avg_consistency')}</span>
                    </div>
                    {bestRoundIdx >= 0 && snapshot.rounds[bestRoundIdx] && (
                      <div className={styles.gameStatTile}>
                        <span className={styles.gameStatVal}>{bestRoundScore.toLocaleString()}</span>
                        <span className={styles.gameStatLabel}>{tGame('best_round')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>

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
                  const isCurrentBestPlayer = roundStats.bestPlayerId !== null && roundStats.bestPlayerId === playerId;
                  const myRoundResult = allRoundResults?.find(r => r.roundIndex === i && r.playerId === playerId);
                  const myRoundAcc = myRoundResult ? Math.round(((myRoundResult.locationScore ?? 0) + (myRoundResult.timeScore ?? 0)) / 2) : null;
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
                          <span className={styles.roundMeta}>{round.year} · {round.locationName || `${round.latitude.toFixed(2)}, ${round.longitude.toFixed(2)}`}</span>
                        </div>
                        {myRoundAcc != null && (
                          <span className={styles.roundMyAcc} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, myRoundAcc)) / 100) * 120)}, 100%, 50%)` }}>{myRoundAcc}%</span>
                        )}
                        <span className={styles.chev} style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
                      </button>

                      {open && (
                        <div className={styles.roundDetail}>
                          {round.imageUrl && (
                            <div className={styles.photo}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={round.imageUrl}
                                alt={round.title}
                                onClick={() => { setViewerSrc(round.imageUrl); setViewerAlt(round.title); }}
                              />
                            </div>
                          )}
                          <div className={styles.miniGrid}>
                            <div className={styles.miniTile}>
                              <span className={styles.miniVal} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgAccuracy}%</span>
                              <span className={styles.miniLabel}>{tGame('total')}</span>
                              <span className={styles.miniSub}>{roundStats.totalScore.toLocaleString()} XP</span>
                            </div>
                            <div className={styles.miniTile}>
                              <span className={styles.miniVal} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgLocationScore)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgLocationScore}%</span>
                              <span className={styles.miniLabelWhere}>{tGame('where')}</span>
                              <span className={styles.miniSub}>avg {Math.round(roundStats.avgDistanceKm)} km</span>
                            </div>
                            <div className={styles.miniTile}>
                              <span className={styles.miniVal} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgTimeScore)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgTimeScore}%</span>
                              <span className={styles.miniLabelWhen}>{tGame('when')}</span>
                              <span className={styles.miniSub}>avg {Math.round(roundStats.avgYearDiff)} yrs</span>
                            </div>
                          </div>

                          {bestPlayerName && (
                            <div className={styles.bestRow}>
                              <span className={styles.bestLabel}>🏆 {tGame('best_player')}</span>
                              <span className={`${styles.bestName} ${isCurrentBestPlayer ? styles.bestNameMe : ""}`}>
                                {bestPlayerName}{isCurrentBestPlayer ? ` (${tGame('you')})` : ""}
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
                {isHost ? (
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={handlePlayAgain}
                    disabled={isCreatingLobby}
                    data-testid="session-play-again-btn"
                  >
                    {isCreatingLobby ? tGame('creating_lobby') : tGame('play_again')}
                  </button>
                ) : (
                  <GuestPlayAgainButton styles={styles} />
                )}
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
