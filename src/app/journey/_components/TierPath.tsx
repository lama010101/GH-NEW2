'use client'

// Tier path — 5-node route map with per-stage badges, moved verbatim from
// src/components/home/JourneyCard.tsx (UIX-JC-TIERPATH-MOVE-1022-001) so the
// strip lives at the top of /journey instead of inside the home card.
// "Current node" = currentStageNumber, which is identical to the home card's
// nextStageRow.stage_number (both = lowest stage_number without a
// status='completed' row in journey_player_progress).
// Root is a static <div>: on /journey the old navigate-to-/journey click is
// meaningless. Tier math via journeyStageTierIndex stays the single source;
// badges come from journey_player_progress.best_badge.

import React from 'react'
import { useTranslations } from 'next-intl'
import { Lock, Medal } from 'lucide-react'
import {
  journeyStageIconFile,
  journeyStageTierIndex,
} from '@/core/journeyRules'
import type {
  JourneyProgressRow,
  JourneyStageRow,
} from './journeyStorage'
import styles from './TierPath.module.css'

type Badge = 'gold' | 'silver' | 'bronze' | 'completion'

interface TierPathProps {
  stages: JourneyStageRow[]
  progressRows: JourneyProgressRow[]
  currentStageNumber: number | null
}

export function TierPath({ stages, progressRows, currentStageNumber }: TierPathProps) {
  const t = useTranslations()

  const stageNumberById = new Map<string, number>()
  for (const s of stages) stageNumberById.set(s.id, s.stage_number)

  const completedByNumber = new Map<number, JourneyProgressRow>()
  for (const row of progressRows) {
    if (row.status !== 'completed') continue
    const n = stageNumberById.get(row.stage_id)
    if (typeof n === 'number') completedByNumber.set(n, row)
  }

  const tierIdx = currentStageNumber !== null ? journeyStageTierIndex(currentStageNumber) : 0
  const pathStages = currentStageNumber !== null
    ? stages.filter((s) => journeyStageTierIndex(s.stage_number) === tierIdx).map((s) => s.stage_number)
    : []

  if (currentStageNumber === null || pathStages.length === 0) return null

  return (
    <div className={styles.path}>
      <span className={styles.pathRow}>
        {pathStages.map((s, i) => {
          const row = completedByNumber.get(s)
          const isDone = row !== undefined
          const isCur = s === currentStageNumber
          const badge: Badge | null = isDone ? row.best_badge ?? 'completion' : null
          const bestAcc = isDone && row.best_accuracy_pct != null ? Math.round(Number(row.best_accuracy_pct)) : null
          return (
            <React.Fragment key={s}>
              {i > 0 && <span className={`${styles.seg} ${pathStages[i - 1] < currentStageNumber ? styles.segFill : ''}`} />}
              <span className={styles.node}>
                <span className={styles.nodeTop}>
                  {isDone ? (
                    <span className={styles.nodeIcon} data-badge={badge ?? 'completion'}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={journeyStageIconFile(s)} alt="" width={40} height={40} decoding="async" className={styles.nodeIconImg} />
                      <span className={styles.nodeNum}>{s}</span>
                      {badge && badge !== 'completion' && (
                        <Medal size={10} className={styles.nodeMedal} />
                      )}
                    </span>
                  ) : isCur ? (
                    <span className={styles.nodeCur}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={journeyStageIconFile(s)} alt="" width={46} height={46} decoding="async" className={styles.nodeCurIcon} />
                      <span className={styles.nodeNum}>{s}</span>
                    </span>
                  ) : (
                    <span className={`${styles.nodeIcon} ${styles.nodeIconLock}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={journeyStageIconFile(s)} alt="" width={40} height={40} decoding="async" className={styles.nodeIconImg} />
                      <span className={styles.nodeLockOver}><Lock size={14} /></span>
                    </span>
                  )}
                </span>
                <span className={`${styles.nodeCap} ${isDone ? styles.nodeAcc : isCur ? styles.nodeCapCur : ''}`}>
                  {isDone ? `${bestAcc ?? 0}%` : isCur ? t('journey.stage_label', { number: s }) : s}
                </span>
              </span>
            </React.Fragment>
          )
        })}
        {pathStages[pathStages.length - 1] < 100 && (
          <>
            <span className={styles.seg} />
            <span className={styles.node}>
              <span className={styles.nodeTop}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={journeyStageIconFile(pathStages[pathStages.length - 1] + 1)} alt="" width={40} height={40} decoding="async" className={styles.ghostIcon} />
              </span>
              <span className={`${styles.nodeCap} ${styles.ghostCap}`}>
                {t('journey.stage_label', { number: pathStages[pathStages.length - 1] + 1 })}
              </span>
            </span>
          </>
        )}
      </span>
    </div>
  )
}
