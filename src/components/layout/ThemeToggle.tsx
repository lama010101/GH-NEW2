'use client';

import { useTranslations } from 'next-intl';
import { useTheme, type Theme } from '@/hooks/useTheme';
import styles from './ThemeToggle.module.css';

/**
 * Reusable Dark/Light pill toggle. Mirrors the LanguageSwitcher visual pattern
 * and reads the same modal token namespace so it renders correctly inside both
 * the NavModal and the in-game settings modal. State + persistence come from
 * useTheme (single client write path).
 */
export function ThemeToggle() {
  const t = useTranslations('nav');
  const { theme, setTheme, mounted } = useTheme();

  const options: ReadonlyArray<{ id: Theme; label: string }> = [
    { id: 'dark', label: t('dark') },
    { id: 'light', label: t('light') },
  ];

  return (
    <div className={styles.toggle} role="group" aria-label={t('theme')}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setTheme(opt.id)}
          aria-pressed={theme === opt.id}
          className={`${styles.option} ${theme === opt.id ? styles.optionActive : ''}`}
          // Disable until mounted so SSR label (dark) matches client first paint.
          disabled={!mounted}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
