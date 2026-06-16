"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import RainbowRing from "@/components/compete/RainbowRing";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import WhereCard from "@/components/compete/WhereCard";
import WhenCard from "@/components/compete/WhenCard";
import InlineImageBadge from "@/components/compete/InlineImageBadge";
import FullscreenImageViewer from "@/components/FullscreenImageViewer";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { RoundResult } from "@/core/competeTypes";
import { getUsernameGradientStyle, haversineKm } from "@/core/competeUtils";
import styles from "./RoundCompleteSection.module.css";

interface RoundCompleteSectionProps {
  snapshot: CompeteSessionSnapshot;
  roundResults: RoundResult[] | null;
  playerId: string | null;
  guessLat: number | null;
  guessLng: number | null;
  submittedHintPenaltyRef: React.MutableRefObject<{
    accPenalty: number;
    xpPenalty: number;
    purchasedIds: string[];
    whereAccPenalty: number;
    whenAccPenalty: number;
  }>;
  whereLbExpanded: boolean;
  setWhereLbExpanded: (v: boolean) => void;
  whenLbExpanded: boolean;
  setWhenLbExpanded: (v: boolean) => void;
  whereCluesExpanded: boolean;
  setWhereCluesExpanded: (v: boolean) => void;
  whenCluesExpanded: boolean;
  setWhenCluesExpanded: (v: boolean) => void;
  resultSecsLeft: number | null;
  onAdvanceRound: () => void;
}

