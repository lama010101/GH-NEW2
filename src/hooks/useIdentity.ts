"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapIdentity,
  subscribeToIdentityChanges,
  type IdentityState
} from "@/core/identity";

export type UseIdentityReturn = {
  state: IdentityState;
  playerId: string | null;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
};

export function useIdentity(): UseIdentityReturn {
  const [state, setState] = useState<IdentityState>({ status: "loading" });
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    bootstrapIdentity().then(setState);

    const unsubscribe = subscribeToIdentityChanges(setState);
    return unsubscribe;
  }, []);

  const playerId = state.status === "ready" ? state.playerId : null;
  const isReady = state.status === "ready";
  const isLoading = state.status === "loading";
  const error = state.status === "error" ? state.error : null;

  return { state, playerId, isReady, isLoading, error };
}
