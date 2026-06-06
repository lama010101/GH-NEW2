'use client';

import { useLocale } from 'next-intl';
import { startTransition, useEffect, useState } from 'react';
import { setLocale } from '@/actions/setLocale';
import { defaultLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import styles from './LanguageSwitcher.module.css';

interface LanguageSwitcherProps {
  initialLocale: string;
}

export function LanguageSwitcher({ initialLocale }: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const [isPending, setIsPending] = useState(false);
  const [hasDetected, setHasDetected] = useState(false);

  useEffect(() => {
    if (hasDetected) return;

    // Check if cookie is already set
    const cookieExists = document.cookie.includes(`${LOCALE_COOKIE}=`);
    
    // If cookie doesn't exist and initialLocale is default, this is first visit
    if (!cookieExists && initialLocale === defaultLocale) {
      const browserLang = navigator.language.toLowerCase();
      const detectedLocale: Locale = browserLang.startsWith('fr') ? 'fr' : 'en';
      
      if (detectedLocale !== defaultLocale) {
        startTransition(async () => {
          setIsPending(true);
          await setLocale(detectedLocale);
          setIsPending(false);
        });
      }
    }
    
    setHasDetected(true);
  }, [initialLocale, hasDetected]);

  const handleLocaleChange = (newLocale: Locale) => {
    if (newLocale === locale || isPending) return;
    
    startTransition(async () => {
      setIsPending(true);
      await setLocale(newLocale);
      setIsPending(false);
    });
  };

  return (
    <div className={`${styles.container} ${isPending ? styles.disabled : ''}`}>
      <button
        className={`${styles.pill} ${locale === 'en' ? styles.pillActive : styles.pillInactive}`}
        onClick={() => handleLocaleChange('en')}
        disabled={isPending}
      >
        EN
      </button>
      <button
        className={`${styles.pill} ${locale === 'fr' ? styles.pillActive : styles.pillInactive}`}
        onClick={() => handleLocaleChange('fr')}
        disabled={isPending}
      >
        FR
      </button>
    </div>
  );
}
