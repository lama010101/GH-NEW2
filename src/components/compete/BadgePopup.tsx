"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./BadgePopup.module.css";

interface BadgePopupProps {
  dimension: 'combo' | 'location' | 'year';
  tier: 'gold' | 'silver' | 'bronze';
  triggered: boolean;
  delay?: number;
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

export default function BadgePopup({ dimension, tier, triggered, delay = 0 }: BadgePopupProps) {
  const t = useTranslations('game');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!triggered) return;
    const showTimer = setTimeout(() => setVisible(true), delay);
    const hideTimer = setTimeout(() => setVisible(false), delay + 1500);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [triggered, delay]);

  if (!visible) return null;

  const tierLabel = t(tierToLabelKey[tier]);
  const dimLabel = t(dimensionToLabelKey[dimension]);
  const text = `${tierLabel} ${dimLabel}!`;
  const imagePath = `/badges/${dimensionToPrefix[dimension]}_${tier}.webp`;

  return (
    <div className={styles.badgePopup}>
      <div className={styles.badgePopupText}>{text}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagePath} alt={text} className={styles.badgePopupImg} />
    </div>
  );
}
