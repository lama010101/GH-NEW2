"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ConfettiCanvas, { type ConfettiHandle } from "./ConfettiCanvas";
import styles from "./BadgePopup.module.css";

interface BadgePopupProps {
  dimension: 'combo' | 'location' | 'year';
  tier: 'gold' | 'silver' | 'bronze';
  triggered: boolean;
  delay?: number;
  /** First earned badge popup: renders the animated XP progress bar + counter. */
  showXpBar?: boolean;
  /** Viewer total XP (player_global_stats.total_xp) before this round; null when unavailable. */
  xpBefore?: number | null;
  /** Viewer total XP after adding this round's XP. */
  xpAfter?: number;
  /** Bar start position (percent, within the current rank tier span). */
  progressBeforePct?: number;
  /** Bar end position (percent, clamped to 100). */
  progressAfterPct?: number;
  /** XP earned this round (location + time), animated in sync with the bar. */
  xpGain?: number;
}

const dimensionToPrefix: Record<string, string> = {
  location: 'location',
  year: 'year',
  combo: 'combo',
};

const tierToLabelKey: Record<string, string> = {
  gold: 'badge_tier_gold',
  silver: 'badge_tier_silver',
  bronze: 'badge_tier_bronze',
};

const dimensionToLabelKey: Record<string, string> = {
  location: 'badge_dim_location',
  year: 'badge_dim_year',
  combo: 'badge_dim_combo',
};

export default function BadgePopup({
  dimension,
  tier,
  triggered,
  delay = 0,
  showXpBar = false,
  xpBefore = null,
  xpAfter = 0,
  progressBeforePct = 0,
  progressAfterPct = 0,
  xpGain = 0,
}: BadgePopupProps) {
  const t = useTranslations('game');
  const [visible, setVisible] = useState(false);
  const [xpP, setXpP] = useState(0); // 0..1 eased progress of the XP gain

  const popupRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<ConfettiHandle>(null);

  // The popup with the XP bar stays longer so the bar/counter animation
  // completes; plain popups are shorter. RoundCompleteSection staggers the
  // sequential popup delays based on these durations so they never overlap.
  const duration = showXpBar ? 3200 : 1800;

  useEffect(() => {
    if (!triggered) return;
    const showTimer = setTimeout(() => setVisible(true), delay);
    const hideTimer = setTimeout(() => setVisible(false), delay + duration);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [triggered, delay, duration]);

  // Confetti burst at the badge center when the popup appears.
  useEffect(() => {
    if (!visible) return;
    const el = popupRef.current;
    const rect = el?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    confettiRef.current?.burst(cx, cy, { count: 170 });
    const secondBurst = setTimeout(
      () => confettiRef.current?.burst(cx, cy, { count: 80 }),
      350
    );
    return () => clearTimeout(secondBurst);
  }, [visible]);

  // XP bar + counters: ONE eased rAF progress drives bar width, +XP counter
  // and total counter, so they stay perfectly in sync (prototype behavior).
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!visible || !showXpBar || xpBefore == null) {
      setXpP(0);
      return;
    }
    if (reducedMotion) {
      setXpP(1); // static final state, no animation
      return;
    }
    let raf = 0;
    const startAt = 200;
    const animDuration = 1600;
    const t0 = performance.now() + startAt;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / animDuration));
      setXpP(easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, showXpBar, xpBefore, reducedMotion]);

  if (!visible) return null;

  const tierLabel = t(tierToLabelKey[tier]);
  const dimLabel = t(dimensionToLabelKey[dimension]);
  const text = `${tierLabel} ${dimLabel}!`;
  const imagePath = `/badges/${dimensionToPrefix[dimension]}_${tier}.webp`;

  const showXpSection = showXpBar && xpBefore != null;
  const barPct = showXpSection ? progressBeforePct + xpP * (progressAfterPct - progressBeforePct) : 0;
  const gainShown = xpP * xpGain;
  const xpCurrent = xpBefore != null ? xpBefore + xpP * xpGain : 0;
  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <>
      <div
        ref={popupRef}
        className={`${styles.badgePopup} ${showXpBar ? styles.badgePopupXp : styles.badgePopupPlain}`}
      >
        <div className={styles.badgePopupText}>{text}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imagePath} alt={text} className={styles.badgePopupImg} />
        {showXpSection && (
          <div className={styles.badgePopupXpSection}>
            <div className={styles.badgePopupXpBarTrack}>
              <div className={styles.badgePopupXpBarFill} style={{ width: `${barPct}%` }} />
            </div>
            <div className={styles.badgePopupXpValueRow}>
              <span className={styles.badgePopupXpGain}>
                +{fmt(gainShown)} {t('xp_unit')}
              </span>
              <span className={styles.badgePopupXpTotal}>
                {fmt(xpCurrent)} → {fmt(xpAfter)}
              </span>
            </div>
          </div>
        )}
      </div>
      <ConfettiCanvas ref={confettiRef} />
    </>
  );
}
