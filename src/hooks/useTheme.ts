'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  resolveTheme,
  type Theme,
} from '@/lib/theme';

// Re-export so existing client importers (e.g. ThemeToggle) keep working from
// a single source of truth defined in @/lib/theme.
export { THEME_COOKIE, THEME_STORAGE_KEY, resolveTheme, type Theme };

const THEME_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function readCookieTheme(): Theme | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .find((c) => c.trim().startsWith(THEME_COOKIE + '='));
  const val = match?.split('=')[1]?.trim();
  return val === 'light' || val === 'dark' ? (val as Theme) : null;
}

function readLocalTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const val = window.localStorage.getItem(THEME_STORAGE_KEY);
  return val === 'light' || val === 'dark' ? (val as Theme) : null;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

function persistTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.cookie = `${THEME_COOKIE}=${theme}; Max-Age=${THEME_MAX_AGE}; Path=/; SameSite=Lax`;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* localStorage unavailable — cookie is still authoritative for SSR */
    }
  }
}

/**
 * Single source of truth for client-side theme mutation.
 * Reads: cookie (SSR-aligned) then localStorage (client override) on mount.
 * Writes: cookie + localStorage + <html data-theme> together via setTheme.
 */
export function useTheme() {
  // Default to 'dark' for SSR; reconcile on mount to avoid hydration mismatch.
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const local = readLocalTheme();
    const cookie = readCookieTheme();
    const resolved = local ?? cookie ?? 'dark';
    setThemeState(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme, mounted };
}
