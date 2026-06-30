'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './ExperienceAccuracy.module.css';

export interface ExperienceAccuracyData {
  byWhen: Array<{ label: string; avgAccuracy: number; totalXp: number; roundCount: number }>;
  byWhere: Array<{ label: string; avgAccuracy: number; totalXp: number; roundCount: number }>;
  eventsSeenCount: number;
  countriesCount: number;
  roundsPlayed: number | null;
}

function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

export default function ExperienceAccuracy({ data }: { data: ExperienceAccuracyData }) {
  const t = useTranslations('profile');
  const [accuracyTab, setAccuracyTab] = useState<'when' | 'where'>('when');
  const [experienceTab, setExperienceTab] = useState<'when' | 'where'>('when');

  const maxWhenXp = Math.max(...data.byWhen.map(i => i.totalXp), 1);
  const maxWhereXp = Math.max(...data.byWhere.map(i => i.totalXp), 1);

  return (
    <>
      {/* EXPERIENCE */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <div className={styles.sectionHead}>
            <span className={styles.sectionAccentBar} />
            <h3 className={`font-bebas text-sm font-bold ${styles.sectionTitle}`}>{t('experience')}</h3>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="p-3 rounded-lg text-center bg-white/[0.03] border border-white/[0.09]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorOrange}`}>
                {data.eventsSeenCount?.toLocaleString() ?? '—'}
              </div>
              <div className="text-[10px] mt-1 text-white/45">{t('events_seen')}</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-white/[0.03] border border-white/[0.09]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorViolet}`}>
                {data.roundsPlayed !== null ? data.roundsPlayed.toLocaleString() : '—'}
              </div>
              <div className="text-[10px] mt-1 text-white/45">Rated</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-white/[0.03] border border-white/[0.09]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorTeal}`}>
                {data.byWhere.length.toLocaleString()}
              </div>
              <div className="text-[10px] mt-1 text-white/45">Regions</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-white/[0.03] border border-white/[0.09]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorGold}`}>
                {data.countriesCount?.toLocaleString() ?? '—'}
              </div>
              <div className="text-[10px] mt-1 text-white/45">Countries</div>
            </div>
          </div>
          <div className={styles.tabBar}>
            <button
              className={`${styles.tabBtn} ${experienceTab === 'when' ? styles.tabActiveWhen : ''}`}
              onClick={() => setExperienceTab('when')}
            >
              {t('when')}
            </button>
            <button
              className={`${styles.tabBtn} ${experienceTab === 'where' ? styles.tabActiveWhere : ''}`}
              onClick={() => setExperienceTab('where')}
            >
              {t('where')}
            </button>
          </div>
          <div className={styles.regionWrap}>
            {experienceTab === 'when' && (
              data.byWhen.length > 0 ? (
                data.byWhen.map((item) => (
                  <div key={item.label} className={styles.regionRowWithCount}>
                    <div className={styles.regionLabelWrap}>
                      <span className={styles.regionLabel}>{item.label}</span>
                      <div className={styles.regionBar}>
                        <div className={styles.regionBarFill} style={{ width: `${(item.totalXp / maxWhenXp) * 100}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct}>{item.totalXp.toLocaleString()} XP</span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>No data yet</div>
              )
            )}
            {experienceTab === 'where' && (
              data.byWhere.length > 0 ? (
                data.byWhere.map((item) => (
                  <div key={item.label} className={styles.regionRowWithCount}>
                    <div className={styles.regionLabelWrap}>
                      <span className={styles.regionLabel}>{item.label}</span>
                      <div className={styles.regionBar}>
                        <div className={styles.regionBarFill} style={{ width: `${(item.totalXp / maxWhereXp) * 100}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct}>{item.totalXp.toLocaleString()} XP</span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>No data yet</div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ACCURACY */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 pb-8">
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <div className={styles.sectionHead}>
            <span className={styles.sectionAccentBar} />
            <h3 className={`font-bebas text-sm font-bold ${styles.sectionTitle}`}>{t('accuracy')}</h3>
          </div>
          <div className={styles.tabBar}>
            <button
              className={`${styles.tabBtn} ${accuracyTab === 'when' ? styles.tabActiveWhen : ''}`}
              onClick={() => setAccuracyTab('when')}
            >
              {t('when')}
            </button>
            <button
              className={`${styles.tabBtn} ${accuracyTab === 'where' ? styles.tabActiveWhere : ''}`}
              onClick={() => setAccuracyTab('where')}
            >
              {t('where')}
            </button>
          </div>
          <div className={styles.regionWrap}>
            {accuracyTab === 'when' && (
              data.byWhen.length > 0 ? (
                data.byWhen.map((item) => (
                  <div key={item.label} className={styles.regionRowWithCount}>
                    <div className={styles.regionLabelWrap}>
                      <span className={styles.regionLabel}>{item.label}</span>
                      <div className={styles.regionBar}>
                        <div className={styles.regionBarFill} style={{ width: `${item.avgAccuracy}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct} style={{ color: accColor(item.avgAccuracy) }}>{item.avgAccuracy}%</span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>No data yet</div>
              )
            )}
            {accuracyTab === 'where' && (
              data.byWhere.length > 0 ? (
                data.byWhere.map((item) => (
                  <div key={item.label} className={styles.regionRowWithCount}>
                    <div className={styles.regionLabelWrap}>
                      <span className={styles.regionLabel}>{item.label}</span>
                      <div className={styles.regionBar}>
                        <div className={styles.regionBarFill} style={{ width: `${item.avgAccuracy}%` }} />
                      </div>
                    </div>
                    <span className={styles.regionPct} style={{ color: accColor(item.avgAccuracy) }}>{item.avgAccuracy}%</span>
                    <span className={styles.regionCount}>{item.roundCount}</span>
                  </div>
                ))
              ) : (
                <div className={styles.regionEmpty}>No data yet</div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
