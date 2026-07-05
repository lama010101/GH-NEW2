'use client';

import { useState, useEffect, useCallback } from 'react';

// Shared rank card open/close state, persisted in localStorage so it
// survives page navigation and reloads. All 9 pages that render TopBar
// use this hook — closing the card on one page closes it everywhere.
//
// Single source of truth: localStorage key "gh_rank_open" ("true" | "false").
// Cross-page sync: a custom "gh-rank-open-change" event is dispatched on
// every toggle, so other mounted instances update without waiting for
// a storage event (which doesn't fire in the same tab/page).

const STORAGE_KEY = 'gh_rank_open';
const EVENT_NAME = 'gh-rank-open-change';

function readStored(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === 'true';
}

export function useRankOpen(): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(readStored);

  // Sync from other tabs / pages
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setOpen(readStored());
    };
    const onCustom = () => setOpen(readStored());
    window.addEventListener('storage', onStorage);
    window.addEventListener(EVENT_NAME, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(EVENT_NAME, onCustom);
    };
  }, []);

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      window.dispatchEvent(new Event(EVENT_NAME));
      return next;
    });
  }, []);

  return [open, toggle];
}
