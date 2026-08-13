'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export type PlayerFilter = {
  humans: boolean;
  ai: boolean;
  friends: boolean;
};

export const DEFAULT_PLAYER_FILTER: PlayerFilter = {
  humans: false,
  ai: false,
  friends: false,
};

const STORAGE_KEY = 'gh_player_filter';

function readFromStorage(): PlayerFilter | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerFilter>;
    return {
      humans: !!parsed.humans,
      ai: !!parsed.ai,
      friends: !!parsed.friends,
    };
  } catch {
    return null;
  }
}

function writeToStorage(filter: PlayerFilter): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // ignore storage errors (e.g. private mode)
  }
}

function parseBoolParam(value: string | null): boolean | undefined {
  if (value === null || value === '') return undefined;
  return value === 'true' || value === '1' || value === 'on';
}

function parseFilterFromSearchParams(searchParams: URLSearchParams): PlayerFilter | null {
  const humans = searchParams.get('humans');
  const ai = searchParams.get('ai');
  const friends = searchParams.get('friends');

  const hasAny = humans !== null || ai !== null || friends !== null;
  if (!hasAny) return null;

  return {
    humans: parseBoolParam(humans) ?? false,
    ai: parseBoolParam(ai) ?? false,
    friends: parseBoolParam(friends) ?? false,
  };
}

export type UsePlayerFilterReturn = {
  filter: PlayerFilter;
  setFilter: (filter: PlayerFilter) => void;
  toggleHumans: () => void;
  toggleAi: () => void;
  toggleFriends: () => void;
};

/**
 * Shared, persisted filter state for the leaderboard and future lobby invite screen.
 * URL params take precedence on first load; changes are written back to localStorage
 * and the URL query string so the state is restorable and shareable.
 */
export function usePlayerFilter(): UsePlayerFilterReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialFilter = useMemo<PlayerFilter>(() => {
    const fromUrl = parseFilterFromSearchParams(searchParams);
    return fromUrl ?? readFromStorage() ?? DEFAULT_PLAYER_FILTER;
  }, [searchParams]);

  const [filter, setFilterState] = useState<PlayerFilter>(initialFilter);

  useEffect(() => {
    const fromUrl = parseFilterFromSearchParams(searchParams);
    if (fromUrl) {
      setFilterState(fromUrl);
    }
  }, [searchParams]);

  const syncUrlAndStorage = useCallback((next: PlayerFilter) => {
    writeToStorage(next);

    const params = new URLSearchParams(searchParams.toString());
    if (next.humans) {
      params.set('humans', 'true');
    } else {
      params.delete('humans');
    }
    if (next.ai) {
      params.set('ai', 'true');
    } else {
      params.delete('ai');
    }
    if (next.friends) {
      params.set('friends', 'true');
    } else {
      params.delete('friends');
    }

    const qs = params.toString();
    const path = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    router.replace(path, { scroll: false });
  }, [router, searchParams]);

  const setFilter = useCallback((next: PlayerFilter) => {
    setFilterState(next);
    syncUrlAndStorage(next);
  }, [syncUrlAndStorage]);

  const toggleHumans = useCallback(() => {
    setFilterState((prev: PlayerFilter) => {
      const next = { ...prev, humans: !prev.humans };
      syncUrlAndStorage(next);
      return next;
    });
  }, [syncUrlAndStorage]);

  const toggleAi = useCallback(() => {
    setFilterState((prev: PlayerFilter) => {
      const next = { ...prev, ai: !prev.ai };
      syncUrlAndStorage(next);
      return next;
    });
  }, [syncUrlAndStorage]);

  const toggleFriends = useCallback(() => {
    setFilterState((prev: PlayerFilter) => {
      const next = { ...prev, friends: !prev.friends };
      syncUrlAndStorage(next);
      return next;
    });
  }, [syncUrlAndStorage]);

  return { filter, setFilter, toggleHumans, toggleAi, toggleFriends };
}