export default function RoundCompleteSection({
  snapshot,
  roundResults,
  playerId,
  guessLat,
  guessLng,
  submittedHintPenaltyRef,
  whereLbExpanded,
  setWhereLbExpanded,
  whenLbExpanded,
  setWhenLbExpanded,
  whereCluesExpanded,
  setWhereCluesExpanded,
  whenCluesExpanded,
  setWhenCluesExpanded,
  resultSecsLeft,
  onAdvanceRound,
}: RoundCompleteSectionProps) {
  const router = useRouter();
  const t = useTranslations('game');

  const accuracyCardRef = useRef<HTMLDivElement>(null);
  const whereCardRef = useRef<HTMLDivElement>(null);
  const whenCardRef = useRef<HTMLDivElement>(null);
  const [histContextOpen, setHistContextOpen] = useState(false);

  const [isAccuracyVisible, setIsAccuracyVisible] = useState(false);
  const [isWhereVisible, setIsWhereVisible] = useState(false);
  const [isWhenVisible, setIsWhenVisible] = useState(false);
  const [isRingDone, setIsRingDone] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerAlt, setViewerAlt] = useState<string>("");
  const [leaderboardTab, setLeaderboardTab] = useState<'thisRound' | 'allRounds'>('thisRound');

  useEffect(() => {
    setIsAccuracyVisible(false);
    setIsWhereVisible(false);
    setIsWhenVisible(false);
    setIsRingDone(false);
  }, [snapshot.currentRoundIndex]);

  useEffect(() => {
    const el = accuracyCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsAccuracyVisible(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = whereCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsWhereVisible(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = whenCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsWhenVisible(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className={styles.container}>
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
            score: r.score,
            cumulativeScore: r.cumulativeScore,
          }));

        const allRoundsLeaderboardRows = (roundResults ?? [])
          .slice()
          .sort((a, b) => b.cumulativeScore - a.cumulativeScore)
          .map((r, i) => ({
            playerId: r.playerId,
            rank: i + 1,
            displayName: snapshot.players.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8),
            accuracy: r.accuracy,
            isMe: r.playerId === playerId,
            score: r.score,
            cumulativeScore: r.cumulativeScore,
          }));
        return (
          <>
            {/* EVENT CARD */}
            <div className={styles.eventCard}>
              <div className={styles.eventTitle}>{round.title}</div>
              {round.imageUrl ? (
                <div className={styles.eventImageWrap} onClick={() => { setViewerSrc(round.imageUrl); setViewerAlt(round.title); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={round.imageUrl}
                    alt={round.title}
                    className={styles.eventImage}
                  />
                </div>
              ) : (
                <div className={styles.eventImagePlaceholder}>No image available</div>
              )}
              <div className={styles.eventMeta}>{correctYear} · {correctName}</div>
              {round.description && (
                <button
                  className={styles.histContextTrigger}
                  onClick={() => setHistContextOpen(true)}
                >
                  <span className={styles.histContextIcon}>📖</span>
                  <span className={styles.histContextLabel}>Historical Context</span>
                  <span className={styles.histContextArrow}>›</span>
                </button>
              )}
              {(round as unknown as { sourceUrl?: string }).sourceUrl && (
                <div className={styles.sourceButtonWrap}>
                  <button
                    className={styles.sourceButton}
                    onClick={() => window.open((round as unknown as { sourceUrl?: string }).sourceUrl, "_blank")}
                  >
                    Source ↗
                  </button>
                </div>
              )}
            </div>

            {/* ACCURACY RING CARD */}
            <div ref={accuracyCardRef} className={styles.accuracyCard}>
              <div className={styles.accuracyRingWrap}>
                <RainbowRing value={accuracy} onComplete={() => setIsRingDone(true)} />
              </div>
              <div className={styles.accuracyXp}>{myResult?.score ?? 0} XP</div>
              {(() => {
                const badge = myResult?.badges?.find(b => b.dimension === 'combo');
                const near  = myResult?.nearMisses?.find(n => n.dimension === 'combo');
                if (!badge && !near) return null;
                if (badge) {
                  return (
                    <InlineImageBadge
                      dimension="combo"
                      tier={badge.tier as 'gold' | 'silver' | 'bronze'}
                      isTriggered={isAccuracyVisible && isRingDone}
                    />
                  );
                }
                return (
                  <span className={styles.nearMissChip}>
                    Near miss
                  </span>
                );
              })()}
              {submittedHintPenaltyRef.current.xpPenalty > 0 && (
                <div className={styles.hintPenaltyBadge}>
                  <span className={styles.hintPenaltyBadgeInner}>{t('hint_penalties')}</span>
                </div>
              )}
            </div>

            {/* ROUND LEADERBOARD CARD */}
            <div className={styles.leaderboardCard}>
              <div className={styles.leaderboardTitle}>{t('round_leaderboard')}</div>
              <div className={styles.leaderboardTabs}>
                <button
                  className={`${styles.leaderboardTab} ${leaderboardTab === 'thisRound' ? styles.leaderboardTabActive : ''}`}
                  onClick={() => setLeaderboardTab('thisRound')}
                >
                  This Round
                </button>
                <button
                  className={`${styles.leaderboardTab} ${leaderboardTab === 'allRounds' ? styles.leaderboardTabActive : ''}`}
                  onClick={() => setLeaderboardTab('allRounds')}
                >
                  All Rounds
                </button>
              </div>
              <div className={styles.leaderboardHeader}>
                <span className={styles.leaderboardHeaderRank}>#</span>
                <span className={styles.leaderboardHeaderName}>Player</span>
                <span className={styles.leaderboardHeaderScore}>{leaderboardTab === 'thisRound' ? 'Score' : 'Total'}</span>
              </div>
              {(leaderboardTab === 'thisRound' ? leaderboardRows : allRoundsLeaderboardRows).map(row => {
                const hue = Math.round((Math.max(0, Math.min(100, row.accuracy)) / 100) * 120);
                const accColor = `hsl(${hue}, 100%, 50%)`;
                const avatarUrl = snapshot.players.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
                const displayValue = leaderboardTab === 'thisRound' ? Math.round(row.accuracy) : row.cumulativeScore;
                const displaySuffix = leaderboardTab === 'thisRound' ? '%' : '';
                return (
                  <div key={row.rank} className={`${styles.lbRow} ${row.isMe ? styles.lbRowSelf : ""}`}>
                    <span className={styles.lbRank}>{row.rank}</span>
                    <span className={styles.lbNameCell}>
                      <span className={styles.lbNameInner}>
                        <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} />
                        <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                          {row.displayName}
                        </span>
                      </span>
                      {row.isMe && <span className={styles.lbYouTag}>(you)</span>}
                    </span>
                    <span className={styles.lbAccPill}>
                      <span style={{ color: accColor, fontSize: "var(--gh-font-base)" }}>{displayValue}</span>
                      <span className={styles.lbAccSuffix}>{displaySuffix}</span>
                    </span>
                  </div>
                );
              })}
              {(leaderboardTab === 'thisRound' ? leaderboardRows : allRoundsLeaderboardRows).length === 0 && (
                snapshot.players.map((p) => {
                  const isMe = p.playerId === playerId;
                  return (
                    <div key={p.playerId} className={`${styles.lbRow} ${isMe ? styles.lbRowSelf : ""}`}>
                      <span className={styles.lbRank}>—</span>
                      <span className={styles.lbNameCell}>
                        <span className={styles.lbNameInner}>
                          <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName || p.playerId.slice(0, 8)} />
                          <span style={{ ...getUsernameGradientStyle(p.playerId), fontWeight: isMe ? 700 : 500 }}>
                            {p.displayName || p.playerId.slice(0, 8)}
                          </span>
                        </span>
                        {isMe && <span className={styles.lbYouTag}>(you)</span>}
                        <span className={styles.lbNoGuessTag}>{t('no_guess')}</span>
                      </span>
                      <span className={styles.lbAccEmpty}>—</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* WHERE + WHEN CARDS */}
            <div className={styles.cardsGrid}>
              <div ref={whereCardRef}><WhereCard
                roundResults={roundResults}
                playerId={playerId}
                correctLat={correctLat}
                correctLng={correctLng}
                correctName={correctName}
                whereAccPenalty={submittedHintPenaltyRef.current.accPenalty}
                guessLat={guessLat}
                guessLng={guessLng}
                myDistanceKm={myDistanceKm}
                whereLbExpanded={whereLbExpanded}
                setWhereLbExpanded={setWhereLbExpanded}
                whereCluesExpanded={whereCluesExpanded}
                setWhereCluesExpanded={setWhereCluesExpanded}
                roundHints={snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? []}
                snapshotPlayers={snapshot.players}
                currentRoundIndex={snapshot.currentRoundIndex}
                isVisible={isWhereVisible}
              /></div>
              <div ref={whenCardRef}><WhenCard
                roundResults={roundResults}
                playerId={playerId}
                correctYear={correctYear}
                whenAccPenalty={submittedHintPenaltyRef.current.whenAccPenalty}
                whenLbExpanded={whenLbExpanded}
                setWhenLbExpanded={setWhenLbExpanded}
                whenCluesExpanded={whenCluesExpanded}
                setWhenCluesExpanded={setWhenCluesExpanded}
                roundHints={snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? []}
                snapshotPlayers={snapshot.players}
                isVisible={isWhenVisible}
              /></div>
            </div>

            {/* HINTS USED CARD */}
            {submittedHintPenaltyRef.current.purchasedIds.length > 0 && (() => {
              const usedHints = (snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? [])
                .filter(h => submittedHintPenaltyRef.current.purchasedIds.includes(h.id))
                .sort((a, b) => a.tier - b.tier);
              if (usedHints.length === 0) return null;
              return (
                <div className={styles.hintsCard}>
                  <div className={styles.hintsTitle}>{t('hints_used')}</div>
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
                      when: { 1: t('hint_century'), 2: t('hint_historical_event'), 3: t('hint_decade'), 4: t('hint_contemporary_event'), 5: t('hint_visual_clues') },
                      where: { 1: t('hint_continent'), 2: t('hint_remote_landmark'), 3: t('hint_region'), 4: t('hint_nearby_landmark'), 5: t('hint_visual_clues') },
                    };
                    const label = labelMap[hint.type]?.[hint.tier] ?? t('hint_label_default');
                    return (
                      <div key={hint.id} className={`${styles.hintRow} ${idx < usedHints.length - 1 ? styles.hintRowDivider : ""}`}>
                        <div className={styles.hintInfo}>
                          <div className={styles.hintTypeLabel}>{label}</div>
                          <div className={styles.hintRevealedText}>{revealedText}</div>
                        </div>
                        <span className={styles.hintPenaltyPill}>
                          −{tierPenaltyAcc}<span className={styles.hintPenaltySuffix}>%</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* COUNTDOWN / READY CARD */}
            {(resultSecsLeft !== null && resultSecsLeft > 0) || (snapshot.readyForNext && snapshot.readyForNext.length > 0) ? (
              <div className={styles.countdownCard}>
                {resultSecsLeft !== null && resultSecsLeft > 0 && (
                  <div className={snapshot.readyForNext && snapshot.readyForNext.length > 0 ? styles.countdownTextWithMargin : styles.countdownText}>
                    Auto-advancing in {resultSecsLeft}s
                  </div>
                )}
                {snapshot.readyForNext && snapshot.readyForNext.length > 0 && (
                  <div className={styles.readyText}>
                    {snapshot.readyForNext.map(pid => {
                      const name = snapshot.players.find(p => p.playerId === pid)?.displayName ?? pid.slice(0, 8);
                      return (
                        <span key={pid} className={styles.readyName}>
                          <span style={getUsernameGradientStyle(pid)}>{name}</span> ✓
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {/* HISTORICAL CONTEXT BOTTOM SHEET */}
            {histContextOpen && round.description && (
              <div className={styles.histSheetOverlay} onClick={() => setHistContextOpen(false)}>
                <div className={styles.histSheet} onClick={e => e.stopPropagation()}>
                  <div className={styles.histSheetHeader}>
                    <span className={styles.histSheetTitle}>Historical Context</span>
                    <button className={styles.histSheetClose} onClick={() => setHistContextOpen(false)}>✕</button>
                  </div>
                  <div className={styles.histSheetBody}>
                    {round.description}
                  </div>
                </div>
              </div>
            )}

            {/* FIXED BOTTOM BAR */}
            <div className={styles.bottomBar}>
              <button className={styles.homeButton} onClick={() => router.push("/")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
                  <polyline points="9 21 9 12 15 12 15 21" />
                </svg>
              </button>
              <div className={styles.progressDots}>
                {Array.from({ length: snapshot.rounds.length }).map((_, i) => {
                  const isDone = i < snapshot.currentRoundIndex;
                  const isCurrent = i === snapshot.currentRoundIndex;
                  return (
                    <div
                      key={i}
                      className={styles.progressDot}
                      style={{
                        "--dot-bg": isDone ? "#f97316" : isCurrent ? "var(--gh-orange)" : "#374151",
                        "--dot-opacity": isCurrent ? 0.7 : 1,
                      } as React.CSSProperties}
                    />
                  );
                })}
                <span className={styles.roundLabel}>
                  Round {snapshot.currentRoundIndex + 1}/{snapshot.rounds.length}
                </span>
              </div>
              <button
                className={`${styles.nextButton} ${snapshot.readyForNext?.includes(playerId ?? "") ? styles.nextButtonDisabled : ""}`}
                onClick={onAdvanceRound}
                disabled={snapshot.readyForNext?.includes(playerId ?? "")}
              >
                Next →
              </button>
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
    </div>
  );
}
