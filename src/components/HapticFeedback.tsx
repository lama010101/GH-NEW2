'use client';

import { useEffect } from 'react';

/**
 * Global haptic feedback for button clicks.
 *
 * Attaches a single capture-phase `click` listener on `document`. When a click
 * lands on (or inside) a `<button>`, fires `navigator.vibrate(10)`.
 *
 * Gated by the existing `gh_vibrate` localStorage flag (default `true`) so the
 * user's vibration preference stays the single source of truth. Silently no-ops
 * on browsers without the Vibration API (desktop).
 *
 * Renders nothing.
 */
export function HapticFeedback() {
  useEffect(() => {
    const handleClick = (event: Event) => {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return;
      }
      try {
        const stored = localStorage.getItem('gh_vibrate');
        if (stored === 'false') {
          return;
        }
      } catch {
        // localStorage unavailable (private mode / SSR guard) — allow default behavior.
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest('button');
      if (!button) {
        return;
      }
      navigator.vibrate(10);
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  return null;
}
