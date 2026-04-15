/**
 * ⚠️ FTUE SYSTEM — DISABLED / NOT IN USE
 *
 * This system is intentionally NOT integrated.
 *
 * DO NOT:
 * - Use in multiplayer
 * - Mount during active rounds
 * - Connect to game phase or timers
 * - Block user interaction
 *
 * Any future integration must respect server-authoritative architecture.
 */

import { useCallback, useEffect, useState } from "react";

// FTUE Feature Flag Types
export interface FTUEState {
  hasSeenWelcome: boolean;
  hasSeenMapTutorial: boolean;
  hasSeenYearSliderTutorial: boolean;
  hasSeenHintTutorial: boolean;
  hasSeenTimerExplanation: boolean;
  hasSeenScoringExplanation: boolean;
  hasSeenCinematicTip: boolean;
  hasSeenResultsWalkthrough: boolean;
  coachmarksEnabled: boolean;
  lastSeenAt: string | null;
}

const FTUE_STORAGE_KEY = "gh-ftue-state";

const defaultFTUEState: FTUEState = {
  hasSeenWelcome: false,
  hasSeenMapTutorial: false,
  hasSeenYearSliderTutorial: false,
  hasSeenHintTutorial: false,
  hasSeenTimerExplanation: false,
  hasSeenScoringExplanation: false,
  hasSeenCinematicTip: false,
  hasSeenResultsWalkthrough: false,
  coachmarksEnabled: true,
  lastSeenAt: null,
};

export function useFTUE(): {
  state: FTUEState;
  markFeatureSeen: (feature: keyof Omit<FTUEState, "coachmarksEnabled" | "lastSeenAt">) => void;
  resetFTUE: () => void;
  toggleCoachmarks: (enabled: boolean) => void;
  isFirstTime: boolean;
} {
  const [state, setState] = useState<FTUEState>(defaultFTUEState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const stored = localStorage.getItem(FTUE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setState({ ...defaultFTUEState, ...parsed });
      }
    } catch (e) {
      console.error("[FTUE] Failed to load state:", e);
    }
    setIsLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") return;
    
    try {
      localStorage.setItem(FTUE_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("[FTUE] Failed to save state:", e);
    }
  }, [state, isLoaded]);

  const markFeatureSeen = useCallback((feature: keyof Omit<FTUEState, "coachmarksEnabled" | "lastSeenAt">) => {
    setState((prev) => ({
      ...prev,
      [feature]: true,
      lastSeenAt: new Date().toISOString(),
    }));
  }, []);

  const resetFTUE = useCallback(() => {
    setState(defaultFTUEState);
  }, []);

  const toggleCoachmarks = useCallback((enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      coachmarksEnabled: enabled,
    }));
  }, []);

  const isFirstTime = !state.hasSeenWelcome && !state.lastSeenAt;

  return {
    state,
    markFeatureSeen,
    resetFTUE,
    toggleCoachmarks,
    isFirstTime,
  };
}

// Hook for individual feature visibility
export function useFTUEFeature(feature: keyof Omit<FTUEState, "coachmarksEnabled" | "lastSeenAt">): {
  shouldShow: boolean;
  markSeen: () => void;
  dismiss: () => void;
} {
  const { state, markFeatureSeen, toggleCoachmarks } = useFTUE();
  
  const shouldShow = !state[feature] && state.coachmarksEnabled;
  
  const markSeen = useCallback(() => {
    markFeatureSeen(feature);
  }, [feature, markFeatureSeen]);

  const dismiss = useCallback(() => {
    toggleCoachmarks(false);
  }, [toggleCoachmarks]);

  return { shouldShow, markSeen, dismiss };
}
