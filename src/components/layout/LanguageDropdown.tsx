'use client';

import { useState, useEffect, useTransition } from 'react';
import { locales, defaultLocale, LOCALE_COOKIE, localeMeta, type Locale } from '@/i18n/config';
import { setLocale } from '@/actions/setLocale';
import styles from './LanguageDropdown.module.css';

function readLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .find(c => c.trim().startsWith(LOCALE_COOKIE + '='));
  const val = match?.split('=')[1]?.trim();
  return val && (locales as readonly string[]).includes(val) ? (val as Locale) : null;
}

interface LanguageDropdownProps {
  initialLocale?: string;
  onLocaleChange?: (locale: Locale) => void;
  pending?: boolean;
}

export function LanguageDropdown({ initialLocale, onLocaleChange, pending: externalPending }: LanguageDropdownProps) {
  const resolved = initialLocale && (locales as readonly string[]).includes(initialLocale)
    ? (initialLocale as Locale)
    : defaultLocale;

  const [current, setCurrent] = useState<Locale>(resolved);
  const [isOpen, setIsOpen] = useState(false);
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
    const detected: Locale = browserLang.startsWith('fr') ? 'fr'
      : browserLang.startsWith('es') ? 'es'
      : browserLang.startsWith('de') ? 'de'
      : browserLang.startsWith('it') ? 'it'
      : browserLang.startsWith('pt') ? 'pt'
      : browserLang.startsWith('nl') ? 'nl'
      : browserLang.startsWith('ru') ? 'ru'
      : browserLang.startsWith('ja') ? 'ja'
      : browserLang.startsWith('zh') ? 'zh'
      : browserLang.startsWith('ar') ? 'ar'
      : 'en';
    if (detected !== current) {
      setCurrent(detected);
      startTransition(() => { setLocale(detected); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (locale: Locale) => {
    if (locale === current || isPending || externalPending) return;
    setCurrent(locale);
    setIsOpen(false);
    if (onLocaleChange) {
      onLocaleChange(locale);
    } else {
      startTransition(() => { setLocale(locale); });
    }
  };

  const disabled = isPending || externalPending;

  return (
    <div className={`${styles.container} ${disabled ? styles.disabled : ''}`}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={styles.flag}>{localeMeta[current].flag}</span>
        <span className={styles.label}>{localeMeta[current].label}</span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
          <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
            {locales.map(loc => (
              <button
                key={loc}
                type="button"
                onClick={() => handleSelect(loc)}
                className={`${styles.option} ${loc === current ? styles.optionActive : ''}`}
                disabled={disabled}
              >
                <span className={styles.flag}>{localeMeta[loc].flag}</span>
                <span className={styles.optionLabel}>{localeMeta[loc].label}</span>
                {loc === current && (
                  <svg className={styles.check} width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
