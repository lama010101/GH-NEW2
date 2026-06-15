"use client";

import { useEffect, useRef } from "react";
import { getBadgeSoundPath } from "@/core/competeUtils";
import styles from "./InlineImageBadge.module.css";

interface InlineImageBadgeProps {
  dimension: 'combo' | 'location' | 'year';
  tier: 'gold' | 'silver' | 'bronze';
  isTriggered: boolean;
}

const dimensionToPrefix: Record<string, string> = {
  location: 'map',
  year: 'calendar',
  combo: 'combo',
};

export default function InlineImageBadge({ dimension, tier, isTriggered }: InlineImageBadgeProps) {
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (isTriggered && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;

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
  }, [isTriggered, tier, dimension]);

  const prefix = dimensionToPrefix[dimension];
  const imagePath = `/badges/${prefix}_${tier}.webp`;

  return (
    <img
      src={imagePath}
      alt={`${tier} ${dimension} badge`}
      className={`${styles.badge} ${isTriggered ? styles.badgeVisible : ''}`}
    />
  );
}
