// MP-BUILD-LEFTPLAYER-NOTICE-1021-004 — pure helpers for the sync-mode leave
// toast + solo banner. leftAt (SessionPlayer.left_at → ISO string | null) is the
// single source of truth; the DO already grace-filters transient disconnects
// (LEAVE_GRACE_MS + jitter), so any null→set transition observed here is a real
// leave/kick, not a socket blip. Feature is sync-only: Relax closes early below
// 2 active players, so "continue solo" cannot apply there.
import type { SessionMode, SessionPlayer, SessionStatus } from "@/core/types";

/** Toasts/banner only exist in these statuses (never LOBBY, never SESSION_COMPLETE). */
const NOTICE_STATUSES: ReadonlyArray<SessionStatus> = ["ROUND_ACTIVE", "ROUND_COMPLETE"];

export function shouldShowNotices(status: SessionStatus, mode: SessionMode): boolean {
  return mode === "sync" && NOTICE_STATUSES.includes(status);
}

/** Dedup key — `${playerId}:${leftAt}` so a rejoin-and-leave-again produces a new key. */
export function toastKey(playerId: string, leftAt: string): string {
  return `${playerId}:${leftAt}`;
}

/**
 * Players present in BOTH snapshots whose leftAt went null→set, excluding the
 * local player. prevPlayers=null (first snapshot / post-reconnect reseed) → [].
 */
export function deriveNewlyLeft(
  prevPlayers: SessionPlayer[] | null,
  nextPlayers: SessionPlayer[],
  localPlayerId: string | null,
): SessionPlayer[] {
  if (!prevPlayers) return [];
  const prevById = new Map(prevPlayers.map((p) => [p.playerId, p]));
  return nextPlayers.filter((p) => {
    if (p.playerId === localPlayerId) return false;
    const prev = prevById.get(p.playerId);
    return !!prev && prev.leftAt === null && p.leftAt !== null;
  });
}

/**
 * True when the local player is active, at least one other player exists, and
 * every other player (human or AI) has leftAt set. Derived each render — a
 * rejoin flips it back to false automatically.
 */
export function isSolo(players: SessionPlayer[], localPlayerId: string | null): boolean {
  if (!localPlayerId || players.length < 2) return false;
  const local = players.find((p) => p.playerId === localPlayerId);
  if (!local || local.leftAt !== null) return false;
  return players.every((p) => p.playerId === localPlayerId || p.leftAt !== null);
}
