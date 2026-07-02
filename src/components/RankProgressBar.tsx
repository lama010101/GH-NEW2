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

// Reusable rank display: icon + title + progress bar + next-rank target.
// Derives everything from totalXp via rankForXp (single source of truth).
// No fetches, no state — pure presentational. Parent supplies totalXp.
// When totalXp is null (loading / no stats row yet), defaults to 0 XP →
// Wanderer (tier 1), so the title is never empty.
export default function RankProgressBar({ totalXp, compact = false, className }: RankProgressBarProps) {
  const t = useTranslations('rank');

  const xp = (totalXp === null || totalXp === undefined || Number.isNaN(totalXp))
    ? 0
    : totalXp;
  const info = rankForXp(xp);
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
          <span className={styles.rankNextTarget}>
            {info.isMaxRank
              ? t('max_rank')
              : t('next_rank', {
                  xp: info.xpToNext?.toLocaleString() ?? '0',
                  title: t(info.nextTitleKey ?? 'rank_10'),
                })}
          </span>
        </div>
        {!compact && (
          <div className={styles.rankXpLine}>
            <span className={styles.rankXpVal}>{Math.floor(xp).toLocaleString()}</span>
            <span className={styles.rankXpUnit}>XP</span>
          </div>
        )}
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${info.progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
