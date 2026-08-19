'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { getNextDailyRollover } from '@/core/dailyDate'
import styles from './DailyPanel.module.css'

export type DailyStatusPayload = {
  status: 'not_started' | 'in_progress' | 'completed' | 'expired' | null
  gameId?: string
  avgAccuracy?: number
  totalXp?: number
  rank?: number | null
}

export function DailyPanel({
  onStatusChange,
}: {
  onStatusChange?: (payload: DailyStatusPayload) => void
}) {
  const t = useTranslations()
  const [status, setStatus] = useState<DailyStatusPayload['status']>(null)
  const [countdown, setCountdown] = useState<string>('')

  useEffect(() => {
    let mounted = true
    fetch('/api/daily/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return
        const payload: DailyStatusPayload = {
          status: data.status ?? null,
          gameId: data.gameId,
          avgAccuracy: data.results?.avgAccuracy,
          totalXp: data.results?.totalXp,
          rank: data.results?.rank,
        }
        setStatus(payload.status)
        onStatusChange?.(payload)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [onStatusChange])

  useEffect(() => {
    const compute = () => {
      const now = new Date()
      const nextRollover = getNextDailyRollover(now)
      const diff = Math.max(0, nextRollover.getTime() - now.getTime())
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      return t('common.countdown_hm', { h, m })
    }
    setCountdown(compute())
    const id = setInterval(() => setCountdown(compute()), 60000)
    return () => clearInterval(id)
  }, [status, t])

  if (status == null) return null

  const label = status === 'in_progress' ? t('home.daily_ends_in') : t('home.daily_next_in')

  return (
    <div className={styles.dailyPanel}>
      <div className={styles.timerBox}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="var(--gh-text-secondary)" strokeWidth="1.8"/>
          <path d="M12 7v5l3 3" stroke="var(--gh-text-secondary)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <span className={styles.timerLabel}>
          {label} <span className={styles.timerCountdown}>{countdown}</span>
        </span>
      </div>
    </div>
  )
}
