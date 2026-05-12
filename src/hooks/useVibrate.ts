import { useMemo } from 'react';

export type VibrateFn = (pattern: number | number[]) => boolean;

interface NavigatorWithVibrate {
  vibrate?: VibrateFn;
}

/**
 * Provides a stable vibration function when supported by the browser.
 * Returns `null` when running in non-browser environments or when the API is unavailable.
 */
export const useVibrate = (): VibrateFn | null => {
  return useMemo(() => {
    if (typeof navigator === 'undefined') {
      return null;
    }

    const typedNavigator = navigator as NavigatorWithVibrate;
    if (typeof typedNavigator.vibrate !== 'function') {
      return null;
    }

    return typedNavigator.vibrate.bind(typedNavigator);
  }, []);
};
