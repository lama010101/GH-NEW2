'use client'

// Historian's Journey stage-progress home card (HOME-BUILD-STAGECARD-RANKCARD-002).
// First position in VERTICAL_CARD_ORDER ('stage'). Distinct from the XP-based
// Rank card: this tracks journey_player_progress — the player's highest
// completed journey_stages.stage_number, where "completed" means
// journey_player_progress.status = 'completed' (the value
// completeJourneyPlaythrough writes on a passed stage, gated by that stage's
// min_accuracy_pct). Clicking anywhere on the card navigates to /journey.
//
// Display model: 100 stages = 20 rank tiers x 5 stages.
//   rank tier index = floor((stage-1)/5)  -> rank-NN.png icon
// The icon represents the tier of the NEXT stage to play (completed + 1);
// the label under it shows only that stage number. rank-01 is the most
// modern tier, rank-20 the most ancient. Zero progress shows the rank-01
// icon, "Stage 1" and an empty progress bar — no placeholder progress is
// fabricated.
//
// Data reads reuse the exact shape of src/app/journey/page.tsx: direct
// supabaseBrowser reads of journey_stages + journey_player_progress (both
// have authenticated SELECT policies).

import { useEffect, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import styles from '@/app/home/home.module.css'

const JOURNEY_TOTAL_STAGES = 100

interface StageCardProps {
  playerId: string
  onNavigate: (path: string) => void
}

export function StageCard({ playerId, onNavigate }: StageCardProps) {
  const t = useTranslations()
  // null = query in flight or failed (card still renders the zero-progress
  // shell); number = highest completed journey_stages.stage_number (0 = none).
  const [highestStage, setHighestStage] = useState<number | null>(null)

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    ;(async () => {
      try {
        const [stageRes, progressRes] = await Promise.all([
          supabaseBrowser.from('journey_stages').select('id,stage_number'),
          supabaseBrowser
            .from('journey_player_progress')
            .select('stage_id,status')
            .eq('player_id', playerId),
        ])
        if (cancelled) return
        const stageNumberById = new Map<string, number>()
        for (const s of (stageRes.data ?? []) as { id: string; stage_number: number }[]) {
          stageNumberById.set(s.id, s.stage_number)
        }
        let highest = 0
        for (const row of (progressRes.data ?? []) as { stage_id: string; status: string }[]) {
          if (row.status !== 'completed') continue
          const n = stageNumberById.get(row.stage_id)
          if (typeof n === 'number' && n > highest) highest = n
        }
        setHighestStage(highest)
      } catch {
        // Leave highestStage null — the card still renders correctly at 0.
      }
    })()
    return () => { cancelled = true }
  }, [playerId])

  const completed = highestStage ?? 0
  // The stage the player is about to play (1–100).
  const nextStage = Math.min(completed + 1, JOURNEY_TOTAL_STAGES)
  const rankIndex = Math.floor((nextStage - 1) / 5)
  const iconSrc = `/icons/ranks/rank-${String(rankIndex + 1).padStart(2, '0')}.png`

  const go = () => onNavigate('/journey')

  return (
    <div className={styles['mode-card']}>
      <div
        className={`${styles['card-bg']} ${styles.cardBgJourney}`}
        role="link"
        tabIndex={0}
        aria-label={t('journey.title')}
        onClick={go}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            go()
          }
        }}
      >
        <div className={styles.cardInnerHorizontal}>
          {/* Tier icon for the stage about to be played, on the LEFT, with
              that stage's number centered under it. */}
          <div className={styles.cardIconCol}>
            <div className={styles.cardIconThumb} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconSrc} alt="" className={styles.cardIconThumbImg} draggable={false} />
            </div>
            <span className={styles.cardStageLabel}>
              {t('journey.stage_label', { number: nextStage })}
            </span>
          </div>

          {/* One-line title + subtitle + progress bar in the MIDDLE. */}
          <div className={styles.cardTextCol}>
            <h2 className={`${styles.cardTitleLeft} ${styles.cardTitleOneline}`}>{t('journey.title')}</h2>
            <p className={styles.cardDescLeft}>{t('journey.subtitle')}</p>
            <progress
              className={styles.cardProgress}
              value={completed}
              max={JOURNEY_TOTAL_STAGES}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={JOURNEY_TOTAL_STAGES}
              aria-valuenow={completed}
              aria-label={t('journey.stages_completed', { completed, total: JOURNEY_TOTAL_STAGES })}
            />
          </div>

          {/* Play pill on the RIGHT — identical to the Daily/Practice cards'
              pill (same class, icon and home.compete_play label). */}
          <button
            type="button"
            className={styles.playPill}
            onClick={(e) => {
              e.stopPropagation()
              go()
            }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={t('home.play_mode_aria', { mode: t('journey.title') })}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
            {t('home.compete_play')}
          </button>
        </div>
      </div>
    </div>
  )
}
