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
  isMe?: boolean;
  className?: string;
}

export default function PlayerAvatar({ avatarUrl, displayName, playerId, size = 26, submitted = false, isMe = false, className }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = (displayName || "?")[0].toUpperCase();
  const { color1, color2 } = playerId ? getPlayerFrameColor(playerId) : { color1: 'var(--gh-border-default)', color2: 'var(--gh-border-default)' };

  const outerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    boxSizing: "border-box",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    border: "none",
    padding: 4,
    background: `conic-gradient(${color1} 0deg 180deg, ${color2} 180deg 360deg)`,
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

  const dotSize = Math.max(6, Math.round(size / 4));
  const dotStyle: React.CSSProperties = {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: dotSize,
    height: dotSize,
    borderRadius: "50%",
    background: "var(--gh-teal)",
    border: "2px solid var(--gh-bg-base)",
    boxShadow: "0 0 0 1px var(--gh-teal)",
    zIndex: 1,
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
      {isMe && <span style={dotStyle} aria-hidden="true" />}
    </span>
  );
}
