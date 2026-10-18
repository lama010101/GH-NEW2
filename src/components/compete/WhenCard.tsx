"use client";

import { useTranslations } from 'next-intl';
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import { getUsernameGradientStyle, hasSubmitted } from "@/core/competeUtils";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";
import InlineImageBadge from './InlineImageBadge';
import WhenIcon from "@/components/icons/WhenIcon";
import { getAccuracyColor } from "@/core/accuracyColor";
import { layoutWhenTimeline } from "./whenTimeline";
import styles from "./WhenCard.module.css";

interface Hint {
  id: string;
  type: string;
  tier: number;
  content: string;
  metadata?: Record<string, unknown> | null;
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
  const effectiveWhenAccPenalty = roundResults?.find(r => r.playerId === playerId)?.accPenaltyWhenRate ?? whenAccPenalty;
  // Compute whenRows
  const whenRows = snapshotPlayers
    .map(p => {
      const resultRow = roundResults?.find(r => r.playerId === p.playerId);
      const theirGuessYear = resultRow?.guessYear ?? null;
      const acc = hasSubmitted(resultRow) ? (resultRow?.timeScore ?? null) : null;
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

  // Timeline layout — marker stacking and tick-label dedupe live in
  // ./whenTimeline (unit-tested); labels never draw twice at the same spot.
  const { correctXPercent, ticks, markers } = layoutWhenTimeline(
    correctYear,
    whenRows.map((row) => ({
      playerId: row.playerId,
      guessYear: row.guessYear,
      isMe: row.isMe,
      submitted: hasSubmitted(row),
    })),
  );

  return (
    <div className={bare ? styles.cardBare : styles.card}>
      {/* Header */}
      {!bare && (
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <WhenIcon className={styles.titleIcon} size={36} style={{ color: 'var(--gh-violet)' }} />
          <span className={styles.titleText}>{t('when')}</span>
        </div>
        {(() => {
          const myWhenRow = whenRows.find(r => r.isMe);
          const myWhenAcc = myWhenRow?.acc ?? null;
          const myResult = roundResults?.find(r => r.playerId === playerId);
          if (myResult == null || !hasSubmitted(myResult)) {
            return <span className={styles.noScore}>—</span>;
          }
          return myWhenAcc != null ? (() => {
            const whenScore = Math.round(myWhenAcc);
            const whenColor = getAccuracyColor(whenScore);
            return (
              <div className={styles.scoreColFlex}>
                <div className={styles.scoreGroup}>
                  <span style={{ fontSize: 25, fontWeight: 700, color: whenColor }}>
                    {whenScore}
                    <span className={styles.scoreSuffix}>%</span>
                  </span>
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
      {!bare && effectiveWhenAccPenalty > 0 && (
        <div>
          <span className={styles.hintPenalty}>
            −{Math.round(effectiveWhenAccPenalty)}<span className={styles.hintPenaltySuffix}>%</span> {t('hints_suffix')}
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

        {/* Decade ticks — showLabel false when a marker/correct label dedupes it */}
        {ticks.map((tick) => {
          return (
            <div
              key={tick.year}
              className={styles.tick}
              style={{ left: `${tick.xPercent}%`, height: tick.isMajor ? 14 : 8 }}
            >
              {tick.showLabel && (
                <div className={styles.tickLabel}>{tick.year}</div>
              )}
            </div>
          );
        })}

        {/* Player markers — same-year groups stack by offsetPx; labels never
            draw twice at the same spot (near-correct markers are lifted clear) */}
        {markers.map((marker) => {
          return (
            <div
              key={marker.playerId}
              className={styles.playerMarker}
              style={{
                left: `${marker.xPercent}%`,
                transform: `translate(-50%, calc(-50% - ${marker.offsetPx}px))`,
              }}
            >
              <div className={styles.playerAvatarRing}>
                <PlayerAvatar
                  avatarUrl={snapshotPlayers.find(p => p.playerId === marker.playerId)?.avatarUrl ?? null}
                  displayName={snapshotPlayers.find(p => p.playerId === marker.playerId)?.displayName ?? marker.playerId.slice(0, 2)}
                  playerId={marker.playerId}
                  size={22}
                  isMe={marker.isMe}
                />
              </div>
              <div
                className={styles.playerYearLabel}
                style={{ fontSize: marker.isMe ? 15 : 10, fontWeight: marker.isMe ? 700 : 400 }}
              >
                {marker.guessYear}
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
            const myRank = whenRows.findIndex(r => r.isMe && r.acc != null) + 1;
            return myRank > 0 ? <span className={styles.expandRank}>#{myRank}</span> : null;
          })()}
        </div>
        {whenLbExpanded && (
          <div className={styles.lbList}>
            {whenRows.map((row, idx) => {
              const accColor = getAccuracyColor(row.acc ?? NaN);
              const avatarUrl = snapshotPlayers.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
              const isLast = idx === whenRows.length - 1;
              return (
                <div
                  key={row.playerId}
                  className={`${styles.lbRow} ${row.isMe ? styles.lbRowSelf : ""} ${!isLast ? styles.lbRowDivider : ""}`}
                >
                  <span className={styles.lbRank}>{idx + 1}</span>
                  <span className={styles.lbNameGroup}>
                    <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} playerId={row.playerId} size={40} isMe={row.isMe} />
                    <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                      {row.displayName}
                    </span>
                  </span>
                  <span className={styles.lbYearsOff}>
                    {row.diff != null ? t('years_off', { n: row.diff }) : "—"}
                  </span>
                  <span className={styles.lbAccPill}>
                    {row.acc != null ? (
                      <span style={{ color: accColor, fontSize: "var(--font-base)" }}>
                        {row.acc}
                        <span className={styles.lbAccSuffix}>%</span>
                      </span>
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
              return whenHints.map((hint, idx) => {
                const meta = hint.metadata as { km?: number; years?: number | string } | null;
                let revealedText = hint.content;
                if (hint.type === "when" && (hint.tier === 2 || hint.tier === 4) && meta?.years != null) {
                  revealedText = `${hint.content} • ${t('years_off_short', { n: meta.years })}`;
                }
                return (
                  <div
                    key={hint.id}
                    className={`${styles.hintRow} ${idx < whenHints.length - 1 ? styles.hintRowDivider : ""}`}
                  >
                    <div className={styles.hintLabel}>{labelMap[hint.tier] ?? t('tier_n', { n: hint.tier })}</div>
                    <div className={styles.hintContent}>{revealedText}</div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
