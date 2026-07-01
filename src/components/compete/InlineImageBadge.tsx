"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getBadgeSoundPath } from "@/core/competeUtils";
import styles from "./InlineImageBadge.module.css";

interface InlineImageBadgeProps {
  dimension: 'combo' | 'location' | 'year';
  tier: 'gold' | 'silver' | 'bronze';
  isTriggered: boolean;
}

const dimensionToPrefix: Record<string, string> = {
  location: 'location',
  year: 'year',
  combo: 'combo',
};

export default function InlineImageBadge({ dimension, tier, isTriggered }: InlineImageBadgeProps) {
  const t = useTranslations("game");
  // Snapshot of isTriggered captured at mount. If the badge mounts with isTriggered
  // already true (e.g., parent visibility state persisted across a where/when tab
  // toggle remount), the reveal already happened in a previous mount — show it
  // statically without re-animating or re-playing the sound.
  const wasTriggeredOnMount = useRef(isTriggered);
  // Set true only when THIS mount observes a false→true transition.
  const [hasRevealed, setHasRevealed] = useState(false);

  useEffect(() => {
    if (isTriggered && !wasTriggeredOnMount.current && !hasRevealed) {
      setHasRevealed(true);

      // Play sound
      const soundPath = getBadgeSoundPath(tier, dimension);
      const audio = new Audio(soundPath);
      audio.volume = 1.0;
      audio.play().catch(() => {
        // Silent-fail on autoplay block
      });

      // Trigger haptic
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([50, 50, 100]);
      }
    }
  }, [isTriggered, hasRevealed, tier, dimension]);

  const prefix = dimensionToPrefix[dimension];
  const imagePath = `/badges/${prefix}_${tier}.webp`;

  // hasRevealed === true  → we observed the transition this lifetime → animate.
  // isTriggered && wasTriggeredOnMount && !hasRevealed → remount after reveal → static.
  // !isTriggered → hidden.
  const className = !isTriggered
    ? styles.badge
    : hasRevealed
      ? `${styles.badge} ${styles.badgeAnimated}`
      : `${styles.badge} ${styles.badgeStatic}`;

  return (
    <img
      src={imagePath}
      alt={t("badge_alt", { tier, dimension })}
      className={className}
    />
  );
}
