'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import styles from './PracticePanel.module.css'

const TIMER_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '10s', value: 10 },
  { label: '15s', value: 15 },
  { label: '20s', value: 20 },
  { label: '30s', value: 30 },
  { label: '45s', value: 45 },
  { label: '1:00', value: 60 },
  { label: '1:30', value: 90 },
  { label: '2:00', value: 120 },
  { label: '3:00', value: 180 },
  { label: '5:00', value: 300 },
]

const CURRENT_YEAR = new Date().getFullYear()
const DEFAULT_YEAR_MIN = CURRENT_YEAR - 100
const DEFAULT_YEAR_MAX = CURRENT_YEAR

const STORAGE_KEY = 'practice_settings'

type PracticeSettings = {
  roundTimerSec: number
  yearMin: number
  yearMax: number
}

function loadSettings(): PracticeSettings {
  if (typeof window === 'undefined') {
    return { roundTimerSec: 0, yearMin: DEFAULT_YEAR_MIN, yearMax: DEFAULT_YEAR_MAX }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PracticeSettings>
      return {
        roundTimerSec: typeof parsed.roundTimerSec === 'number' ? parsed.roundTimerSec : 0,
        yearMin: typeof parsed.yearMin === 'number' ? parsed.yearMin : DEFAULT_YEAR_MIN,
        yearMax: typeof parsed.yearMax === 'number' ? parsed.yearMax : DEFAULT_YEAR_MAX,
      }
    }
  } catch { /* ignore */ }
  return { roundTimerSec: 0, yearMin: DEFAULT_YEAR_MIN, yearMax: DEFAULT_YEAR_MAX }
}

function saveSettings(settings: PracticeSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

export function PracticePanel({ onStart }: { onStart: () => void }) {
  const t = useTranslations()
  const [settings, setSettings] = useState<PracticeSettings>(() => loadSettings())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) saveSettings(settings)
  }, [settings, mounted])

  const handleTimerChange = (value: number) => {
    setSettings(prev => ({ ...prev, roundTimerSec: value }))
  }

  const handleYearMinChange = (value: number) => {
    setSettings(prev => ({ ...prev, yearMin: Math.max(-400, Math.min(prev.yearMax, value)) }))
  }

  const handleYearMaxChange = (value: number) => {
    setSettings(prev => ({ ...prev, yearMax: Math.min(CURRENT_YEAR, Math.max(prev.yearMin, value)) }))
  }

  return (
    <div className={styles.practicePanel}>
      <div className={styles.configRow}>
        <label className={styles.configLabel}>{t('home.practice_timer') ?? 'Timer'}</label>
        <select
          className={styles.select}
          value={settings.roundTimerSec}
          onChange={(e) => handleTimerChange(Number(e.target.value))}
        >
          {TIMER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.configRow}>
        <label className={styles.configLabel}>{t('home.practice_year_range') ?? 'Year Range'}</label>
        <div className={styles.yearRangeInputs}>
          <input
            type="number"
            className={styles.yearInput}
            value={settings.yearMin}
            min={-400}
            max={settings.yearMax}
            onChange={(e) => handleYearMinChange(Number(e.target.value))}
          />
          <span className={styles.yearDash}>—</span>
          <input
            type="number"
            className={styles.yearInput}
            value={settings.yearMax}
            min={settings.yearMin}
            max={CURRENT_YEAR}
            onChange={(e) => handleYearMaxChange(Number(e.target.value))}
          />
        </div>
      </div>

      <button className={styles.startButton} onClick={onStart}>
        {t('home.practice_start') ?? 'Start Practice'}
      </button>
    </div>
  )
}
