import { useState, useEffect } from 'react'

export function DailyPanel({ onPlay }: { onPlay: () => void }) {
  const getCountdown = () => {
    const now = new Date()
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    const diff = midnight.getTime() - now.getTime()
    return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`
  }
  const [countdown, setCountdown] = useState(getCountdown)
  useEffect(() => {
    const calc = () => {
      setCountdown(getCountdown())
    }
    calc()
    const t = setInterval(calc, 60000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        Today&apos;s challenge resets in <strong style={{ color: '#fca5a5' }}>{countdown}</strong>
      </div>
      <button onClick={onPlay} style={{ width: '100%', maxWidth: 320, padding: '12px 32px', background: 'linear-gradient(135deg,#991b1b,#dc2626)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        Play Today&apos;s Challenge
      </button>
    </div>
  )
}
