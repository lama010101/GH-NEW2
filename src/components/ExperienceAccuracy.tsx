'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import AccuracySuffix from '@/components/AccuracySuffix';
import WhereIcon from '@/components/icons/WhereIcon';
import WhenIcon from '@/components/icons/WhenIcon';
import { getAccuracyColor } from '@/core/accuracyColor';
import styles from './ExperienceAccuracy.module.css';

export interface ExperienceAccuracyData {
  byWhen: Array<{ label: string; avgAccuracy: number; totalXp: number; roundCount: number; icon?: string; span?: string; stockImg?: string }>;
  byWhere: Array<{ label: string; avgAccuracy: number; totalXp: number; roundCount: number; icon?: string; span?: string; stockImg?: string }>;
  eventsSeenCount: number;
  countriesCount: number;
  roundsPlayed: number | null;
}

export default function ExperienceAccuracy({ data, hideAccuracy = false, hideStatsRow = false, embedded = false, rankCard }: { data: ExperienceAccuracyData; hideAccuracy?: boolean; hideStatsRow?: boolean; embedded?: boolean; rankCard?: ReactNode }) {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const tGame = useTranslations('game');
  const [accuracyTab, setAccuracyTab] = useState<'when' | 'where'>('when');
  const [experienceTab, setExperienceTab] = useState<'when' | 'where'>('when');

  const maxWhenXp = Math.max(...data.byWhen.map(i => i.totalXp), 1);
  const maxWhereXp = Math.max(...data.byWhere.map(i => i.totalXp), 1);

  // embedded: drop the outer wrapper spacing and use the canonical .card tokens
  // (matches SessionComplete .card: general-card-bg/border, gh-radius-md, shadow,
  //  glass blur) so the card aligns with sibling cards on the final-results page.
  const experienceWrapperCls = embedded
    ? ''
    : 'relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6';
  const experienceCardCls = embedded
    ? 'bg-[var(--gh-general-card-bg)] border border-[var(--gh-general-card-border)] rounded-[var(--gh-radius-md)] [backdrop-filter:var(--gh-glass-blur)] [-webkit-backdrop-filter:var(--gh-glass-blur)] [box-shadow:var(--gh-general-card-shadow)] p-4'
    : `${hideAccuracy ? 'bg-[var(--gh-general-card-bg)]' : 'bg-[var(--gh-glass-bg)]'} border border-[var(--gh-border-subtle)] rounded-xl p-4`;
  const accuracyWrapperCls = embedded
    ? ''
    : 'relative z-10 max-w-[820px] mx-auto px-6 mt-6 pb-8';
  const accuracyCardCls = embedded
    ? 'bg-[var(--gh-general-card-bg)] border border-[var(--gh-general-card-border)] rounded-[var(--gh-radius-md)] [backdrop-filter:var(--gh-glass-blur)] [-webkit-backdrop-filter:var(--gh-glass-blur)] [box-shadow:var(--gh-general-card-shadow)] p-4'
    : 'bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl p-4';

  return (
    <>
      {/* EXPERIENCE */}
      <div className={experienceWrapperCls}>
        <div className={experienceCardCls}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionAccentBar} />
            <h2 className={styles.sectionTitle}>{t('experience')}</h2>
          </div>
          {!hideStatsRow && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="p-3 rounded-lg text-center bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorOrange}`}>
                {data.eventsSeenCount?.toLocaleString() ?? '—'}
              </div>
              <div className="text-xs mt-1 text-[var(--gh-text-muted)]">{t('events_seen')}</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorViolet}`}>
                {data.roundsPlayed !== null ? data.roundsPlayed.toLocaleString() : '—'}
              </div>
              <div className="text-xs mt-1 text-[var(--gh-text-muted)]">{t('rated')}</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorTeal}`}>
                {data.byWhere.length.toLocaleString()}
              </div>
              <div className="text-xs mt-1 text-[var(--gh-text-muted)]">{t('regions')}</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorGold}`}>
                {data.countriesCount?.toLocaleString() ?? '—'}
              </div>
              <div className="text-xs mt-1 text-[var(--gh-text-muted)]">{t('countries')}</div>
            </div>
          </div>
          )}
          {rankCard && <div className={styles.rankCardSlot}>{rankCard}</div>}
          <div className={styles.tabBar}>
            <button
              className={`${styles.tabBtn} ${experienceTab === 'when' ? styles.tabActiveWhen : ''}`}
              onClick={() => setExperienceTab('when')}
            >
              <WhenIcon size={14} className={styles.tabIconWhen} />
              {t('when')}
            </button>
            <button
              className={`${styles.tabBtn} ${experienceTab === 'where' ? styles.tabActiveWhere : ''}`}
              onClick={() => setExperienceTab('where')}
            >
              <WhereIcon size={14} className={styles.tabIconWhere} />
              {t('where')}
            </button>
          </div>
          <div className={styles.regionWrap}>
            {experienceTab === 'when' && (
              data.byWhen.length > 0 ? (
                data.byWhen.map((item) => (
                  <div key={item.label} className={`${styles.regionRowWithCount} ${!item.stockImg && !item.icon ? styles.regionRowNoImage : ''}`}>
                    {item.stockImg ? (
                      <span className={styles.regionImage}><img src={item.stockImg} alt="" className={styles.regionImageImg} /></span>
                    ) : item.icon ? (
                      <span className={styles.regionIcon}>{item.icon}</span>
                    ) : null}
                    <div className={styles.regionLabelWrap}>
                      <div className={styles.regionLabelHead}>
                        <span className={styles.regionLabel}>{item.label}</span>
                        {item.span && <span className={styles.regionSpan}>{item.span}</span>}
                      </div>
                      <div className={styles.regionBar}>
                        <div className={`${styles.regionBarFill} ${styles.regionBarFillWhen}`} style={{ width: `${(item.totalXp / maxWhenXp) * 100}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct}>{item.totalXp.toLocaleString()} {tGame('xp_unit')}</span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>{tCommon('no_data_yet')}</div>
              )
            )}
            {experienceTab === 'where' && (
              data.byWhere.length > 0 ? (
                data.byWhere.map((item) => (
                  <div key={item.label} className={`${styles.regionRowWithCount} ${!item.stockImg && !item.icon ? styles.regionRowNoImage : ''}`}>
                    {item.stockImg ? (
                      <span className={styles.regionImage}><img src={item.stockImg} alt="" className={styles.regionImageImg} /></span>
                    ) : item.icon ? (
                      <span className={styles.regionIcon}>{item.icon}</span>
                    ) : null}
                    <div className={styles.regionLabelWrap}>
                      <div className={styles.regionLabelHead}>
                        <span className={styles.regionLabel}>{item.label}</span>
                        {item.span && <span className={styles.regionSpan}>{item.span}</span>}
                      </div>
                      <div className={styles.regionBar}>
                        <div className={`${styles.regionBarFill} ${styles.regionBarFillWhere}`} style={{ width: `${(item.totalXp / maxWhereXp) * 100}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct}>{item.totalXp.toLocaleString()} {tGame('xp_unit')}</span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>{tCommon('no_data_yet')}</div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ACCURACY */}
      {!hideAccuracy && (
      <div className={accuracyWrapperCls}>
        <div className={accuracyCardCls}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionAccentBar} />
            <h2 className={styles.sectionTitle}>{t('accuracy')}</h2>
          </div>
          <div className={styles.tabBar}>
            <button
              className={`${styles.tabBtn} ${accuracyTab === 'when' ? styles.tabActiveWhen : ''}`}
              onClick={() => setAccuracyTab('when')}
            >
              <WhenIcon size={14} className={styles.tabIconWhen} />
              {t('when')}
            </button>
            <button
              className={`${styles.tabBtn} ${accuracyTab === 'where' ? styles.tabActiveWhere : ''}`}
              onClick={() => setAccuracyTab('where')}
            >
              <WhereIcon size={14} className={styles.tabIconWhere} />
              {t('where')}
            </button>
          </div>
          <div className={styles.regionWrap}>
            {accuracyTab === 'when' && (
              data.byWhen.length > 0 ? (
                data.byWhen.map((item) => (
                  <div key={item.label} className={`${styles.regionRowWithCount} ${!item.stockImg && !item.icon ? styles.regionRowNoImage : ''}`}>
                    {item.stockImg ? (
                      <span className={styles.regionImage}><img src={item.stockImg} alt="" className={styles.regionImageImg} /></span>
                    ) : item.icon ? (
                      <span className={styles.regionIcon}>{item.icon}</span>
                    ) : null}
                    <div className={styles.regionLabelWrap}>
                      <div className={styles.regionLabelHead}>
                        <span className={styles.regionLabel}>{item.label}</span>
                        {item.span && <span className={styles.regionSpan}>{item.span}</span>}
                      </div>
                      <div className={styles.regionBar}>
                        <div className={`${styles.regionBarFill} ${styles.regionBarFillWhen}`} style={{ width: `${item.avgAccuracy}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct} style={{ color: getAccuracyColor(item.avgAccuracy) }}>
                      {item.avgAccuracy}
                      <AccuracySuffix />
                    </span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>{tCommon('no_data_yet')}</div>
              )
            )}
            {accuracyTab === 'where' && (
              data.byWhere.length > 0 ? (
                data.byWhere.map((item) => (
                  <div key={item.label} className={`${styles.regionRowWithCount} ${!item.stockImg && !item.icon ? styles.regionRowNoImage : ''}`}>
                    {item.stockImg ? (
                      <span className={styles.regionImage}><img src={item.stockImg} alt="" className={styles.regionImageImg} /></span>
                    ) : item.icon ? (
                      <span className={styles.regionIcon}>{item.icon}</span>
                    ) : null}
                    <div className={styles.regionLabelWrap}>
                      <div className={styles.regionLabelHead}>
                        <span className={styles.regionLabel}>{item.label}</span>
                        {item.span && <span className={styles.regionSpan}>{item.span}</span>}
                      </div>
                      <div className={styles.regionBar}>
                        <div className={`${styles.regionBarFill} ${styles.regionBarFillWhere}`} style={{ width: `${item.avgAccuracy}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct} style={{ color: getAccuracyColor(item.avgAccuracy) }}>
                      {item.avgAccuracy}
                      <AccuracySuffix />
                    </span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>{tCommon('no_data_yet')}</div>
              )
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}
