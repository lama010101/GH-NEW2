"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import RainbowRing from "@/components/compete/RainbowRing";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import WhereCard from "@/components/compete/WhereCard";
import WhenCard from "@/components/compete/WhenCard";
import InlineImageBadge from "@/components/compete/InlineImageBadge";
import RatingControl from "@/components/compete/RatingControl";
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

// Small % ring for Where/When mini cards — colored stroke + value text.
// Mirrors the prototype MiniRing visual. Color is passed in (derived from score).
function MiniRing({ value, color }: { value: number; color: string }) {
  const size = 56;
  const sw = 5;
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className={styles.miniRingWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gh-bg-input)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.miniRingVal} style={{ color }}>{Math.round(value)}</span>
    </div>
  );
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
  const [whereWhenTab, setWhereWhenTab] = useState<'where' | 'when'>('where');

  useEffect(() => {
    setIsAccuracyVisible(false);
    setIsWhereVisible(false);
    setIsWhenVisible(false);
    setIsRingDone(false);
    setWhereWhenTab('where');
    // Reset to 'thisRound' tab if 'allRounds' is selected but only 1 round exists
    if (leaderboardTab === 'allRounds' && snapshot.rounds.length <= 1) {
      setLeaderboardTab('thisRound');
    }
  }, [snapshot.currentRoundIndex, snapshot.rounds.length, leaderboardTab]);

  useEffect(() => {
    const el = accuracyCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsAccuracyVisible(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (isWhereVisible) return;
    const el = whereCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsWhereVisible(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [whereWhenTab, isWhereVisible]);

  useEffect(() => {
    if (isWhenVisible) return;
    const el = whenCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsWhenVisible(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [whereWhenTab, isWhenVisible]);

  return (
    <div className={styles.container} data-testid="round-complete-section" data-status={snapshot.status} data-round-index={snapshot.currentRoundIndex}>
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
                <div className={styles.eventImagePlaceholder}>{t('no_image')}</div>
              )}
              <div className={styles.eventMeta}>{correctYear} · {correctName}</div>
              {round.description && (
                <>
                  <button
                    className={styles.histContextTrigger}
                    onClick={() => setHistContextOpen(prev => !prev)}
                    aria-expanded={histContextOpen}
                  >
                    <span className={styles.histContextIcon}>📖</span>
                    <span className={styles.histContextLabel}>{t('hist_context')}</span>
                    <span className={`${styles.histContextArrow} ${histContextOpen ? styles.histContextArrowExpanded : ''}`}>›</span>
                  </button>
                  <div className={`${styles.histInlineBody} ${histContextOpen ? styles.histInlineBodyExpanded : ''}`}>
                    {round.description}
                    <div className={styles.histInlineRate}>
                      <RatingControl eventId={round.eventId} />
                    </div>
                  </div>
                </>
              )}
              {(round as unknown as { sourceUrl?: string }).sourceUrl && (
                <div className={styles.sourceButtonWrap}>
                  <button
                    className={styles.sourceButton}
                    onClick={() => window.open((round as unknown as { sourceUrl?: string }).sourceUrl, "_blank")}
                  >
                    {t('source_link')}
                  </button>
                </div>
              )}
              {!round.description && (
                <div className={styles.sourceButtonWrap}>
                  <RatingControl eventId={round.eventId} />
                </div>
              )}
            </div>

            {/* HERO SCORE CARD — accuracy ring + total XP + combo badge + Where/When mini cards */}
            <div ref={accuracyCardRef} className={styles.heroCard}>
              <div className={styles.heroTop}>
                <div className={styles.accuracyRingWrap}>
                  <RainbowRing value={accuracy} onComplete={() => setIsRingDone(true)} />
                </div>
                <div className={styles.totalXpRow}>
                  <span className={styles.totalXpVal}>{(myResult?.score ?? 0).toLocaleString()} {t('xp_unit')}</span>
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
                        {t('near_miss')}
                      </span>
                    );
                  })()}
                </div>
                {submittedHintPenaltyRef.current.xpPenalty > 0 && (
                  <div className={styles.hintPenaltyBadge}>
                    <span className={styles.hintPenaltyBadgeInner}>{t('hint_penalties')}</span>
                  </div>
                )}
              </div>

              <div className={styles.miniCardsRow}>
                {/* Where mini card */}
                <div className={styles.miniCard}>
                  <div className={styles.miniCardHead}>
                    <span className={styles.miniCardDotWhere} />
                    <span className={styles.miniCardTitle}>{t('where')}</span>
                  </div>
                  {(() => {
                    const locScore = myResult?.locationScore ?? 0;
                    const hue = Math.round((Math.max(0, Math.min(100, locScore)) / 100) * 120);
                    const color = `hsl(${hue}, 100%, 50%)`;
                    return <MiniRing value={locScore} color={color} />;
                  })()}
                  <div className={styles.miniXp}>
                    <span className={styles.miniXpVal}>+{Math.round(myResult?.locationScore ?? 0)}</span>
                    <span className={styles.miniXpLabel}>XP</span>
                  </div>
                  <div className={styles.miniBadges}>
                    {(() => {
                      const badge = myResult?.badges?.find(b => b.dimension === 'location');
                      if (!badge) return null;
                      return (
                        <InlineImageBadge
                          dimension="location"
                          tier={badge.tier as 'gold' | 'silver' | 'bronze'}
                          isTriggered={isAccuracyVisible && isRingDone}
                        />
                      );
                    })()}
                  </div>
                </div>

                {/* When mini card */}
                <div className={styles.miniCard}>
                  <div className={styles.miniCardHead}>
                    <span className={styles.miniCardDotWhen} />
                    <span className={styles.miniCardTitle}>{t('when')}</span>
                  </div>
                  {(() => {
                    const timeScore = myResult?.timeScore ?? 0;
                    const hue = Math.round((Math.max(0, Math.min(100, timeScore)) / 100) * 120);
                    const color = `hsl(${hue}, 100%, 50%)`;
                    return <MiniRing value={timeScore} color={color} />;
                  })()}
                  <div className={styles.miniXp}>
                    <span className={styles.miniXpVal}>+{Math.round(myResult?.timeScore ?? 0)}</span>
                    <span className={styles.miniXpLabel}>XP</span>
                  </div>
                  <div className={styles.miniBadges}>
                    {(() => {
                      const badge = myResult?.badges?.find(b => b.dimension === 'year');
                      if (!badge) return null;
                      return (
                        <InlineImageBadge
                          dimension="year"
                          tier={badge.tier as 'gold' | 'silver' | 'bronze'}
                          isTriggered={isAccuracyVisible && isRingDone}
                        />
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* ROUND LEADERBOARD CARD */}
            <div className={styles.leaderboardCard}>
              <div className={styles.leaderboardTitle}>
                <span className={styles.leaderboardAccentBar} />
                {t('round_leaderboard')}
                {(() => {
                  const rows = leaderboardTab === 'thisRound' ? leaderboardRows : allRoundsLeaderboardRows;
                  const myRank = rows.find(r => r.isMe)?.rank;
                  return myRank != null ? <span className={styles.cardHeadRank}>#{myRank}</span> : null;
                })()}
              </div>
              <div className={styles.leaderboardTabs}>
                <button
                  className={`${styles.leaderboardTab} ${leaderboardTab === 'thisRound' ? styles.leaderboardTabActive : ''}`}
                  onClick={() => setLeaderboardTab('thisRound')}
                >
                  {t('this_round')}
                </button>
                {snapshot.rounds.length > 1 && (
                  <button
                    className={`${styles.leaderboardTab} ${leaderboardTab === 'allRounds' ? styles.leaderboardTabActive : ''}`}
                    onClick={() => setLeaderboardTab('allRounds')}
                  >
                    {t('all_rounds')}
                  </button>
                )}
              </div>
              <div className={styles.leaderboardHeader}>
                <span className={styles.leaderboardHeaderRank}>#</span>
                <span className={styles.leaderboardHeaderName}>{t('col_player')}</span>
                <span className={styles.leaderboardHeaderScore}>{leaderboardTab === 'thisRound' ? t('col_score') : t('col_total')}</span>
              </div>
              {(leaderboardTab === 'thisRound' ? leaderboardRows : allRoundsLeaderboardRows).map(row => {
                const hue = Math.round((Math.max(0, Math.min(100, row.accuracy)) / 100) * 120);
                const accColor = `hsl(${hue}, 100%, 50%)`;
                const avatarUrl = snapshot.players.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
                const displayValue = leaderboardTab === 'thisRound' ? Math.round(row.accuracy) : row.cumulativeScore;
                const displaySuffix = leaderboardTab === 'thisRound' ? '%' : '';
                return (
                  <div key={row.rank} className={`${styles.lbRow} ${row.isMe ? styles.lbRowSelfAccent : ""}`}>
                    <span className={`${styles.lbRank} ${row.rank === 1 ? styles.lbRankGold : ""}`}>{row.rank}</span>
                    <span className={styles.lbNameCell}>
                      <span className={styles.lbNameInner}>
                        <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} size={40} />
                        <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                          {row.displayName}
                        </span>
                      </span>
                      {row.isMe && <span className={styles.lbYouPill}>{t('you')}</span>}
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
                    <div key={p.playerId} className={`${styles.lbRow} ${isMe ? styles.lbRowSelfAccent : ""}`}>
                      <span className={styles.lbRank}>—</span>
                      <span className={styles.lbNameCell}>
                        <span className={styles.lbNameInner}>
                          <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName || p.playerId.slice(0, 8)} size={40} />
                          <span style={{ ...getUsernameGradientStyle(p.playerId), fontWeight: isMe ? 700 : 500 }}>
                            {p.displayName || p.playerId.slice(0, 8)}
                          </span>
                        </span>
                        {isMe && <span className={styles.lbYouPill}>{t('you')}</span>}
                        <span className={styles.lbNoGuessTag}>{t('no_guess')}</span>
                      </span>
                      <span className={styles.lbAccEmpty}>—</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* WHERE + WHEN CARD (merged, tabbed) */}
            <div className={styles.whereWhenCard}>
              <div className={styles.leaderboardTitle}>
                <span className={`${styles.leaderboardAccentBar} ${whereWhenTab === 'where' ? styles.accentBarWhere : styles.accentBarWhen}`} />
                {t('breakdown')}
              </div>
              <div className={styles.whereWhenTabs}>
                <button
                  className={`${styles.whereWhenTab} ${whereWhenTab === 'where' ? styles.whereWhenTabActiveWhere : ''}`}
                  onClick={() => setWhereWhenTab('where')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badges/where.webp" alt="" width={20} height={20} className={styles.whereWhenTabIcon} />
                  {t('where')}
                </button>
                <button
                  className={`${styles.whereWhenTab} ${whereWhenTab === 'when' ? styles.whereWhenTabActiveWhen : ''}`}
                  onClick={() => setWhereWhenTab('when')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/badges/when.webp" alt="" width={20} height={20} className={styles.whereWhenTabIcon} />
                  {t('when')}
                </button>
              </div>

              {/* breakHead: correct answer + score (proto-style) */}
              {(() => {
                const isWhere = whereWhenTab === 'where';
                const correctValue = isWhere ? correctName : correctYear;
                const scoreVal = isWhere ? (myResult?.locationScore ?? 0) : (myResult?.timeScore ?? 0);
                const hue = Math.round((Math.max(0, Math.min(100, scoreVal)) / 100) * 120);
                const scoreColor = `hsl(${hue}, 100%, 50%)`;
                return (
                  <div className={styles.breakHead}>
                    <div className={styles.breakCorrectCol}>
                      <span className={styles.breakCorrectLabel}>{t('correct_answer')}</span>
                      <span className={`${styles.breakCorrectValue} ${isWhere ? styles.breakCorrectValueWhere : styles.breakCorrectValueWhen}`}>{correctValue}</span>
                    </div>
                    <span className={styles.breakScore} style={{ color: scoreColor }}>{Math.round(scoreVal)}</span>
                  </div>
                );
              })()}

              {/* breakSub: distance / year-off (proto-style) */}
              {(() => {
                if (myResult == null || !myResult.didSubmit) {
                  return <span className={styles.breakSub}>{t('no_guess')}</span>;
                }
                if (whereWhenTab === 'where') {
                  return myDistanceKm != null
                    ? <span className={styles.breakSub}>{t('km_away', { n: Math.round(myDistanceKm) })}</span>
                    : null;
                }
                const gy = myResult.guessYear;
                return gy != null
                  ? <span className={styles.breakSub}>{t('you_guessed_off', { year: gy, n: Math.abs(gy - correctYear) })}</span>
                  : <span className={styles.breakSub}>{t('no_guess')}</span>;
              })()}

              {whereWhenTab === 'where' ? (
                <div ref={whereCardRef}>
                  <WhereCard
                    bare
                    roundResults={roundResults}
                    playerId={playerId}
                    correctLat={correctLat}
                    correctLng={correctLng}
                    correctName={correctName}
                    whereAccPenalty={submittedHintPenaltyRef.current.whereAccPenalty}
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
                  />
                </div>
              ) : (
                <div ref={whenCardRef}>
                  <WhenCard
                    bare
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
                  />
                </div>
              )}
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
                      revealedText = `${hint.content} — ${t('km_away_short', { n: meta.km })}`;
                    } else if (hint.type === "when" && (hint.tier === 2 || hint.tier === 4) && meta?.years != null) {
                      revealedText = `${hint.content} — ${t('years_off_short', { n: meta.years })}`;
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

            {/* BOTTOM BAR WRAPPER — countdown (above) + nav row (proto-style) */}
            <div className={styles.bottomBarWrap}>
              {((resultSecsLeft !== null && resultSecsLeft > 0) || (snapshot.readyForNext && snapshot.readyForNext.length > 0)) && (
                <div className={styles.countdown}>
                  {resultSecsLeft !== null && resultSecsLeft > 0 && (
                    <span className={styles.countdownText}>
                      {t('auto_advancing_in', { n: resultSecsLeft })}
                    </span>
                  )}
                  {snapshot.readyForNext && snapshot.readyForNext.length > 0 && (
                    <span className={styles.readyNames}>
                      {snapshot.readyForNext.map(pid => {
                        const name = snapshot.players.find(p => p.playerId === pid)?.displayName ?? pid.slice(0, 8);
                        return (
                          <span key={pid} className={styles.readyName}>
                            <span style={getUsernameGradientStyle(pid)}>{name}</span> ✓
                          </span>
                        );
                      })}
                    </span>
                  )}
                </div>
              )}

              {/* BOTTOM BAR (nav row) */}
              <div className={styles.bottomBar}>
                <button className={styles.homeButton} onClick={() => router.push("/home")}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gh-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        className={`${styles.progressDot} ${isDone ? styles.progressDotDone : isCurrent ? styles.progressDotCurrent : styles.progressDotPending}`}
                      />
                    );
                  })}
                  <span className={styles.roundLabel}>
                    {t('round_label_compact', { current: snapshot.currentRoundIndex + 1, total: snapshot.rounds.length })}
                  </span>
                </div>
                <button
                  className={`${styles.nextButton} ${snapshot.readyForNext?.includes(playerId ?? "") ? styles.nextButtonDisabled : ""}`}
                  onClick={onAdvanceRound}
                  disabled={snapshot.readyForNext?.includes(playerId ?? "")}
                  data-testid="round-next-btn"
                  data-ready={snapshot.readyForNext?.includes(playerId ?? "") ? 'true' : 'false'}
                >
                  {t('next_arrow')}
                </button>
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
    </div>
  );
}
