'use client'

// Historian's Journey stage-progress home card (HOME-BUILD-STAGECARD-RANKCARD-002).
// First position in VERTICAL_CARD_ORDER ('stage'). Distinct from the XP-based
// Rank card: this tracks journey_player_progress — the player's highest
// completed journey_stages.stage_number, where "completed" means
// journey_player_progress.status = 'completed' (the value
// completeJourneyPlaythrough writes on a passed stage, gated by that stage's
// min_accuracy_pct). Clicking anywhere on the card navigates to /journey.
//
// Display model: 100 stages = 20 rank tiers x 5 sub-titles.
//   rank tier index = floor((stage-1)/5)  -> rank-NN.png icon + rank name
//   sub-title index = (stage-1) % 5       -> Initiate..Pioneer
// rank-01 is the most modern tier (Artificial Intelligence), rank-20 the most
// ancient (Writing). A player with zero completed stages is shown at the
// stage-1 tier — rank-01 "Artificial Intelligence Initiate" — i.e. the tier
// they are currently playing in, not rank-20 (the tier of stages 96-100).
// No placeholder progress is fabricated: zero progress renders the honest
// "0 of 100" state with the Start-stage CTA.
//
// Data reads reuse the exact shape of src/app/journey/page.tsx: direct
// supabaseBrowser reads of journey_stages + journey_player_progress (both
// have authenticated SELECT policies).

import { useEffect, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { MODE_CARD_GRADIENT } from './types'
import styles from '@/app/home/home.module.css'

// 20 rank tiers in journey order: index 0 = rank-01 = most modern,
// index 19 = rank-20 = most ancient.
const STAGE_RANK_NAMES = [
  'Artificial Intelligence',
  'Smartphone',
  'World Wide Web',
  'Personal Computer',
  'Integrated Circuit',
  'Transistor',
  'Telephone',
  'Telegraph',
  'Steam Engine',
  'Printing Press',
  'Mechanical Clock',
  'Magnetic Compass',
  'Gunpowder',
  'Paper',
  'Waterwheel',
  'Plow',
  'Sailboat',
  'Wheel',
  'Bronze',
  'Writing',
] as const

// Sub-titles in ascending order within each rank tier.
const STAGE_SUB_TITLES = ['Initiate', 'Apprentice', 'Adept', 'Expert', 'Pioneer'] as const

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
  const displayStage = Math.min(Math.max(completed, 1), JOURNEY_TOTAL_STAGES)
  const rankIndex = Math.floor((displayStage - 1) / 5)
  const subIndex = (displayStage - 1) % 5
  const iconSrc = `/icons/ranks/rank-${String(rankIndex + 1).padStart(2, '0')}.png`
  const tierTitle = `${STAGE_RANK_NAMES[rankIndex]} ${STAGE_SUB_TITLES[subIndex]}`

  const go = () => onNavigate('/journey')

  return (
    <div className={styles['mode-card']}>
      <div
        className={styles['card-bg']}
        style={{ background: MODE_CARD_GRADIENT.stage, cursor: 'pointer' }}
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
          {/* Current stage-tier icon on the LEFT */}
          <div className={styles.cardIconThumb} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc} alt="" className={styles.cardIconThumbImg} draggable={false} />
          </div>

          {/* Card label + tier title + numeric progress in the MIDDLE.
              Two separate cardDescLeft blocks: the class clamps each block to
              2 lines, so a single shared block could push the progress line
              out of view for long rank names (e.g. "Artificial Intelligence
              Initiate"). */}
          <div className={styles.cardTextCol}>
            <h2 className={styles.cardTitleLeft}>{t('journey.title')}</h2>
            <p className={styles.cardDescLeft}>
              <span style={{ fontWeight: 700 }}>{tierTitle}</span>
            </p>
            <p className={styles.cardDescLeft}>
              {t('journey.stages_completed', { completed, total: JOURNEY_TOTAL_STAGES })}
            </p>
            {completed === 0 && (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  alignSelf: 'flex-start',
                  marginTop: 2,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.22)',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                {t('journey.start_stage')}
              </span>
            )}
          </div>

          {/* Chevron affordance on the RIGHT (decorative — the whole card is
              the link). A compact chevron rather than the sibling cards' play
              pill: it keeps the narrow text column wide enough for the full
              "{rank} {sub-title}" + progress lines, and signals "navigate to
              /journey" rather than "start playing". */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: '#ffffff', opacity: 0.8, flexShrink: 0 }}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
      </div>
    </div>
  )
}
