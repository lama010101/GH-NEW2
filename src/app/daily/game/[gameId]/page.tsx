"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useIdentity } from "@/hooks/useIdentity";

/**
 * Redirect handler for /daily/game/[gameId].
 * Fetches the session snapshot and redirects to the current round URL
 * (or /results if the session is complete). This prevents a 404 when a
 * user trims the URL and ensures they land on the correct view.
 */
export default function DailyGameRedirectPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";
  const router = useRouter();
  const { playerId, isLoading } = useIdentity();

  useEffect(() => {
    if (!gameId || !playerId || isLoading) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/compete/${gameId}?playerId=${playerId}`, { cache: "no-store" });
        if (!res.ok) {
          router.replace("/home");
          return;
        }
        const snap = await res.json();
        if (cancelled) return;
        if (snap?.status === "SESSION_COMPLETE") {
          router.replace(`/daily/game/${gameId}/results`);
        } else {
          const round = snap?.currentRoundIndex ?? 0;
          router.replace(`/daily/game/${gameId}/round/${round}`);
        }
      } catch {
        if (!cancelled) router.replace("/home");
      }
    })();

    return () => { cancelled = true };
  }, [gameId, playerId, isLoading, router]);

  return null;
}
