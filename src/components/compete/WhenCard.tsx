"use client";

import { useTranslations } from 'next-intl';
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import { getUsernameGradientStyle } from "@/core/competeUtils";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";
import InlineImageBadge from './InlineImageBadge';
import styles from "./WhenCard.module.css";

interface Hint {
  id: string;
  type: string;
  tier: number;
  content: string;
}

interface WhenCardProps {
  roundResults: RoundResult[] | null;
  playerId: string | null;
  correctYear: number;
  whenAccPenalty: number;
  whenLbExpanded: boolean;
  setWhenLbExpanded: (v: boolean) => void;
  whenCluesExpanded: boolean;
  setWhenCluesExpanded: (v: boolean) => void;
  roundHints: Hint[];
  snapshotPlayers: SessionPlayer[];
  isVisible?: boolean;
  bare?: boolean;
  isPractice?: boolean;
}

export default function WhenCard({
  roundResults,
  playerId,
  correctYear,
  whenAccPenalty,
  whenLbExpanded,
  setWhenLbExpanded,
  whenCluesExpanded,
  setWhenCluesExpanded,
  roundHints,
  snapshotPlayers,
  isVisible,
  bare,
  isPractice = false,
}: WhenCardProps) {
  const t = useTranslations('game');
  // Compute whenRows
  const whenRows = snapshotPlayers
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

  // Compute timeline variables
  const allYears = [correctYear, ...whenRows.map(r => r.guessYear).filter((y): y is number => y != null)];
  const maxDelta = allYears.reduce((max, y) => Math.max(max, Math.abs(y - correctYear)), 0);
  const minSpread = maxDelta === 0 ? 20 : maxDelta;
  const padding = Math.max(10, Math.ceil(minSpread / 10) * 10 - minSpread + 10);
  const timelineMin = Math.floor((Math.min(...allYears) - padding) / 10) * 10;
  const timelineMax = Math.ceil((Math.max(...allYears) + padding) / 10) * 10;
  const timelineRange = timelineMax - timelineMin;
  const correctXPercent = ((correctYear - timelineMin) / timelineRange) * 100;
  const yearCounts = new Map<number, number>();
  // Decade tick marks
  const ticks: { year: number; isMajor: boolean; xPercent: number }[] = [];
  for (let year = timelineMin; year <= timelineMax; year += 10) {
    const xPercent = ((year - timelineMin) / timelineRange) * 100;
    ticks.push({ year, isMajor: year % 50 === 0, xPercent });
  }
  whenRows.forEach(row => {
    if (row.guessYear != null) {
      yearCounts.set(row.guessYear, (yearCounts.get(row.guessYear) || 0) + 1);
    }
  });

  return (
    <div className={bare ? styles.cardBare : styles.card}>
      {/* Header */}
      {!bare && (
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badges/when.webp" alt={t('when')} width={36} height={36} className={styles.titleIcon} />
          <span className={styles.titleText}>{t('when')}</span>
        </div>
        {(() => {
          const myWhenRow = whenRows.find(r => r.isMe);
          const myWhenAcc = myWhenRow?.acc ?? null;
          const myResult = roundResults?.find(r => r.playerId === playerId);
          if (myResult == null || !myResult.didSubmit) {
            return <span className={styles.noScore}>—</span>;
          }
          return myWhenAcc != null ? (() => {
            const whenScore = Math.round(myWhenAcc);
            const whenHue = Math.round((Math.max(0, Math.min(100, whenScore)) / 100) * 120);
            const whenColor = `hsl(${whenHue}, 100%, 50%)`;
            return (
              <div className={styles.scoreColFlex}>
                <div className={styles.scoreGroup}>
                  <span style={{ fontSize: 25, fontWeight: 700, color: whenColor }}>{whenScore}</span>
                  <span className={styles.scoreSuffix}>%</span>
                </div>
                {/* YEAR BADGE CHIP — dimension = 'year' */}
                {(() => {
                  const badge = myResult?.badges?.find(b => b.dimension === 'year');
                  const near  = myResult?.nearMisses?.find(n => n.dimension === 'year');
                  if (!badge && !near) return null;
                  if (badge) {
                    return (
                      <InlineImageBadge
                        dimension="year"
                        tier={badge.tier as 'gold' | 'silver' | 'bronze'}
                        isTriggered={!!isVisible}
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
            );
          })() : null;
        })()}
      </div>
      )}

      {/* Hint penalty */}
      {!bare && whenAccPenalty > 0 && (
        <div>
          <span className={styles.hintPenalty}>
            −{Math.round(whenAccPenalty)}<span className={styles.hintPenaltySuffix}>%</span> {t('hints_suffix')}
          </span>
        </div>
      )}

      {/* Correct year */}
      {!bare && (
      <div className={styles.correctRow}>
        <span>{t('correct_year')}:</span>
        <span className={styles.correctValue}>{correctYear}</span>
      </div>
      )}

      {/* Timeline */}
      <div className={styles.timeline}>
        <div className={styles.timelineBar} />

        {/* Correct year marker */}
        <div
          className={styles.correctMarker}
          style={{ left: `${correctXPercent}%` }}
        >
          <div className={styles.correctLabel}>{t('correct_year')}</div>
          <div className={styles.correctYear}>{correctYear}</div>
        </div>

        {/* Decade ticks */}
        {ticks.map((tick) => {
          const isNearCorrect = Math.abs(tick.xPercent - 50) < 8;
          return (
            <div
              key={tick.year}
              className={styles.tick}
              style={{ left: `${tick.xPercent}%`, height: tick.isMajor ? 14 : 8 }}
            >
              {tick.isMajor && !isNearCorrect && (
                <div className={styles.tickLabel}>{tick.year}</div>
              )}
            </div>
          );
        })}

        {/* Player markers */}
        {whenRows.map((row) => {
          if (row.guessYear == null) return null;
          const xPercent = ((row.guessYear - timelineMin) / timelineRange) * 100;
          const clampedXPercent = Math.max(4, Math.min(96, xPercent));
          const sameYearPlayers = whenRows.filter(r => r.guessYear === row.guessYear);
          const groupIndex = sameYearPlayers.findIndex(r => r.playerId === row.playerId);
          const verticalOffset = groupIndex * 22;
          return (
            <div
              key={row.playerId}
              className={styles.playerMarker}
              style={{
                left: `${clampedXPercent}%`,
                transform: `translate(-50%, calc(-50% - ${verticalOffset}px))`,
              }}
            >
              <div className={styles.playerAvatarRing}>
                <PlayerAvatar
                  avatarUrl={snapshotPlayers.find(p => p.playerId === row.playerId)?.avatarUrl ?? null}
                  displayName={snapshotPlayers.find(p => p.playerId === row.playerId)?.displayName ?? row.playerId.slice(0, 2)}
                  size={22}
                />
              </div>
              <div
                className={styles.playerYearLabel}
                style={{ fontSize: row.isMe ? 15 : 10, fontWeight: row.isMe ? 700 : 400 }}
              >
                {row.guessYear}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leaderboard expandable */}
      {!isPractice && (
      <div className={styles.expandSection}>
        <div className={styles.expandHeader} onClick={() => setWhenLbExpanded(!whenLbExpanded)}>
          <div className={styles.expandTitleGroup}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.svgMuted}>
              {whenLbExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
            <span className={styles.expandLabel}>{t('leaderboard')}</span>
          </div>
          {(() => {
            const myRank = roundResults?.find(r => r.playerId === playerId)?.rank ?? null;
            return myRank != null ? <span className={styles.expandRank}>#{myRank}</span> : null;
          })()}
        </div>
        {whenLbExpanded && (
          <div className={styles.lbList}>
            {whenRows.map((row, idx) => {
              const hue = row.acc != null ? Math.round((row.acc / 100) * 120) : null;
              const accColor = hue != null ? `hsl(${hue}, 100%, 50%)` : "var(--gh-text-muted)";
              const resultRow = roundResults?.find(r => r.playerId === row.playerId);
              const rank = resultRow?.rank ?? null;
              const avatarUrl = snapshotPlayers.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
              const isLast = idx === whenRows.length - 1;
              return (
                <div
                  key={row.playerId}
                  className={`${styles.lbRow} ${row.isMe ? styles.lbRowSelf : ""} ${!isLast ? styles.lbRowDivider : ""}`}
                >
                  <span className={styles.lbRank}>{rank ?? "—"}</span>
                  <span className={styles.lbNameGroup}>
                    <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} size={40} />
                    <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                      {row.displayName}
                    </span>
                    {row.isMe && <span className={styles.lbYouTag}>({t('you')})</span>}
                  </span>
                  <span className={styles.lbYearsOff}>
                    {row.diff != null ? t('years_off', { n: row.diff }) : "—"}
                  </span>
                  <span className={styles.lbAccPill}>
                    {row.acc != null ? (
                      <>
                        <span style={{ color: accColor, fontSize: "var(--gh-font-base)" }}>{row.acc}</span>
                        <span className={styles.lbAccSuffix}>%</span>
                      </>
                    ) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Hints expandable */}
      <div className={styles.expandSection}>
        <div className={styles.expandHeader} onClick={() => setWhenCluesExpanded(!whenCluesExpanded)}>
          <div className={styles.expandTitleGroup}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.svgAccent}>
              {whenCluesExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
            <span className={styles.expandLabelAccent}>{t('hints')}</span>
          </div>
        </div>
        {whenCluesExpanded && (
          <div className={styles.hintsList}>
            {(() => {
              const whenHints = (roundHints ?? [])
                .filter(h => h.type === "when")
                .sort((a, b) => a.tier - b.tier);
              if (whenHints.length === 0) return (
                <div className={styles.emptyHints}>{t('no_time_clues')}</div>
              );
              const labelMap: Record<number, string> = {
                1: t('hint_century'), 2: t('hint_historical_event'), 3: t('hint_decade'),
                4: t('hint_contemporary_event'), 5: t('hint_visual_clues')
              };
              return whenHints.map((hint, idx) => (
                <div
                  key={hint.id}
                  className={`${styles.hintRow} ${idx < whenHints.length - 1 ? styles.hintRowDivider : ""}`}
                >
                  <div className={styles.hintLabel}>{labelMap[hint.tier] ?? t('tier_n', { n: hint.tier })}</div>
                  <div className={styles.hintContent}>{hint.content}</div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
