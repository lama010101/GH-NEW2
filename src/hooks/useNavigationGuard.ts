"use client";

import { useEffect } from "react";

/**
 * Warns the user before they refresh, close, or use the browser Back button
 * while `active` is true (e.g. a game round is in progress).
 *
 * App Router has no router navigation events, so only browser-level navigation
 * (beforeunload + popstate) is intercepted. In-app <Link>/router.push is not
 * blocked.
 */
export function useNavigationGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const message =
      "Leaving now will abandon your game in progress. Are you sure you want to leave?";

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    const handlePopState = () => {
      if (window.confirm(message)) {
        window.removeEventListener("popstate", handlePopState);
        window.history.back();
      } else {
        window.history.pushState(null, "", window.location.href);
      }
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [active]);
}

export default useNavigationGuard;
