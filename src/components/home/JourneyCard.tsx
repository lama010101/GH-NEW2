'use client'

// Historian's Journey home card (HOME-BUILD-JOURNEYCARD-001).
// Replaces the retired 'levelup' placeholder card — first position in
// VERTICAL_CARD_ORDER. Clicking anywhere on the card navigates to /journey.
//
// Rank medallion + rank title/XP/progress come from <RankCard bare> — the
// tier→image map (RANK_IMAGE) is private to RankCard, so composing it is the
// only way to show the tier icon without forking that map. totalXp is passed
// down from home/page.tsx's existing player_global_stats fetch — no second
// XP source.
//
// Journey progress reuses the exact read shape of src/app/journey/page.tsx:
// journey_stages + journey_player_progress via supabaseBrowser. "Cleared"
// means journey_player_progress.status = 'completed' (the value
// completeJourneyPlaythrough writes on a passed stage).

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import RankCard from '@/components/RankCard'
import { MODE_CARD_GRADIENT } from './types'
import styles from '@/app/home/home.module.css'

interface JourneyCardProps {
  playerId: string
  totalXp: number | null
  onNavigate: (path: string) => void
}

export function JourneyCard({ playerId, totalXp, onNavigate }: JourneyCardProps) {
  const t = useTranslations()
  // null = still loading or query failed (card renders without progress line)
  const [journey, setJourney] = useState<{ highest: number; total: number } | null>(null)

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
        setJourney({ highest, total: stageNumberById.size })
      } catch {
        // Leave journey null — the card still renders with the subtitle line.
      }
    })()
    return () => { cancelled = true }
  }, [playerId])

  const go = () => onNavigate('/journey')

  const progressLine = journey === null
    ? t('journey.subtitle')
    : t('journey.stages_completed', { completed: journey.highest, total: journey.total })

  // RankCard renders on this card's dark gradient; its text/track tokens are
  // page-themed (dark text in light theme). Scope readable overrides to this
  // subtree only — RankCard.module.css itself is untouched.
  const rankContrastVars = {
    '--gh-text-primary': '#ffffff',
    '--gh-text-muted': 'rgba(255,255,255,0.7)',
    '--gh-border-default': 'rgba(255,255,255,0.28)',
  } as CSSProperties

  return (
    <div className={styles['mode-card']}>
      <div
        className={styles['card-bg']}
        style={{ background: MODE_CARD_GRADIENT.journey, cursor: 'pointer' }}
        role="link"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            go()
          }
        }}
      >
        <div className={styles.cardInnerHorizontal}>
          <div className={styles.cardTextCol}>
            <h2 className={styles.cardTitleLeft}>{t('journey.title')}</h2>
            <p className={styles.cardDescLeft}>{progressLine}</p>
          </div>
          <span className={styles.playPill} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
            {t('home.compete_play')}
          </span>
        </div>
        <div className={styles.competePanelWrap}>
          <div style={rankContrastVars}>
            <RankCard totalXp={totalXp} open bare variant="dark" />
          </div>
        </div>
      </div>
    </div>
  )
}
