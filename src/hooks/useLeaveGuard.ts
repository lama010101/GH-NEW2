"use client";

import { useEffect } from "react";
import type { SessionStatus } from "@/core/types";

/**
 * Block refresh/close and back-button navigation while the session is in one of
 * the supplied active phases (e.g. LOBBY, ROUND_ACTIVE, ROUND_COMPLETE).
 *
 * - beforeunload shows the native browser "unsaved changes" confirmation.
 * - popstate is intercepted by pushing an extra history entry so the back button
 *   stays on the current page.
 *
 * The guard is removed automatically when the status leaves the guarded set.
 */
export function useLeaveGuard(
  status: SessionStatus | null | undefined,
  gameId: string,
  guardStatuses: SessionStatus[],
) {
  // Normalize the status list so inline array literals with the same contents
  // do not re-trigger the effect on every render.
  const guardStatusesKey = guardStatuses.join(",");

  useEffect(() => {
    const isInGamePhase = !!status && guardStatuses.includes(status);
    if (!isInGamePhase) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    const handlePopState = (e: PopStateEvent) => {
      if (e.state === null) {
        window.history.pushState({ gameId }, "", window.location.href);
      }
    };

    window.history.pushState({ gameId }, "", window.location.href);

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [status, gameId, guardStatusesKey]);
}
