'use client';

import { useTranslations } from 'next-intl';
import { rankForXp } from '@/core/rank';
import styles from './RankCard.module.css';

interface RankCardProps {
  totalXp: number | null;
  open: boolean;
  /** When true, renders in content flow (position: static) instead of fixed below TopBar. */
  inline?: boolean;
  /** When true, renders only the inner content (rankMain) with no wrapper/card/collapse.
   *  Used to merge the rank card into a parent card (e.g. Game accuracy card). */
  bare?: boolean;
  /** When 'dark', forces rank XP text to white for use on dark backgrounds. */
  variant?: 'default' | 'dark';
}

// Map rank tier → compressed image in /public/images/rank-titles/
const RANK_IMAGE: Record<number, string> = {
  1:  '/images/rank-titles/wanderer.jpg',
  2:  '/images/rank-titles/pathfinder.jpg',
  3:  '/images/rank-titles/trailblazer.jpg',
  4:  '/images/rank-titles/cartographer.jpg',
  5:  '/images/rank-titles/explorer.jpg',
  6:  '/images/rank-titles/navigator.jpg',
  7:  '/images/rank-titles/chronicler.jpg',
  8:  '/images/rank-titles/historian.jpg',
  9:  '/images/rank-titles/scholar.jpg',
  10: '/images/rank-titles/cartographer_royal.jpg',
};

// Collapsible rank card with medallion image, title, XP, next-rank line, progress bar.
// Derives everything from totalXp via rankForXp (single source of truth).
// open controls expand/collapse of the full module body.
export default function RankCard({ totalXp, open, inline = false, bare = false, variant = 'default' }: RankCardProps) {
  const t = useTranslations('rank');

  const xp = (totalXp === null || totalXp === undefined || Number.isNaN(totalXp))
    ? 0
    : totalXp;
  const info = rankForXp(xp);
  const title = t(info.titleKey);
  const nextTitle = info.nextTitleKey ? t(info.nextTitleKey) : '';
  const imgSrc = RANK_IMAGE[info.tier] ?? RANK_IMAGE[1];

  const rankMain = (
    <div className={`${styles.rankMain} ${variant === 'dark' ? styles.rankMainDark : ''}`}>
      <div className={styles.rankMedallion}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={title} className={styles.rankMedImg} draggable={false} />
        <span className={styles.rankMedTier}><span className={styles.rankMedTierText}>T{info.tier}</span></span>
      </div>
      <div className={styles.rankBody}>
        <div className={styles.rankHead}>
          <h3 className={styles.rankTitle}>{title}</h3>
          <span className={styles.rankXp}>{Math.floor(xp).toLocaleString()}<i>XP</i></span>
        </div>
        <div className={styles.rankNextLine}>
          <span className={styles.rankNextLabel}>{t('next_label')}</span>
          <span className={styles.rankNextTitle}>
            {info.isMaxRank
              ? t('max_rank')
              : t('next_rank', { xp: info.xpToNext?.toLocaleString() ?? '0', title: nextTitle })}
          </span>
        </div>
        <div className={styles.rankBarMain}>
          <span className={styles.rankBarFillMain} style={{ width: `${info.progressPct}%` }} />
        </div>
      </div>
    </div>
  );

  if (bare) {
    return rankMain;
  }

  return (
    <div className={`${styles.rankCardWrap} ${inline ? styles.rankCardWrapInline : ''}`}>
      <section className={`${styles.rankCard} ${open ? '' : styles.rankCardClosed}`}>
        <div className={`${styles.rankCollapseFull} ${open ? styles.rankCollapseFullOpen : styles.rankCollapseFullClosed}`}>
          {rankMain}
        </div>
      </section>
    </div>
  );
}
