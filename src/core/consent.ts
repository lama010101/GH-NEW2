"use client";

import { useSyncExternalStore } from "react";

/**
 * UX-BUILD-CONSENTGATE-1125-893 — single owner of analytics consent state.
 *
 * State: 'unknown' (never asked / expired) | 'granted' | 'denied'.
 * Persisted in localStorage with a timestamp; a choice older than
 * CONSENT_MAX_AGE_MS (~6 months) is treated as 'unknown' so the banner
 * asks again. All storage access is wrapped in try/catch because
 * localStorage may be unavailable or throw (private mode, quotas).
 *
 * subscribeConsent/requestConsentReopen let the banner and the footer
 * "Cookie settings" control share one source of truth.
 */

export type ConsentState = "unknown" | "granted" | "denied";
export type ConsentChoice = Exclude<ConsentState, "unknown">;

export const CONSENT_STORAGE_KEY = "gh_analytics_consent_v1";
export const CONSENT_MAX_AGE_MS = 183 * 24 * 60 * 60 * 1000; // ~6 months

interface StoredConsent {
  v: 1;
  state: ConsentChoice;
  ts: number;
}

const listeners = new Set<() => void>();
let reopenRequested = false;

function consentStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readConsent(): ConsentState {
  const storage = consentStorage();
  if (!storage) return "unknown";
  try {
    const raw = storage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return "unknown";
    const parsed = JSON.parse(raw) as StoredConsent;
    if (
      (parsed.state !== "granted" && parsed.state !== "denied") ||
      typeof parsed.ts !== "number" ||
      parsed.v !== 1
    ) {
      return "unknown";
    }
    if (Date.now() - parsed.ts > CONSENT_MAX_AGE_MS) return "unknown";
    return parsed.state;
  } catch {
    return "unknown";
  }
}

function clearAnalyticsCookies(): void {
  try {
    if (typeof document === "undefined") return;
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0].trim();
      if (name === "_ga" || name.startsWith("_ga_")) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    }
  } catch {
    // best effort only
  }
}

export function writeConsent(state: ConsentChoice): void {
  const storage = consentStorage();
  try {
    const value: StoredConsent = { v: 1, state, ts: Date.now() };
    storage?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage may throw — choice still applies for this session's listeners
  }
  reopenRequested = false;
  if (state === "denied") clearAnalyticsCookies();
  listeners.forEach((listener) => listener());
}

export function requestConsentReopen(): void {
  reopenRequested = true;
  listeners.forEach((listener) => listener());
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConsentSnapshot(): ConsentState {
  return readConsent();
}

export function getConsentBannerSnapshot(): boolean {
  return readConsent() === "unknown" || reopenRequested;
}

export function useConsentState(): ConsentState {
  return useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    () => "unknown"
  );
}

export function useConsentBannerVisible(): boolean {
  return useSyncExternalStore(
    subscribeConsent,
    getConsentBannerSnapshot,
    () => false
  );
}
