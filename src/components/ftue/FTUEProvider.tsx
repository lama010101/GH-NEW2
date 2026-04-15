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

"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useFTUE as useFTUEHook, FTUEState } from "@/hooks/useFTUE";

interface FTUEContextType {
  state: FTUEState;
  markFeatureSeen: (feature: keyof Omit<FTUEState, "coachmarksEnabled" | "lastSeenAt">) => void;
  resetFTUE: () => void;
  toggleCoachmarks: (enabled: boolean) => void;
  isFirstTime: boolean;
}

const FTUEContext = createContext<FTUEContextType | undefined>(undefined);

export function FTUEProvider({ children }: { children: ReactNode }) {
  const ftue = useFTUEHook();

  return (
    <FTUEContext.Provider value={ftue}>
      {children}
    </FTUEContext.Provider>
  );
}

export function useFTUEContext() {
  const context = useContext(FTUEContext);
  if (context === undefined) {
    throw new Error("useFTUEContext must be used within a FTUEProvider");
  }
  return context;
}
