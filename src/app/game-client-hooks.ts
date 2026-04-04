"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { GameAction } from "@/core/gameEngine";
import { bootGameState, saveGameState } from "@/core/gamePersistence";
import { runPreflightCheck } from "@/core/preflight";
import type { EventRecord, GamePhase, GameState } from "@/core/types";
import { fetchEvents } from "@/core/eventsApi";

type GameDispatch = Dispatch<GameAction>;
type NullableStringSetter = Dispatch<SetStateAction<string | null>>;

/**
 * Hook to load real events from the API
 */
export function useEventsLoader() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadEvents() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchEvents({ count: 5 });
        if (!isCancelled) {
          setEvents(response.events);
        }
      } catch (err) {
        console.warn("Failed to fetch events from API:", err);
        if (!isCancelled) {
          setEvents([]);
          setError(err instanceof Error ? err.message : "Failed to load events");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadEvents();

    return () => {
      isCancelled = true;
    };
  }, []);

  return { events, isLoading, error, setEvents };
}

export function useGameBootstrap({
  routeGameId,
  events,
  isEventsLoading,
  dispatch,
  setPersistenceError
}: {
  routeGameId?: string;
  events: EventRecord[];
  isEventsLoading: boolean;
  dispatch: GameDispatch;
  setPersistenceError: NullableStringSetter;
}) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (isEventsLoading) {
      setIsBootstrapping(true);
      return () => {
        isCancelled = true;
      };
    }

    if (events.length === 0) {
      setIsBootstrapping(false);
      setIsHydrated(false);
      return () => {
        isCancelled = true;
      };
    }

    setIsBootstrapping(true);
    setIsHydrated(false);
    setBootError(null);

    void bootGameState({
      routeGameId,
      events
    })
      .then((bootedState) => {
        if (isCancelled) {
          return;
        }

        dispatch({ type: "HYDRATE", state: bootedState });
        setPersistenceError(null);
        setIsHydrated(true);
        setIsBootstrapping(false);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        setBootError(error instanceof Error ? error.message : "Unable to load game state");
        setIsBootstrapping(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [dispatch, events, isEventsLoading, routeGameId, setPersistenceError]);

  return {
    isBootstrapping,
    isHydrated,
    bootError
  };
}

export function useGameAutosave({
  isHydrated,
  state,
  setPersistenceError
}: {
  isHydrated: boolean;
  state: GameState;
  setPersistenceError: NullableStringSetter;
}) {
  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let isCancelled = false;

    void saveGameState(state)
      .then(() => {
        if (isCancelled) {
          return;
        }

        setPersistenceError(null);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        setPersistenceError(error instanceof Error ? error.message : "Unable to save game state");
      });

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, setPersistenceError, state]);
}

export function useGameRouteSync({
  isHydrated,
  sharePath
}: {
  isHydrated: boolean;
  sharePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (pathname === sharePath) {
      return;
    }

    router.replace(sharePath);
  }, [isHydrated, pathname, router, sharePath]);
}

export function usePreflightPhase({
  phase,
  dispatch,
  events
}: {
  phase: GamePhase;
  dispatch: GameDispatch;
  events: EventRecord[];
}) {
  useEffect(() => {
    if (phase !== "PREFLIGHT_CHECK") {
      return;
    }

    dispatch({ type: "COMPLETE_PREFLIGHT", preflight: runPreflightCheck(events) });
  }, [dispatch, events, phase]);
}

export function useRoundResolution({
  phase,
  dispatch
}: {
  phase: GamePhase;
  dispatch: GameDispatch;
}) {
  useEffect(() => {
    if (phase !== "ROUND_LOCK") {
      return;
    }

    dispatch({ type: "EVALUATE_ROUND" });
  }, [dispatch, phase]);

  useEffect(() => {
    if (phase !== "ROUND_EVALUATE") {
      return;
    }

    dispatch({ type: "COMPLETE_EVALUATION" });
  }, [dispatch, phase]);
}

export function useRoundTimer({
  phase,
  dispatch
}: {
  phase: GamePhase;
  dispatch: GameDispatch;
}) {
  useEffect(() => {
    if (phase !== "ROUND_START" && phase !== "ROUND_ACTIVE") {
      return;
    }

    const interval = window.setInterval(() => {
      dispatch({ type: "TICK" });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [dispatch, phase]);
}
