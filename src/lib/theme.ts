/**
 * Server-safe theme constants and helpers.
 *
 * This module has NO `'use client'` directive so its exports are real runtime
 * values (not client-reference proxies) when imported into Server Components
 * such as `src/app/layout.tsx`. The client-side React hook lives in
 * `src/hooks/useTheme.ts` and re-exports these symbols to preserve a single
 * source of truth.
 */

export type Theme = 'dark' | 'light';

export const THEME_COOKIE = 'gh_theme';
export const THEME_STORAGE_KEY = 'gh_theme';

/** Resolve an arbitrary cookie/localStorage value to a valid Theme (default: dark). */
export function resolveTheme(value: string | undefined | null): Theme {
  return value === 'light' ? 'light' : 'dark';
}
