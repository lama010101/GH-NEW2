'use client';

import { useTranslations } from 'next-intl';
import { rankForXp } from '@/core/rank';
import RankIcon from '@/components/RankIcon';
import styles from './RankProgressBar.module.css';

interface RankProgressBarProps {
  totalXp: number | null;
  /** Optional compact mode: hides the XP count line. */
  compact?: boolean;
  /** Optional className to override the outer wrapper. */
  className?: string;
}

// Reusable rank display: icon + title + progress bar + next-rank hint.
// Derives everything from totalXp via rankForXp (single source of truth).
// No fetches, no state — pure presentational. Parent supplies totalXp.
export default function RankProgressBar({ totalXp, compact = false, className }: RankProgressBarProps) {
  const t = useTranslations('rank');

  if (totalXp === null || totalXp === undefined || Number.isNaN(totalXp)) {
    return (
      <div className={`${styles.rankCard} ${className ?? ''}`}>
        <div className={styles.rankIconWrap} data-loading>
          <RankIcon name="footprint" size={28} />
        </div>
        <div className={styles.rankBody}>
          <div className={styles.rankTitleLine}>
            <span className={styles.rankTitle}>{t('rank_label')}</span>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: '0%' }} />
          </div>
        </div>
      </div>
    );
  }

  const info = rankForXp(totalXp);
  const title = t(info.titleKey);

  return (
    <div className={`${styles.rankCard} ${className ?? ''}`} data-tier={info.tier}>
      <div className={styles.rankIconWrap}>
        <RankIcon name={info.iconName} size={28} />
      </div>
      <div className={styles.rankBody}>
        <div className={styles.rankTitleLine}>
          <span className={styles.rankTitle}>{title}</span>
          <span className={styles.rankTier}>T{info.tier}</span>
        </div>
        {!compact && (
          <div className={styles.rankXpLine}>
            <span className={styles.rankXpVal}>{Math.floor(totalXp).toLocaleString()}</span>
            <span className={styles.rankXpUnit}>XP</span>
          </div>
        )}
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${info.progressPct}%` }}
          />
        </div>
        <div className={styles.rankHintLine}>
          {info.isMaxRank ? (
            <span className={styles.rankMax}>{t('max_rank')}</span>
          ) : (
            <span className={styles.rankNext}>
              {t('next_rank', {
                xp: info.xpToNext?.toLocaleString() ?? '0',
                title: t(info.nextTitleKey ?? 'rank_10'),
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
