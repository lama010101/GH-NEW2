'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '7px 12px',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8"/>
          <path d="M12 7v5l3 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 'var(--font-xs)', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
          {t('home.daily_new_challenge')} <span style={{ color: 'var(--gh-orange)' }}>{countdown}</span>
        </span>
      </div>
    </div>
  )
}
