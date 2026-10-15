"use client";

// LEARN-BUILD-EVENTMODAL-API-1015-001
// Lazy fetch for the post-round learn modal — fires ONLY while open=true.

import { useCallback, useEffect, useState } from "react";
import type { EventLearnResponse, LearnMode } from "@/core/learnTypes";

export type EventLearnState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: EventLearnResponse };

export function useEventLearn(
  open: boolean,
  eventId: string | null | undefined,
  gameId: string | null | undefined,
  mode: LearnMode
): { state: EventLearnState; refetch: () => void } {
  const [state, setState] = useState<EventLearnState>({ status: "idle" });
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!open || !eventId || !gameId) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    fetch(
      `/api/learn/event/${encodeURIComponent(eventId)}` +
        `?gameId=${encodeURIComponent(gameId)}` +
        `&mode=${encodeURIComponent(mode)}`
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as EventLearnResponse;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [open, eventId, gameId, mode, nonce]);

  return { state, refetch };
}
