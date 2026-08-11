'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { JourneyStageWithProgress } from '@/core/journeyTypes';
import JourneyStageList from '@/components/journey/JourneyStageList';
import styles from '@/components/journey/JourneyStageList.module.css';

export default function JourneyPage() {
  const t = useTranslations('journey');
  const [stages, setStages] = useState<JourneyStageWithProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/journey/progress', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error ?? t('error'));
        }

        if (!cancelled) {
          setStages(data.stages ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('error'));
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [t]);

  const handleStageClick = () => {
    // Stage play flow is HJ-03; this task is read-only / navigation only.
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </header>

        {error && <div className={styles.error}>{error}</div>}

        {!error && stages === null && (
          <div className={styles.loading}>{t('loading')}</div>
        )}

        {!error && stages !== null && (
          <JourneyStageList stages={stages} onStageClick={handleStageClick} />
        )}
      </div>
    </main>
  );
}
