"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
  initials?: string;
  onClick?: (e: React.MouseEvent) => void;
  disableProfileNavigation?: boolean;
}

export default function PlayerAvatar({
  avatarUrl,
  displayName,
  playerId,
  size = 26,
  submitted = false,
  isMe = false,
  className,
  initials,
  onClick,
  disableProfileNavigation = false,
}: PlayerAvatarProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const initial = initials ?? (displayName || "?")[0].toUpperCase();
  const { color1, color2 } = playerId ? getPlayerFrameColor(playerId) : { color1: 'var(--gh-border-default)', color2: 'var(--gh-border-default)' };
  // Scale the frame/gap/ring thickness with avatar size so small avatars
  // (e.g. 32-40px on the leaderboard) keep the same visual ring proportion as
  // the large profile avatar (110px ~ 2px ring). Clamp to a 0.5px minimum.
  const ring = Math.max(0.5, Math.round((size / 55) * 100) / 100);
  const ringColor = submitted ? 'var(--gh-success)' : 'var(--gh-border-default)';

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
      return;
    }
    if (!disableProfileNavigation && playerId) {
      e.stopPropagation();
      router.push(`/profile?playerId=${playerId}`);
    }
  };

  const containerStyle: React.CSSProperties = {
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
    padding: 0,
    margin: 0,
    background: "transparent",
    verticalAlign: "middle",
    cursor: (onClick || (!disableProfileNavigation && playerId)) ? "pointer" : "default",
  };

  const frameStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    boxSizing: "border-box",
    padding: ring,
    background: `conic-gradient(from 0deg, ${color1}, ${color2}, ${color1})`,
    backgroundClip: "padding-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const gapStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    boxSizing: "border-box",
    padding: ring,
    background: "transparent",
  };

  const ringStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    boxSizing: "border-box",
    padding: ring,
    background: ringColor,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const avatarStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    boxSizing: "border-box",
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

  const content = (
    <span style={frameStyle}>
      <span style={gapStyle}>
        <span style={ringStyle}>
          <span style={avatarStyle}>
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
      </span>
    </span>
  );

  if (onClick || (!disableProfileNavigation && playerId)) {
    return (
      <button
        type="button"
        className={className}
        style={containerStyle}
        onClick={handleClick}
        aria-label={displayName}
      >
        {content}
        {isMe && <span style={dotStyle} aria-hidden="true" />}
      </button>
    );
  }

  return (
    <span className={className} style={containerStyle}>
      {content}
      {isMe && <span style={dotStyle} aria-hidden="true" />}
    </span>
  );
}
