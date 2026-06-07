"use client";

import dynamic from "next/dynamic";
import { useTranslations } from 'next-intl';
import { getUsernameGradientStyle, haversineKm } from "@/core/competeUtils";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";
import styles from "./WhereCard.module.css";

const StaticResultMap = dynamic(
  () => import("@/components/StaticResultMap").then((m) => m.StaticResultMap),
  { ssr: false }
);

interface Hint {
  id: string;
  type: string;
  tier: number;
  content: string;
}

interface WhereCardProps {
  roundResults: RoundResult[] | null;
  playerId: string | null;
  correctLat: number | null;
  correctLng: number | null;
  correctName: string | null;
  whereAccPenalty: number;
  guessLat: number | null;
  guessLng: number | null;
  myDistanceKm: number | null;
  whereLbExpanded: boolean;
  setWhereLbExpanded: (v: boolean) => void;
  whereCluesExpanded: boolean;
  setWhereCluesExpanded: (v: boolean) => void;
  roundHints: Hint[];
  snapshotPlayers: SessionPlayer[];
  currentRoundIndex: number;
}

export default function WhereCard({
  roundResults,
  playerId,
  correctLat,
  correctLng,
  correctName,
  whereAccPenalty,
  guessLat,
  guessLng,
  myDistanceKm,
  whereLbExpanded,
  setWhereLbExpanded,
  whereCluesExpanded,
  setWhereCluesExpanded,
  roundHints,
  snapshotPlayers,
  currentRoundIndex,
}: WhereCardProps) {
  const t = useTranslations();
  const myResult = roundResults?.find(r => r.playerId === playerId);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badges/where.webp" alt="where" width={36} height={36} className={styles.titleIcon} />
          <span className={styles.titleText}>{t('game.where')}</span>
        </div>
        {(() => {
          if (myResult == null || !myResult.didSubmit) {
            return (
              <div className={styles.noSubmit}>
                <span className={styles.noSubmitDash}>—</span>
              </div>
            );
          }
          const locScore = Math.round(myResult.locationScore);
          const locHue = Math.round((Math.max(0, Math.min(100, locScore)) / 100) * 120);
          const locColor = `hsl(${locHue}, 100%, 50%)`;
          return (
            <div className={styles.scoreCol}>
              <div className={styles.scoreRow}>
                <span style={{ fontSize: 25, fontWeight: 700, color: locColor }}>{locScore}</span>
                <span className={styles.scoreSuffix}>%</span>
              </div>
              {/* LOCATION BADGE CHIP — dimension = 'location' */}
              {(() => {
                const badge = myResult?.badges?.find(b => b.dimension === 'location');
                const near  = myResult?.nearMisses?.find(n => n.dimension === 'location');
                if (!badge && !near) return null;
                const tierChipClass: Record<string, string> = {
                  gold:   styles.badgeChipGold,
                  silver: styles.badgeChipSilver,
                  bronze: styles.badgeChipBronze,
                };
                if (badge) {
                  const chipClass = tierChipClass[badge.tier] ?? styles.badgeChipBronze;
                  return (
                    <span className={`${styles.badgeChip} ${chipClass}`}>
                      {badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1)}
                    </span>
                  );
                }
                return (
                  <span className={styles.nearMissChip}>
                    {t('game.near_miss')}
                  </span>
                );
              })()}
            </div>
          );
        })()}
      </div>
      {whereAccPenalty > 0 && (
        <div className={styles.hintPenaltyWrap}>
          <span className={styles.hintPenalty}>
            −{Math.round(whereAccPenalty / 2)}<span className={styles.hintPenaltySuffix}>%</span> {t('game.hints_suffix')}
          </span>
        </div>
      )}
      <div className={styles.correctRow}>
        <span>{t('game.correct_location')}:</span>
        <span className={styles.correctName}>{correctName}</span>
      </div>
      {(() => {
        if (myResult == null || !myResult.didSubmit) {
          return (
            <div className={styles.noGuessWrap}>
              <span className={styles.noGuessText}>{t('game.no_guess')}</span>
            </div>
          );
        }
        if (myDistanceKm != null) {
          return (
            <div className={styles.distanceWrap}>
              <span className={styles.distanceText}>{t('game.km_away', { n: Math.round(myDistanceKm) })}</span>
            </div>
          );
        }
        return null;
      })()}
      <div className={styles.mapContainer}>
        {correctLat != null && correctLng != null && (
          <StaticResultMap
            key={`result-map-${currentRoundIndex}`}
            correctLat={correctLat}
            correctLng={correctLng}
            guessLat={guessLat}
            guessLng={guessLng}
            playerGuesses={roundResults
              ?.filter(r => r.didSubmit && r.guessLat != null && r.guessLng != null && r.playerId !== playerId)
              .map(r => {
                const player = snapshotPlayers.find(p => p.playerId === r.playerId);
                return {
                  playerId: r.playerId,
                  lat: r.guessLat!,
                  lng: r.guessLng!,
                  label: player?.displayName ?? r.playerId.slice(0, 8),
                  color: r.playerId === playerId ? "var(--gh-orange)" : undefined,
                  avatarUrl: player?.avatarUrl ?? null,
                };
              }) ?? undefined}
            ownAvatarUrl={snapshotPlayers.find(p => p.playerId === playerId)?.avatarUrl ?? null}
            ownLabel={snapshotPlayers.find(p => p.playerId === playerId)?.displayName ?? ""}
          />
        )}
      </div>
      <div className={styles.expandSection}>
        <div
          onClick={() => setWhereLbExpanded(!whereLbExpanded)}
          className={styles.expandHeader}
        >
          <div className={styles.expandTitleGroup}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.svgMuted}>
              {whereLbExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
            <span className={styles.expandLabel}>
              {t('game.leaderboard')}
            </span>
          </div>
          {(() => {
            const myRank = roundResults?.find(r => r.playerId === playerId)?.rank ?? null;
            return myRank != null ? (
              <span className={styles.expandRank}>
                #{myRank}
              </span>
            ) : null;
          })()}
        </div>
        {whereLbExpanded && (
          <div className={styles.lbList}>
            {(roundResults ?? [])
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((r, idx) => {
                const distanceKm = r.guessLat != null && r.guessLng != null && correctLat != null && correctLng != null
                  ? haversineKm(r.guessLat, r.guessLng, correctLat, correctLng)
                  : null;
                const locationAcc = r.locationScore;
                const locHue = locationAcc != null ? Math.round((locationAcc / 100) * 120) : null;
                const locAccColor = locHue != null ? `hsl(${locHue}, 100%, 50%)` : "var(--gh-text-muted)";
                return (
                  <div key={r.playerId} className={styles.lbRow} style={{
                    background: r.playerId === playerId ? "rgba(255,255,255,0.06)" : "transparent",
                    borderBottom: idx < (roundResults?.length ?? 0) - 1 ? "1px solid rgba(51,51,51,1)" : "none",
                  }}>
                    <span className={styles.lbRank}>
                      {r.rank ?? "—"}
                    </span>
                    <span className={styles.lbName}>
                      <span style={{ ...getUsernameGradientStyle(r.playerId), fontWeight: r.playerId === playerId ? 600 : 400 }}>
                        {snapshotPlayers.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8)}
                      </span>
                      {r.playerId === playerId && <span className={styles.lbYouTag}>({t('game.you')})</span>}
                    </span>
                    <span className={styles.lbDistance}>
                      {distanceKm != null ? t('game.km_away', { n: Math.round(distanceKm) }) : "—"}
                    </span>
                    {locationAcc != null && (
                      <span className={styles.lbAccPill}>
                        <span style={{ color: locAccColor, fontSize: "var(--font-base)" }}>{locationAcc}</span>
                        <span className={styles.lbAccSuffix}>%</span>
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
      <div className={styles.expandSection}>
        <div
          onClick={() => setWhereCluesExpanded(!whereCluesExpanded)}
          className={styles.expandHeader}
        >
          <div className={styles.expandTitleGroup}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.svgAccent}>
              {whereCluesExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
            <span className={styles.expandLabelAccent}>
              {t('game.hints')}
            </span>
          </div>
          {null}
        </div>
        {whereCluesExpanded && (
          <div className={styles.hintsList}>
            {(() => {
              const whereHints = (roundHints ?? [])
                .filter(h => h.type === "where")
                .sort((a, b) => a.tier - b.tier);
              if (whereHints.length === 0) return (
                <div className={styles.emptyHints}>
                  {t('game.no_location_clues')}
                </div>
              );
              const labelMap: Record<number, string> = {
                1: t('game.hint_continent'), 2: t('game.hint_remote_landmark'), 3: t('game.hint_region'),
                4: t('game.hint_nearby_landmark'), 5: t('game.hint_visual_clues')
              };
              return whereHints.map((hint, idx) => (
                <div key={hint.id} className={`${styles.hintRow} ${idx < whereHints.length - 1 ? styles.hintRowDivider : ""}`}>
                  <div className={styles.hintTierLabel}>
                    <span className={styles.hintTierText}>
                      {labelMap[hint.tier] ?? `Tier ${hint.tier}`}
                    </span>
                  </div>
                  <div className={styles.hintContent}>
                    {hint.content}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
