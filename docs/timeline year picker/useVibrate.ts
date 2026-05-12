import { useMemo } from 'react';

export type VibrateFn = (pattern: number | number[]) => boolean;

/**
 * Provides a stable vibration function when supported by the browser.
 * Returns `null` when running in non-browser environments or when the API is unavailable.
 */
export const useVibrate = (): VibrateFn | null => {
  return useMemo(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate.bind(navigator);
    }
    return null;
  }, []);
};
