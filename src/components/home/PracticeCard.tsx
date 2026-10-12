'use client'

// Home v2 Practice tile (MP-UIX-PORT-C-HOME-001) — port of prototype/home-v2
// PracticeCard onto real data. Resume state comes from the
// `gh_practice_game_{playerId}` localStorage marker + GET /api/compete/{gameId}
// (status !== SESSION_COMPLETE → in-progress). Settings chips come from
// loadPracticeSettings(). The CTA delegates to the page's existing
// handlePracticeTileClick (opens PracticeResumeModal when a stored game is
// live, else PracticeSettingsModal).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Play } from 'lucide-react'
import { loadPracticeSettings, type PracticeSettings } from '@/components/practice/practiceSettings'
import { MAX_ROUNDS } from '@/core/types'
import styles from './PracticeCard.module.css'

// Fixed domain totals — mirror the lists in
// src/components/practice/practiceSettings.ts (ALL_ERAS) and
// src/components/practice/PracticeSettingsModal.tsx (REGIONS).
const TOTAL_ERAS = 5
const REGION_CONTINENT_GROUPS: string[][] = [
  ['Europe'],
  ['Asia'],
  ['North America'],
  ['South America'],
  ['Africa'],
  ['Oceania', 'Antarctica'], // one modal region chip covering two continents
]
const TOTAL_REGIONS = REGION_CONTINENT_GROUPS.length

interface PracticeCardProps {
  playerId: string | undefined
  onCtaClick: () => void
  ctaLoading: boolean
}

export function PracticeCard({ playerId, onCtaClick, ctaLoading }: PracticeCardProps) {
  const t = useTranslations()

  const [resumeGameId, setResumeGameId] = useState<string | null>(null)
  const [roundIndex, setRoundIndex] = useState(0)
  const [totalRounds, setTotalRounds] = useState(MAX_ROUNDS)
  const [settings, setSettings] = useState<PracticeSettings | null>(null)

  // localStorage-backed settings — read post-mount only.
  useEffect(() => {
    setSettings(loadPracticeSettings())
  }, [])

  // Resume probe — same source as the page's handlePracticeTileClick.
  useEffect(() => {
    if (!playerId || typeof window === 'undefined') return
    let cancelled = false
    const storedGameId = localStorage.getItem(`gh_practice_game_${playerId}`)
    if (!storedGameId) return
    ;(async () => {
      try {
        const res = await fetch(`/api/compete/${storedGameId}?playerId=${playerId}`, { cache: 'no-store' })
        if (!res.ok) return
        const snap = (await res.json()) as {
          status?: string
          currentRoundIndex?: number
          config?: { totalRounds?: number }
        }
        if (cancelled || !snap.status || snap.status === 'SESSION_COMPLETE') return
        setResumeGameId(storedGameId)
        setRoundIndex(typeof snap.currentRoundIndex === 'number' ? snap.currentRoundIndex : 0)
        setTotalRounds(typeof snap.config?.totalRounds === 'number' ? snap.config.totalRounds : MAX_ROUNDS)
      } catch {
        // Snapshot unreachable — tile renders in the non-resume state.
      }
    })()
    return () => { cancelled = true }
  }, [playerId])

  const playing = resumeGameId !== null

  const timerSec = settings?.roundTimerSec ?? 0
  const timerLabel = timerSec === 0
    ? t('lobby.timer_off')
    : t('common.timer_min_short', { n: Math.floor(timerSec / 60), s: String(timerSec % 60).padStart(2, '0') })

  const erasSelected = settings?.selectedEras?.length ?? TOTAL_ERAS
  const selectedRegions = settings?.selectedRegions ?? []
  const regionsSelected = selectedRegions.length === 0
    ? TOTAL_REGIONS
    : REGION_CONTINENT_GROUPS.filter((g) => g.some((c) => selectedRegions.includes(c))).length

  return (
    <section className={styles.more}>
      <div className={styles.tile}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/practice_large.webp" alt="" width={64} height={64} decoding="async" loading="lazy" />
        <span className={styles.txt}>
          <span className={styles.name}>{t('home.practice_name')}</span>
          <span className={styles.desc}>{t('home.practice_tagline')}</span>
          {playing && (
            <span className={styles.rounds}>
              {Array.from({ length: totalRounds }, (_, i) => (
                <span key={i} className={`${styles.dot} ${i < roundIndex ? styles.dotDone : i === roundIndex ? styles.dotCur : ''}`} />
              ))}
              <span className={styles.roundTxt}>{t('home.round_of', { current: Math.min(roundIndex + 1, totalRounds), total: totalRounds })}</span>
            </span>
          )}
          {/* Desktop only — timer / eras / regions of the saved settings */}
          <span className={styles.settingsRow}>
            <span className={styles.chip}>⏱ {timerLabel}</span>
            <span className={styles.chip}>{t('home.practice_eras_chip', { selected: erasSelected, total: TOTAL_ERAS })}</span>
            <span className={styles.chip}>{t('home.practice_regions_chip', { selected: regionsSelected, total: TOTAL_REGIONS })}</span>
          </span>
        </span>
        <button
          type="button"
          className={styles.play}
          data-testid="home-practice-play-btn"
          onClick={onCtaClick}
          disabled={ctaLoading}
          aria-label={t('home.play_mode_aria', { mode: t('home.practice_name') })}
        >
          {ctaLoading ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : (
            <>
              <Play size={13} strokeWidth={2.5} /> {playing ? t('journey.list_resume') : t('home.compete_play')}
            </>
          )}
        </button>
      </div>
    </section>
  )
}
