"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from 'next-intl';
import RainbowRing from "@/components/compete/RainbowRing";
import FullscreenImageViewer from "@/components/FullscreenImageViewer";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { AllRoundResult } from "@/core/competeTypes";
import { getUsernameGradientStyle, playerLabel } from "@/core/competeUtils";
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
    <section className={styles.section}>
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
            if (b.avgAccuracy !== a.avgAccuracy) return b.avgAccuracy - a.avgAccuracy;
            return b.totalScore - a.totalScore;
          });

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
                  aria-label="Open profile menu"
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
              {/* HERO ACCURACY CARD */}
              <div className={styles.scoreGrid}>
                <div className={`${styles.scoreHero} ${styles.card}`}>
                  <RainbowRing value={overallAccuracy} />
                  <div className={styles.xp}>{overallXP} XP</div>
                </div>

                {/* WHERE / WHEN SUB-CARDS */}
                <div className={styles.statGrid}>
                  <div className={styles.statCard}>
                    <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
                      <circle cx={12} cy={10} r={2.5} />
                    </svg>
                    <div className={styles.percentLine}>
                      <span className={styles.statNumber} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, whereAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{whereAccuracy}</span>
                      <span className={styles.statSymbol}>%</span>
                    </div>
                    <div className={styles.statSub}>avg {Math.round(avgDistanceKm)} km away</div>
                  </div>
                  <div className={styles.statCard}>
                    <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x={4} y={5} width={16} height={15} rx={2} />
                      <path d="M8 3v4M16 3v4M4 10h16" />
                    </svg>
                    <div className={styles.percentLine}>
                      <span className={styles.statNumber} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, whenAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{whenAccuracy}</span>
                      <span className={styles.statSymbol}>%</span>
                    </div>
                    <div className={styles.statSub}>avg {Math.round(avgYearDiff)} yrs off</div>
                  </div>
                </div>
              </div>

              {/* LEADERBOARD */}
              <div className={styles.panel}>
                <div className={styles.panelHeading}>{tGame('final_rankings')}</div>
                {leaderboard.map((player, index) => {
                  const isCurrentPlayer = player.playerId === playerId;
                  const playerData = snapshot.players.find(p => p.playerId === player.playerId);
                  const displayName = playerLabel(snapshot.players, player.playerId);
                  const firstLetter = displayName ? displayName.charAt(0).toUpperCase() : "?";
                  return (
                    <div key={player.playerId} className={styles.rankRow}>
                      <div className={styles.rankNum}>{index + 1}</div>
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
                        {isCurrentPlayer && <span className={styles.youDot} />}
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
                        </div>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${Math.max(0, Math.min(100, player.avgAccuracy))}%` }}
                          />
                        </div>
                      </div>
                      <div className={styles.rankScore}>
                        <div className={styles.rankPercent}>
                          <span style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, player.avgAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{player.avgAccuracy}</span>
                          <span className={styles.rankPercentSymbol}>%</span>
                        </div>
                        <div className={styles.rankXp}>{player.totalScore} XP</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ROUND BREAKDOWN */}
              <div className={styles.roundsHeading}>{tGame('round_breakdown')}</div>
              <div className={styles.rounds}>
                {(() => {
                  return snapshot.rounds.map((round, i) => {
                  const roundStats = computeRoundStats(i) ?? {
                    avgAccuracy: 0, avgLocationScore: 0, avgTimeScore: 0,
                    avgDistanceKm: 0, avgYearDiff: 0, totalScore: 0, bestPlayerId: null
                  };
                  const bestPlayerName = roundStats.bestPlayerId ? playerLabel(snapshot.players, roundStats.bestPlayerId) : null;
                  const isCurrentBestPlayer = roundStats.bestPlayerId !== null && roundStats.bestPlayerId === playerId;
                  return (
                    <div key={i} className={styles.roundCard}>
                      <button
                        type="button"
                        className={styles.roundCardHeader}
                        onClick={() => setOpenRounds(prev => {
                          const next = new Set(prev);
                          if (next.has(i)) { next.delete(i); } else { next.add(i); }
                          return next;
                        })}
                        aria-expanded={openRounds.has(i)}
                      >
                        <span className={styles.roundCardHeaderLabel}>{tGame('round_label_short', { n: i + 1 })}</span>
                        <span className={styles.roundCardHeaderTitle}>{round.title}</span>
                        <span className={styles.roundCardChevron} aria-hidden="true">
                          {openRounds.has(i) ? '▲' : '▼'}
                        </span>
                      </button>

                      {openRounds.has(i) && (
                        <>
                          <div className={styles.photo}>
                            {round.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={round.imageUrl}
                                alt={round.title}
                                onClick={() => { setViewerSrc(round.imageUrl); setViewerAlt(round.title); }}
                                style={{ cursor: 'pointer' }}
                              />
                            ) : (
                              <div className={styles.photoFallback}>
                                {round.locationName || `${round.latitude.toFixed(2)}, ${round.longitude.toFixed(2)}`} · {round.year}
                              </div>
                            )}
                          </div>

                          <div className={styles.roundBody}>
                            <div className={styles.miniGrid}>
                              <div className={styles.miniTile}>
                                <div className={styles.percentLine}>
                                  <span className={styles.miniNumber} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgAccuracy}</span>
                                  <span className={styles.miniSymbol}>%</span>
                                </div>
                                <div className={styles.miniLabel}>{tGame('total')}</div>
                                <div className={styles.miniSub}>{roundStats.totalScore} pts</div>
                              </div>

                              <div className={`${styles.miniTile} ${styles.miniTileWhere}`}>
                                <img src="/badges/where.webp" alt="where" width={24} height={24} style={{ display: 'block', margin: '0 auto 2px' }} />
                                <div className={styles.percentLine}>
                                  <span className={styles.miniNumber} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgLocationScore)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgLocationScore}</span>
                                  <span className={styles.miniSymbol}>%</span>
                                </div>
                                <div className={styles.miniLabel}>{tGame('where')}</div>
                                <div className={styles.miniSub}>avg {Math.round(roundStats.avgDistanceKm)} km</div>
                              </div>

                              <div className={`${styles.miniTile} ${styles.miniTileWhen}`}>
                                <img src="/badges/when.webp" alt="when" width={24} height={24} style={{ display: 'block', margin: '0 auto 2px' }} />
                                <div className={styles.percentLine}>
                                  <span className={styles.miniNumber} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgTimeScore)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgTimeScore}</span>
                                  <span className={styles.miniSymbol}>%</span>
                                </div>
                                <div className={styles.miniLabel}>{tGame('when')}</div>
                                <div className={styles.miniSub}>avg {Math.round(roundStats.avgYearDiff)} yrs</div>
                              </div>
                            </div>

                            {bestPlayerName && (
                              <div className={styles.bestRow}>
                                <div className={styles.bestLabel}>
                                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M8 21h8" />
                                    <path d="M12 17v4" />
                                    <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
                                    <path d="M5 6H3a3 3 0 0 0 3 3h1" />
                                    <path d="M19 6h2a3 3 0 0 1-3 3h-1" />
                                  </svg>
                                  {tGame('best_player')}
                                </div>
                                <div className={`${styles.bestName} ${isCurrentBestPlayer ? styles.bestNameHighlight : ""}`}>
                                  {bestPlayerName}
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                });
                })()}
              </div>

              {/* BOTTOM CTA */}
              <div className={styles.cta}>
                <button
                  type="button"
                  className={styles.homeBtn}
                  onClick={() => router.push("/")}
                >
                  {tGame('home')}
                </button>
                {isHost ? (
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={handlePlayAgain}
                    disabled={isCreatingLobby}
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
