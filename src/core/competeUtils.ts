import type { SessionPlayer } from "./types";

const FRAME_COLOR_PALETTE = [
  'var(--gh-orange)',
  'var(--gh-blue)',
  'var(--gh-violet)',
  'var(--gh-gold)',
  'var(--gh-teal)',
  'var(--gh-success)',
  'var(--gh-danger)',
  'var(--gh-where-solid)',
  'var(--gh-when-solid)',
] as const;

export interface PlayerFrameColors {
  color1: string;
  color2: string;
}

export function getPlayerFrameColor(playerId: string): PlayerFrameColors {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = Math.imul(hash, 31) + playerId.charCodeAt(i);
  }
  const n = FRAME_COLOR_PALETTE.length;
  const idx1 = Math.abs(hash) % n;
  const idx2 = (idx1 + 1 + (Math.abs(hash >> 8) % (n - 1))) % n;
  return {
    color1: FRAME_COLOR_PALETTE[idx1],
    color2: FRAME_COLOR_PALETTE[idx2],
  };
}

// KC-009 gate live-fire test
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getUsernameGradientStyle(_playerId: string): React.CSSProperties {
  return {
    color: 'var(--gh-text-primary)',
    fontWeight: 500,
    display: 'inline',
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

export function hasSubmitted(
  result: { didSubmit?: boolean; guessYear?: number | null } | null | undefined
): boolean {
  if (!result) return false;
  if (result.didSubmit === true) return true;
  return result.guessYear !== null && result.guessYear !== undefined;
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
  let dLng = (lng2 - lng1) * Math.PI / 180;
  if (dLng > Math.PI) dLng -= 2 * Math.PI;
  else if (dLng < -Math.PI) dLng += 2 * Math.PI;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function getBadgeSoundPath(tier: string, dimension: string): string {
  if (dimension === 'combo') {
    if (tier === 'gold') return '/sounds/badges/perfect-combo.mp3';
    if (tier === 'silver') return '/sounds/badges/amazing-combo.mp3';
    return '/sounds/badges/great-combo.mp3';
  }
  if (tier === 'gold') return '/sounds/badges/perfect.mp3';
  if (tier === 'silver') return '/sounds/badges/amazing.mp3';
  return '/sounds/badges/great.mp3';
}
