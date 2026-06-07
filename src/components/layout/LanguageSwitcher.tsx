'use client';

import { useState, useEffect, useTransition } from 'react';
import { locales, defaultLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import { setLocale } from '@/actions/setLocale';
import styles from './LanguageSwitcher.module.css';

interface LanguageSwitcherProps {
  initialLocale: string;
}

function readLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .find(c => c.trim().startsWith(LOCALE_COOKIE + '='));
  const val = match?.split('=')[1]?.trim();
  return val && (locales as readonly string[]).includes(val) ? (val as Locale) : null;
}

export function LanguageSwitcher({ initialLocale }: LanguageSwitcherProps) {
  const resolved = (locales as readonly string[]).includes(initialLocale)
    ? (initialLocale as Locale)
    : defaultLocale;

  const [current, setCurrent] = useState<Locale>(resolved);
  const [isPending, startTransition] = useTransition();
  const [hasDetected, setHasDetected] = useState(false);

  useEffect(() => {
    if (hasDetected) return;
    setHasDetected(true);
    const cookieVal = readLocaleCookie();
    if (cookieVal) {
      setCurrent(cookieVal);
      return;
    }
    const browserLang = navigator.language?.toLowerCase() ?? '';
    const detected: Locale = browserLang.startsWith('fr') ? 'fr' : 'en';
    if (detected !== current) {
      setCurrent(detected);
      startTransition(() => { setLocale(detected); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitch = (locale: Locale) => {
    if (locale === current || isPending) return;
    setCurrent(locale);
    startTransition(() => { setLocale(locale); });
  };

  return (
    <div className={`${styles.container} ${isPending ? styles.disabled : ''}`}>
      {locales.map(loc => (
        <button
          key={loc}
          onClick={() => handleSwitch(loc)}
          className={`${styles.pill} ${loc === current ? styles.pillActive : styles.pillInactive}`}
          disabled={isPending}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
