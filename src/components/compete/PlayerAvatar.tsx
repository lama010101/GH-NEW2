import React from "react";

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
    background: "#2a2a3a",
    border: "1.5px solid rgba(255,255,255,0.18)",
    fontSize: size * 0.42,
    fontWeight: 600,
    color: "rgba(255,255,255,0.75)",
    verticalAlign: "middle",
  };
  if (avatarUrl) {
    return (
      <span style={containerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={displayName}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </span>
    );
  }
  return <span style={containerStyle}>{initial}</span>;
}
