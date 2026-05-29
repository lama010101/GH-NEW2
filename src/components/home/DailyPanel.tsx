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
    <div className={`${styles['card-sub-panel']} ${styles['card-sub-panel-horizontal']}`}>
      <div className={styles['card-sub-panel-left']}>
        <div className={styles['card-sub-panel-row-stack']}>
          <FireIcon />
          <span className={styles['card-sub-panel-text']}>Start your streak today!</span>
        </div>
        <div className={styles['card-sub-panel-muted']}>
          New challenge in <span style={{ color: '#fb923c' }}>⏱️</span> {countdown ?? "--h --m"}
        </div>
      </div>
      <button
        onClick={onPlay}
        className={`${styles['card-cta-btn']} ${styles['card-cta-btn-white-red']}`}
      >
        PLAY NOW
      </button>
    </div>
  )
}

function FireIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C10.5 4 9 6.5 9 9c0 1.5.5 2.5 1.5 3.5-1-.5-2-1.5-2.5-2.5C6.5 12 6 14 6 16c0 3.5 2.5 6 6 6s6-2.5 6-6c0-3-2-5.5-4-7 0 2-1 3.5-2 4.5 0-1.5.5-3 1.5-4C12.5 7.5 12 5 12 2z" fill="#ef4444" stroke="#ef4444" strokeWidth="1"/>
    </svg>
  )
}
