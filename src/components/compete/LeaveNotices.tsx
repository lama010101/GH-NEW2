"use client";

// MP-BUILD-LEFTPLAYER-NOTICE-1021-004 — sync Compete leave notices.
//   • Toast "{name} left the game" on every OTHER player's leftAt null→set
//     transition between consecutive snapshots (deduped by playerId:leftAt;
//     never on hydration / post-reconnect reseed / for the local player).
//   • Non-blocking banner "You're the only player left" when the local player
//     is the sole active player — Continue solo (sessionStorage-dismissed) or
//     Exit game (router.push("/home"), the existing leave path).
// Sync-only, ROUND_ACTIVE/ROUND_COMPLETE only — gated by shouldShowNotices().

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ConnectionState } from "@/core/competeWebSocket";
import type { SessionMode, SessionPlayer, SessionStatus } from "@/core/types";
import { deriveNewlyLeft, isSolo, shouldShowNotices, toastKey } from "./leaveNoticesHelpers";
import styles from "./LeaveNotices.module.css";

type LeaveToast = { key: string; text: string };
const TOAST_MS = 4000;
const MAX_TOASTS = 3;
const soloKey = (sessionId: string) => `gh:solo-banner-dismissed:${sessionId}`;

export function LeaveNotices({
  players,
  status,
  mode,
  localPlayerId,
  connectionState,
  sessionId,
}: {
  players: SessionPlayer[];
  status: SessionStatus;
  mode: SessionMode;
  localPlayerId: string | null;
  connectionState: ConnectionState;
  sessionId: string;
}) {
  const t = useTranslations("game");
  const router = useRouter();
  const [toasts, setToasts] = useState<LeaveToast[]>([]);
  const prevPlayersRef = useRef<SessionPlayer[] | null>(null);
  const reseedRef = useRef(true);
  const seenRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<number[]>([]);
  const [soloDismissed, setSoloDismissed] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(soloKey(sessionId)) !== null;
    } catch {
      return false;
    }
  });

  // Any break from OPEN marks the next snapshot as a reseed (silent).
  useEffect(() => {
    if (connectionState !== "OPEN") reseedRef.current = true;
  }, [connectionState]);

  useEffect(() => () => {
    timersRef.current.forEach((id) => clearTimeout(id));
  }, []);

  useEffect(() => {
    if (reseedRef.current) {
      reseedRef.current = false;
      prevPlayersRef.current = players;
      return;
    }
    const prev = prevPlayersRef.current;
    prevPlayersRef.current = players;
    if (!shouldShowNotices(status, mode)) return;
    const newlyLeft = deriveNewlyLeft(prev, players, localPlayerId);
    if (newlyLeft.length === 0) return;
    const fresh: LeaveToast[] = [];
    for (const p of newlyLeft) {
      const key = toastKey(p.playerId, p.leftAt as string);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      fresh.push({ key, text: t("player_left_toast", { name: p.displayName }) });
    }
    if (fresh.length === 0) return;
    setToasts((cur) => [...cur, ...fresh].slice(-MAX_TOASTS));
    for (const toast of fresh) {
      const id = window.setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.key !== toast.key));
      }, TOAST_MS);
      timersRef.current.push(id);
    }
  }, [players, status, mode, localPlayerId, t]);

  if (!shouldShowNotices(status, mode)) return null;

  const solo = isSolo(players, localPlayerId);
  const dismissSolo = () => {
    setSoloDismissed(true);
    try {
      sessionStorage.setItem(soloKey(sessionId), "1");
    } catch {
      // storage unavailable — dismissal is render-state only this session
    }
  };

  return (
    <div className={styles.stack}>
      {solo && !soloDismissed && (
        <div className={styles.soloBanner} data-testid="solo-banner">
          <span className={styles.soloBannerTitle}>{t("solo_banner_title")}</span>
          <div className={styles.soloBannerActions}>
            <button
              type="button"
              className={styles.soloContinueBtn}
              data-testid="solo-continue-btn"
              onClick={dismissSolo}
            >
              {t("solo_continue")}
            </button>
            <button
              type="button"
              className={styles.soloExitBtn}
              data-testid="solo-exit-btn"
              onClick={() => router.push("/home")}
            >
              {t("solo_exit")}
            </button>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className={styles.toastList} role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.key} className={styles.toast} data-testid="leave-toast">
              {toast.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
