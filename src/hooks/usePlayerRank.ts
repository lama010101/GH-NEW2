"use client";

import { useEffect, useState } from "react";
import { readSession } from "@/core/supabaseBrowser";
import { rankAccuracyGateEnabled, type RankGateInfo } from "@/core/rank";

// RANK-BUILD-ACCGATE-1103-003: gated high-water-mark rank for display
// surfaces (TopBar pill, RankLadderCard). When NEXT_PUBLIC_RANK_ACCURACY_GATE
// is off the hook stays 'disabled' and makes NO request — callers keep the
// XP-derived path. When on, one single-flight POST per mount is shared via a
// short module-level cache. Auth reads go through readSession() only
// (single-flight getSession wrapper; never getUser, no Promise.race between
// GoTrue calls, no retry loop).

export type PlayerRankStatus = "disabled" | "pending" | "ready" | "unavailable";

export interface PlayerRankState {
  status: PlayerRankStatus;
  tier: number | null;
  maxRankTier: number | null;
  gate: RankGateInfo | null;
}

const DISABLED: PlayerRankState = { status: "disabled", tier: null, maxRankTier: null, gate: null };
const UNAVAILABLE: PlayerRankState = { status: "unavailable", tier: null, maxRankTier: null, gate: null };

const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: PlayerRankState } | null = null;
let inflight: Promise<PlayerRankState> | null = null;

function postRankStatus(): Promise<PlayerRankState> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return Promise.resolve(cache.value);
  }
  if (!inflight) {
    inflight = (async (): Promise<PlayerRankState> => {
      const res = await fetch("/api/player/rank-status", { method: "POST" });
      if (!res.ok) throw new Error(`rank-status ${res.status}`);
      const body = await res.json();
      if (!body?.gateEnabled) return DISABLED;
      return {
        status: "ready",
        tier: typeof body.tier === "number" ? body.tier : null,
        maxRankTier: typeof body.maxRankTier === "number" ? body.maxRankTier : null,
        gate: body.gate ?? null,
      };
    })()
      .then((value) => {
        if (value.status === "ready") cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function usePlayerRank(): PlayerRankState {
  const [state, setState] = useState<PlayerRankState>(() =>
    rankAccuracyGateEnabled() && cache && Date.now() - cache.at < CACHE_TTL_MS
      ? cache!.value
      : rankAccuracyGateEnabled()
        ? { status: "pending", tier: null, maxRankTier: null, gate: null }
        : DISABLED
  );

  useEffect(() => {
    if (!rankAccuracyGateEnabled()) return; // flag off → no request at all
    let cancelled = false;
    (async () => {
      try {
        const session = await readSession();
        if (!session) {
          if (!cancelled) setState(UNAVAILABLE);
          return;
        }
        const value = await postRankStatus();
        if (!cancelled) setState(value);
      } catch {
        if (!cancelled) setState(UNAVAILABLE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
