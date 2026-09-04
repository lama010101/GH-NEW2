'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });

    // Fires once a new SW has taken control of this tab (after skipWaiting +
    // clients.claim() on a fresh deploy). A plain refresh won't pick up the
    // new JS, so force a reload to move the tab onto the new build.
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) {
        return;
      }
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
