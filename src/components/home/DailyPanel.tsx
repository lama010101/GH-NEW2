'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import styles from './DailyPanel.module.css'

export function DailyPanel({ onPlay }: { onPlay: () => void }) {
  const t = useTranslations()
  void onPlay
  const getCountdown = () => {
    const now = new Date()
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    const diff = midnight.getTime() - now.getTime()
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return `${h}h ${m}m` 
  }
  const [countdown, setCountdown] = useState<string>('')
  useEffect(() => {
    setCountdown(getCountdown())
    const t = setInterval(() => setCountdown(getCountdown()), 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className={styles.dailyPanel}>
      <div className={styles.timerBox}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8"/>
          <path d="M12 7v5l3 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <span className={styles.timerLabel}>
          {t('home.daily_new_challenge')} <span className={styles.timerCountdown}>{countdown}</span>
        </span>
      </div>
    </div>
  )
}
