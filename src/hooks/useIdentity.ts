"use client";

import { useEffect, useRef, useState } from "react";
import {
  bootstrapIdentity,
  subscribeToIdentityChanges,
  getCachedIdentityState,
  type IdentityState
} from "@/core/identity";

export type UseIdentityReturn = {
  state: IdentityState;
  playerId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
};

export function useIdentity(): UseIdentityReturn {
  const [state, setState] = useState<IdentityState>(getCachedIdentityState);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    bootstrapIdentity().then(setState);

    const unsubscribe = subscribeToIdentityChanges(setState);
    return unsubscribe;
  }, []);

  const playerId = state.status === "ready" ? state.playerId : null;
  const displayName = state.status === "ready" ? state.displayName : null;
  const avatarUrl = state.status === "ready" ? state.avatarUrl : null;
  const isReady = state.status === "ready";
  const isLoading = state.status === "loading";
  const error = state.status === "error" ? state.error : null;

  return { state, playerId, displayName, avatarUrl, isReady, isLoading, error };
}
