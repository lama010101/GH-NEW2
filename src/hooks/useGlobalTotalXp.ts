"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/core/supabaseBrowser";

export type GlobalTotalXpStatus = "pending" | "ready" | "unavailable";

// Fetch the viewer's global total XP for the rank ladder card
// (single source of truth: player_global_stats.total_xp → rankForXp → RankLadderCard).
// 'pending' while the query is in flight, 'ready' with a finite total_xp,
// 'unavailable' when there is no playerId, no row, or any query failure —
// the ladder must never stay pending forever or render a fabricated 0.
export function useGlobalTotalXp(playerId?: string | null): { status: GlobalTotalXpStatus; totalXp: number | null } {
  const [state, setState] = useState<{ status: GlobalTotalXpStatus; totalXp: number | null }>({
    status: "pending",
    totalXp: null,
  });

  useEffect(() => {
    if (!playerId) {
      setState({ status: "unavailable", totalXp: null });
      return;
    }
    let cancelled = false;
    setState({ status: "pending", totalXp: null });
    (async () => {
      try {
        const { data: stats, error } = await supabaseBrowser
          .from("player_global_stats")
          .select("total_xp")
          .eq("player_id", playerId)
          .maybeSingle();
        if (cancelled) return;
        const xp = stats?.total_xp == null ? NaN : Number(stats.total_xp);
        if (!error && stats && Number.isFinite(xp)) {
          setState({ status: "ready", totalXp: xp });
        } else {
          setState({ status: "unavailable", totalXp: null });
        }
      } catch {
        if (!cancelled) setState({ status: "unavailable", totalXp: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return state;
}
