import React from "react";
import styles from './PlayerAvatar.module.css';

interface PlayerAvatarProps {
  avatarUrl: string | null;
  displayName: string;
  size?: number;
}

export default function PlayerAvatar({ avatarUrl, displayName, size = 26 }: PlayerAvatarProps) {
  const initial = (displayName || "?")[0].toUpperCase();
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "hidden",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--gh-glass-bg-hover)",
    border: "1.5px solid var(--gh-border-default)",
    fontSize: size * 0.42,
    fontWeight: 600,
    color: "var(--gh-text-secondary)",
    verticalAlign: "middle",
  };
  if (avatarUrl) {
    return (
      <span style={containerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={displayName}
          className={styles.avatarImg}
          onError={(e) => { 
            (e.currentTarget as HTMLImageElement).style.display = "none"; 
            const parent = (e.currentTarget as HTMLImageElement).parentElement;
            if (parent) {
              parent.textContent = initial;
            }
          }}
        />
      </span>
    );
  }
  return <span style={containerStyle}>{initial}</span>;
}
