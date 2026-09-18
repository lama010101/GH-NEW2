"use client";

// Journey-local badge display (HJ-BUILD-JOURNEYUI-001).
// Plain tier display for the Historian's Journey gold/silver/bronze/completion
// badges + accuracy%. Deliberately NOT the compete BadgePopup (per-round
// location/year/combo tiers + XP-bar animation — protected-baseline path).

import { useTranslations } from "next-intl";
import type { JourneyBadge as JourneyBadgeTier } from "@/server/journeyCore";
import styles from "./JourneyBadge.module.css";

const TIER_CLASS: Record<JourneyBadgeTier, string> = {
  gold: styles.tierGold,
  silver: styles.tierSilver,
  bronze: styles.tierBronze,
  completion: styles.tierCompletion,
};

export function JourneyBadge({
  badge,
  accuracyPct,
  size = "sm",
}: {
  badge: JourneyBadgeTier | null;
  accuracyPct?: number | null;
  size?: "sm" | "lg";
}) {
  const t = useTranslations("journey");
  return (
    <span
      className={`${styles.badge} ${badge ? TIER_CLASS[badge] : styles.tierNone} ${
        size === "lg" ? styles.lg : ""
      }`}
    >
      <span className={styles.disc} aria-hidden="true" />
      <span className={styles.label}>{badge ? t(`badge_${badge}`) : t("badge_none")}</span>
      {typeof accuracyPct === "number" && (
        <span className={styles.accuracy}>{accuracyPct.toFixed(1)}%</span>
      )}
    </span>
  );
}
