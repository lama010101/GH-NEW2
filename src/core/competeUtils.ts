import type { SessionPlayer } from "./types";

const USERNAME_GRADIENT_PAIRS: [string, string][] = [
  ["#93c5fd", "#fb923c"], // blue → orange
  ["#93c5fd", "#c084fc"], // blue → purple
  ["#93c5fd", "#2dd4bf"], // blue → teal
  ["#fb923c", "#93c5fd"], // orange → blue
  ["#fb923c", "#c084fc"], // orange → purple
  ["#fb923c", "#2dd4bf"], // orange → teal
  ["#c084fc", "#93c5fd"], // purple → blue
  ["#c084fc", "#fb923c"], // purple → orange
  ["#c084fc", "#2dd4bf"], // purple → teal
  ["#2dd4bf", "#93c5fd"], // teal → blue
  ["#2dd4bf", "#fb923c"], // teal → orange
  ["#2dd4bf", "#c084fc"], // teal → purple
];

export { USERNAME_GRADIENT_PAIRS };

export function getUsernameGradientStyle(playerId: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  const [from, to] = USERNAME_GRADIENT_PAIRS[hash % USERNAME_GRADIENT_PAIRS.length];
  return {
    background: `linear-gradient(90deg, ${from}, ${to})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    fontWeight: 500,
    display: "inline",
  };
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function playerLabel(players: SessionPlayer[], playerId: string): string {
  const match = players.find((p) => p.playerId === playerId);
  if (match && match.displayName.trim().length > 0) {
    return match.displayName;
  }
  return shortId(playerId);
}

export function computeTimeRemaining(roundEndsAt: string | null): number | null {
  if (!roundEndsAt) return null;
  const endMs = new Date(roundEndsAt).getTime();
  if (Number.isNaN(endMs)) return null;
  return Math.max(0, Math.round((endMs - Date.now()) / 1000));
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function getBadgeSoundPath(tier: string, dimension: string): string {
  if (dimension === 'combo') {
    if (tier === 'gold') return '/sounds/badges/perfect-combo.mp3';
    if (tier === 'silver') return '/sounds/badges/great-combo.mp3';
    return '/sounds/badges/amazing-combo.mp3';
  }
  if (tier === 'gold') return '/sounds/badges/perfect.mp3';
  if (tier === 'silver') return '/sounds/badges/great.mp3';
  return '/sounds/badges/amazing.mp3';
}
