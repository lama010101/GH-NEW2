"use client";

import React, { useState } from "react";
import { getPlayerFrameColor } from "@/core/competeUtils";
import { toProxiedImageUrl } from "@/lib/imageProxy";
import styles from './PlayerAvatar.module.css';

interface PlayerAvatarProps {
  avatarUrl: string | null;
  displayName: string;
  playerId?: string;
  size?: number;
  submitted?: boolean;
  className?: string;
}

export default function PlayerAvatar({ avatarUrl, displayName, playerId, size = 26, submitted = false, className }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = (displayName || "?")[0].toUpperCase();
  const frameColor = playerId ? getPlayerFrameColor(playerId) : 'var(--gh-border-default)';

  const outerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    boxSizing: "border-box",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `2px solid ${frameColor}`,
    padding: 2,
    verticalAlign: "middle",
  };

  const innerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    boxSizing: "border-box",
    border: `2px solid ${submitted ? 'var(--gh-success)' : 'var(--gh-border-default)'}`,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--gh-glass-bg-hover)",
    fontSize: size * 0.42,
    fontWeight: 600,
    color: "var(--gh-text-secondary)",
  };

  return (
    <span className={className} style={outerStyle}>
      <span style={innerStyle}>
        {avatarUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toProxiedImageUrl(avatarUrl) ?? ''}
            alt={displayName}
            className={styles.avatarImg}
            onError={() => setImgError(true)}
          />
        ) : initial}
      </span>
    </span>
  );
}
