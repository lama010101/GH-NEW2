// Relax (async) PWA install interstitial — iOS Safari non-PWA detection + skip persistence.
// Single source of truth: behaviour depends only on navigator + localStorage (deterministic).

export const RELAX_PWA_INTERSTITIAL_SKIPPED_KEY = "relax_pwa_interstitial_skipped";

type NavigatorStandalone = Navigator & { standalone?: boolean };

/**
 * Returns true only on iOS Safari that is NOT installed as a PWA.
 * Android, desktop, and non-Safari iOS browsers are excluded entirely.
 */
export function isIOsSafariNonPwa(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as NavigatorStandalone;
  // Already installed as PWA → never show (installed check takes priority).
  if (nav.standalone === true) return false;
  const ua = nav.userAgent || "";
  const platform = nav.platform || "";
  // iOS platform detection (excludes Android/desktop entirely).
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === "MacIntel" && typeof nav.maxTouchPoints === "number" && nav.maxTouchPoints > 1);
  if (!isIOS) return false;
  // Exclude non-Safari iOS browsers (Chrome/Firefox/Edge on iOS report CriOS/FxiOS/EdgiOS).
  if (/CriOS|FxiOS|EdgiOS/.test(ua)) return false;
  // iOS Safari in-browser reports navigator.standalone === false.
  return nav.standalone === false;
}

/**
 * Returns true if the Relax PWA interstitial should be shown now.
 * Installed (standalone) state and the skip flag both suppress it.
 */
export function shouldShowRelaxPwaInterstitial(): boolean {
  if (!isIOsSafariNonPwa()) return false;
  try {
    if (localStorage.getItem(RELAX_PWA_INTERSTITIAL_SKIPPED_KEY) === "1") return false;
  } catch {
    // localStorage unavailable — do not block the user.
    return false;
  }
  return true;
}

/**
 * Persist the skip so the interstitial does not reappear for either flow
 * (host create or invitee join) on the same device/browser.
 */
export function markRelaxPwaInterstitialSkipped(): void {
  try {
    localStorage.setItem(RELAX_PWA_INTERSTITIAL_SKIPPED_KEY, "1");
  } catch {
    // ignore storage errors
  }
}
