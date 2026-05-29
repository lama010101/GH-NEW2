'use client'

import { useState, useEffect } from 'react'
import styles from '@/app/home.module.css'

export function DailyPanel({ onPlay }: { onPlay: () => void }) {
  const getCountdown = () => {
    const now = new Date()
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    const diff = midnight.getTime() - now.getTime()
    return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`
  }
  const [countdown, setCountdown] = useState<string | null>(null)
  useEffect(() => {
    const calc = () => {
      setCountdown(getCountdown())
    }
    calc()
    const t = setInterval(calc, 60000)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      {/* Middle sub-panel */}
      <div className={styles['card-sub-panel']}>
        <div className={styles['card-sub-panel-row']}>
          <span style={{ fontSize: 20 }}>🔥</span>
          <span className={styles['card-sub-panel-text']}>Start your streak today!</span>
        </div>
        <div className={styles['card-sub-panel-muted']}>
          New challenge in <span style={{ color: '#fb923c' }}>🕐</span> {countdown ?? "--h --m"}
        </div>
      </div>

      {/* CTA button */}
      <button
        onClick={onPlay}
        className={`${styles['card-cta-btn']} ${styles['card-cta-btn-white-red']}`}
      >
        PLAY NOW
      </button>
    </>
  )
}
