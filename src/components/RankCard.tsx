'use client';

import { useTranslations } from 'next-intl';
import { rankForXp } from '@/core/rank';
import styles from './RankCard.module.css';

interface RankCardProps {
  totalXp: number | null;
  open: boolean;
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
export default function RankCard({ totalXp, open }: RankCardProps) {
  const t = useTranslations('rank');

  const xp = (totalXp === null || totalXp === undefined || Number.isNaN(totalXp))
    ? 0
    : totalXp;
  const info = rankForXp(xp);
  const title = t(info.titleKey);
  const nextTitle = info.nextTitleKey ? t(info.nextTitleKey) : '';
  const imgSrc = RANK_IMAGE[info.tier] ?? RANK_IMAGE[1];

  return (
    <div className={styles.rankCardWrap}>
      <section className={`${styles.rankCard} ${open ? '' : styles.rankCardClosed}`}>
        <div className={`${styles.rankCollapseFull} ${open ? styles.rankCollapseFullOpen : styles.rankCollapseFullClosed}`}>
          <div className={styles.rankMain}>
            <div className={styles.rankMedallion}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc} alt={title} className={styles.rankMedImg} draggable={false} />
            </div>
            <div className={styles.rankBody}>
              <div className={styles.rankHead}>
                <h3 className={styles.rankTitle}>{title}</h3>
                <span className={styles.rankXp}>{Math.floor(xp).toLocaleString()}<i>XP</i></span>
              </div>
              <div className={styles.rankNextLine}>
                <span className={styles.rankNextLabel}>Next</span>
                <span className={styles.rankNextTitle}>
                  {info.isMaxRank
                    ? t('max_rank')
                    : `${info.xpToNext?.toLocaleString() ?? '0'} XP to ${nextTitle}`}
                </span>
              </div>
              <div className={styles.rankBarMain}>
                <span className={styles.rankBarFillMain} style={{ width: `${info.progressPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
