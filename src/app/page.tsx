'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { AuthModal } from '@/components/AuthModal'

const CARD_GRADIENT: Record<string, string> = {
  daily:    'linear-gradient(180deg, #1a3a6a 0%, #0d2050 100%)',
  practice: 'linear-gradient(180deg, #fcd34d 0%, #f97316 60%, #ea580c 100%)',
  levelup:  'linear-gradient(180deg, #f9a8d4 0%, #e879f9 40%, #7c3aed 100%)',
  compete:  'linear-gradient(180deg, #45fff0 0%, #00adc1 100%)',
}
const CARD_NAME: Record<string, string> = {
  daily: 'Daily', practice: 'Practice', levelup: 'Level Up', compete: 'Compete'
}
const CARD_SUB: Record<string, string> = {
  daily: "Today's challenge", practice: 'Solo warm-up', levelup: 'Progressive runs', compete: 'Friends lobby'
}
const MODES = ['daily', 'practice', 'levelup', 'compete'] as const
type Mode = typeof MODES[number]

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 44, height: 24, borderRadius: 12, background: on ? '#22c55e' : 'rgba(255,255,255,0.2)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </div>
  )
}

function DailyPanel({ onPlay }: { onPlay: () => void }) {
  const [countdown, setCountdown] = useState('')
  useEffect(() => {
    const calc = () => {
      const now = new Date()
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      const diff = midnight.getTime() - now.getTime()
      setCountdown(`${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`)
    }
    calc()
    const t = setInterval(calc, 60000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
Today&apos;s challenge resets in <strong style={{ color: '#93c5fd' }}>{countdown}</strong>
      </div>
      <button onClick={onPlay} style={{ width: '100%', maxWidth: 320, padding: '12px 32px', background: 'linear-gradient(135deg,#1a3f7a,#2a6abf)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        Play Today&apos;s Challenge
      </button>
    </div>
  )
}

function PracticePanel({ onStart }: { onStart: () => void }) {
  const [timerOn, setTimerOn] = useState(false)
  const [yearsOn, setYearsOn] = useState(false)
  // Timer: value in seconds, range 5–300, step 5
  const [timerSec, setTimerSec] = useState(120)
  // Year range: min -100 to 2025
  const [yearMin, setYearMin] = useState(-100)
  const [yearMax, setYearMax] = useState(2025)

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}` 
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* TIMER ROW */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
        <Toggle on={timerOn} onClick={() => setTimerOn(v => !v)} />
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500, flex: 1 }}>Round Timer</span>
        {timerOn && <span style={{ fontSize: 14, fontWeight: 700, color: '#fb923c' }}>{formatTimer(timerSec)}</span>}
      </div>
      {timerOn && (
        <div style={{ paddingLeft: 56, paddingRight: 8, paddingBottom: 8 }}>
          <input
            type="range"
            min={5} max={300} step={5}
            value={timerSec}
            onChange={e => setTimerSec(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#fb923c', cursor: 'pointer' }}
          />
        </div>
      )}

      {/* YEARS ROW */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
        <Toggle on={yearsOn} onClick={() => setYearsOn(v => !v)} />
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500, flex: 1 }}>Years</span>
        {yearsOn && (
          <span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fb923c' }}>{yearMin}</span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', margin: '0 6px' }}>—</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fb923c' }}>{yearMax}</span>
          </span>
        )}
      </div>
      {yearsOn && (
        <div style={{ paddingLeft: 56, paddingRight: 8, paddingBottom: 12 }}>
          <div className="range-wrap">
            <div className="range-track" />
            <div className="range-fill" style={{
              left: `${((yearMin - (-100)) / (2025 - (-100))) * 100}%`,
              right: `${100 - ((yearMax - (-100)) / (2025 - (-100))) * 100}%`,
            }} />
            <input
              type="range"
              min={-100} max={2025} step={1}
              value={yearMin}
              onChange={e => {
                const v = Number(e.target.value)
                if (v < yearMax - 1) setYearMin(v)
              }}
              style={{ zIndex: yearMin > 2000 ? 5 : 3 }}
            />
            <input
              type="range"
              min={-100} max={2025} step={1}
              value={yearMax}
              onChange={e => {
                const v = Number(e.target.value)
                if (v > yearMin + 1) setYearMax(v)
              }}
              style={{ zIndex: 4 }}
            />
          </div>
        </div>
      )}

      <button onClick={onStart} style={{ width: '100%', padding: 13, background: 'linear-gradient(135deg,#c05010,#f07820)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
        Start Practice
      </button>
    </div>
  )
}

function LevelUpPanel({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
        <span>Level <strong style={{ color: '#fff' }}>5</strong> → Level <strong style={{ color: '#fff' }}>6</strong></span>
        <span>Min accuracy: <strong style={{ color: '#fff' }}>52%</strong></span>
      </div>
      <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
        <div style={{ width: '40%', height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#7c3aed,#a855f7)' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['Year range','1776–2025'],['Timer','4:50'],['Rounds','5']].map(([l,v]) => (
          <div key={l} style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 6px', textAlign: 'center', border: '0.5px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{v}</div>
          </div>
        ))}
      </div>
      <button onClick={onStart} style={{ width: '100%', padding: 13, background: 'linear-gradient(135deg,#5b21b6,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        Start Level 5
      </button>
    </div>
  )
}

function CompetePanel({ onLobby, playerId, displayName }: {
  onLobby: (gameId: string) => void
  playerId: string
  displayName: string
}) {
  const [cmode, setCmode] = useState<'create'|'join'>('create')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)

  const handleCreate = async () => {
    if (!playerId) { setError('Please sign in first'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compete/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          displayName,
          mode: 'sync',
          roundTimerSec: 120,
          totalRounds: 5,
          yearMin: -100,
          yearMax: 2025,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      onLobby(data.gameId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating game')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compete/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Room not found')
      onLobby(data.gameId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Room not found')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['create', 'join'] as const).map(m => (
          <button key={m} onClick={() => { setCmode(m); setCode(''); setError(null) }}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
              border: cmode===m ? '2px solid #1a9a7a' : '1px solid rgba(255,255,255,0.15)',
              background: cmode===m ? 'rgba(26,154,122,0.2)' : 'rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
              {m === 'create' ? 'New Game' : 'Join with code'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {m === 'create' ? 'Create a lobby' : 'Enter room code'}
            </div>
          </button>
        ))}
      </div>

      {cmode === 'join' && (
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABCD12"
          maxLength={6}
          style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: '#fff',
            fontSize: 18, fontWeight: 700, letterSpacing: '4px', textAlign: 'center',
            outline: 'none', boxSizing: 'border-box' }}
        />
      )}

      <button
        onClick={cmode === 'create' ? handleCreate : handleJoin}
        disabled={loading || (cmode === 'join' && code.length === 0)}
        style={{ width: '100%', padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 700,
          border: 'none', letterSpacing: '0.3px',
          cursor: loading || (cmode === 'join' && !code) ? 'not-allowed' : 'pointer',
          background: loading || (cmode === 'join' && !code)
            ? 'rgba(255,255,255,0.08)'
            : 'linear-gradient(135deg,#0a4a3a,#1a9a7a)',
          color: loading || (cmode === 'join' && !code)
            ? 'rgba(255,255,255,0.3)'
            : '#fff' }}>
        {loading
          ? (cmode === 'create' ? 'Creating...' : 'Joining...')
          : (cmode === 'create' ? 'Create Game' : 'Go to Lobby')}
      </button>

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center', marginTop: 2 }}>
          {error}
        </div>
      )}
    </div>
  )
}

function CardItem({ mode, selected, onSelect }: { mode: Mode; selected: boolean; onSelect: (m: Mode) => void }) {
  return (
    <div
      className="card-item"
      onClick={() => onSelect(mode)}
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        outline: selected ? '3px solid rgba(255,255,255,0.7)' : '3px solid transparent',
        transform: selected ? 'translateY(-5px)' : 'none',
        transition: 'outline-color 0.18s, transform 0.15s',
      }}
    >
      <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative', background: CARD_GRADIENT[mode], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 214, height: 214, transform: mode === 'daily' ? 'translateY(18px)' : 'none' }}>
          <Image
            src={
              mode === 'daily'    ? '/icons/daily_large.webp'    :
              mode === 'practice' ? '/icons/practice_large.webp' :
              mode === 'levelup'  ? '/icons/levels_large.webp'   :
                                    '/icons/compete_large.webp'
            }
            alt={CARD_NAME[mode]}
            fill
            style={{ objectFit: 'contain' }}
            sizes="160px"
          />
        </div>
        {mode === 'levelup' && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '3px 10px', fontSize: 10, color: '#fff', whiteSpace: 'nowrap', fontWeight: 600 }}>Level 5</div>
        )}
      </div>
      <div style={{ background: 'rgba(12,12,18,0.97)', padding: '10px 8px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '1.5px', color: '#fff', textTransform: 'uppercase' }}>{CARD_NAME[mode]}</div>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '1px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginTop: 3 }}>{CARD_SUB[mode]}</div>
      </div>
    </div>
  )
}

function HomePageInner() {
  const router = useRouter()
  const carouselRef = useRef<HTMLDivElement>(null)

  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' })
  const [showAuthModal, setShowAuthModal] = useState(false)
  useEffect(() => {
    bootstrapIdentity().then(setIdentity)
    return subscribeToIdentityChanges(setIdentity)
  }, [])

  const [accuracy, setAccuracy] = useState('--')
  const [xp, setXp] = useState('--')

  const [avatarUrl, setAvatarUrl] = useState<string|null>(null)
  const [initials, setInitials] = useState('?')

  useEffect(() => {
    if (identity.status !== 'ready') return
    const pid = (identity as { status: string; playerId?: string }).playerId
    ;(async () => {
      try {
        const { data: stats } = await supabaseBrowser.from('player_global_stats').select('avg_accuracy,total_xp').eq('player_id', pid).single()
        if (stats) {
          setAccuracy(String(Math.round(Number(stats.avg_accuracy))))
          setXp(Number(stats.total_xp).toLocaleString('fr-FR'))
        }
      } catch {}
      try {
        const { data: profile } = await supabaseBrowser.from('profiles').select('display_name,avatar_url').eq('id', pid).single()
        if (profile) {
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url)
          if (profile.display_name) setInitials(profile.display_name.slice(0,2).toUpperCase())
        }
      } catch {}
    })()
  }, [identity.status])

  const [mosaicUrls, setMosaicUrls] = useState<string[]>([])
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabaseBrowser.from('images').select('image_url').limit(15)
        if (data?.length) setMosaicUrls(data.map((r: { image_url: string }) => r.image_url))
      } catch {}
    })()
  }, [])

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    if (window.innerWidth > 768) return
    // Find the card matching selectedMode and scroll it into view
    const cards = el.querySelectorAll('.card-item')
    const idx = MODES.indexOf(selectedMode)
    if (cards[idx]) {
      (cards[idx] as HTMLElement).scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [])


  const [selectedMode, setSelectedMode] = useState<Mode>('daily')
  const [panelMode, setPanelMode] = useState<Mode>('daily')
  const [panelVisible, setPanelVisible] = useState(true)

  const selectCard = (mode: Mode) => {
    if (mode === selectedMode) return
    setSelectedMode(mode)
    setPanelVisible(false)
    setTimeout(() => { setPanelMode(mode); setPanelVisible(true) }, 180)
  }

  const handleNav = (path: string) => {
    if (identity.status !== 'ready') { setShowAuthModal(true); return }
    router.push(path)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#0a0a0a' }}>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .cards-container {
          display: flex;
          gap: 14px;
          width: 100%;
          max-width: 860px;
          margin: 0 auto;
          padding: 8px 24px 0;
          box-sizing: border-box;
        }

        .card-item {
          flex: 1 1 0;
          min-width: 0;
        }

        .range-wrap { position: relative; height: 20px; }
        .range-wrap input[type=range] {
          position: absolute;
          width: 100%;
          height: 4px;
          background: transparent;
          pointer-events: none;
          -webkit-appearance: none;
          appearance: none;
          outline: none;
          top: 50%;
          transform: translateY(-50%);
        }
        .range-wrap input[type=range]::-webkit-slider-thumb {
          pointer-events: all;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: #fb923c;
          -webkit-appearance: none;
          appearance: none;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
        .range-wrap input[type=range]::-moz-range-thumb {
          pointer-events: all;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: #fb923c;
          cursor: pointer;
          border: 2px solid #fff;
        }
        .range-track {
          position: absolute;
          top: 50%; transform: translateY(-50%);
          height: 4px;
          background: rgba(255,255,255,0.15);
          width: 100%;
          border-radius: 2px;
        }
        .range-fill {
          position: absolute;
          top: 50%; transform: translateY(-50%);
          height: 4px;
          background: #fb923c;
          border-radius: 2px;
        }

        @media (max-width: 768px) {
          .cards-container {
            max-width: 100vw;
            margin: 0;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-left: 0;
            padding-right: 0;
            box-sizing: border-box;
            gap: 12px;
          }
          .cards-container::before,
          .cards-container::after {
            content: '';
            flex: 0 0 calc(50vw - 135px);
          }
          .cards-container::-webkit-scrollbar { display: none; }
          .card-item {
            flex: 0 0 270px;
            min-width: 270px;
            max-width: 270px;
            scroll-snap-align: center;
          }
        }
      `}</style>

      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'url(/home_background.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />

      <div style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(0,0,0,0.7)' }} />

      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 14px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{accuracy}<span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>%</span></span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f0c060' }}>{xp}<span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>XP</span></span>
        </div>
        <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'auto' }}>
          <button onClick={() => router.push('/notifications')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
          <button onClick={() => router.push('/profile')} style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.4)', background: 'linear-gradient(135deg,#c45,#89b)', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatarUrl
              ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )
              : <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{initials.slice(0,2)}</span>
            }
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 30 }}>

        {/* padded inner — logo only */}
        <div style={{ width: '100%', maxWidth: 860, padding: '0 24px', boxSizing: 'border-box', margin: '0 auto', marginBottom: 12, textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 280, height: 72, margin: '0 auto' }}>
            <Image
              src="/icons/logo.webp"
              alt="Guess-History"
              fill
              style={{ objectFit: 'contain' }}
              sizes="280px"
              priority
            />
          </div>
        </div>

        <div style={{ width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: 500, letterSpacing: '0.5px', marginBottom: 130, padding: '0 24px', boxSizing: 'border-box' }}>
          Where and when did it happen?
        </div>

        {/* cards — full width, no padding constraint */}
        <div className="cards-container" ref={carouselRef} style={{ marginTop: -50 }}>
          {MODES.map(mode => (
            <CardItem key={mode} mode={mode} selected={selectedMode === mode} onSelect={selectCard} />
          ))}
        </div>

        {/* info panel — padded */}
        <div style={{ width: '100%', maxWidth: 860, padding: '0 24px', boxSizing: 'border-box', margin: '0 auto', maxHeight: panelVisible ? 320 : 0, opacity: panelVisible ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.22s ease', marginTop: panelVisible ? 14 : 0 }}>
          {panelMode === 'daily' && <DailyPanel onPlay={() => handleNav('/daily')} />}
          {panelMode === 'practice' && <PracticePanel onStart={() => handleNav('/practice')} />}
          {panelMode === 'levelup' && <LevelUpPanel onStart={() => handleNav('/levelup')} />}
          {panelMode === 'compete' && (
            <CompetePanel
              playerId={(identity as { status: string; playerId: string; displayName: string }).playerId ?? ''}
              displayName={(identity as { status: string; playerId: string; displayName: string }).displayName ?? 'Player'}
              onLobby={(gameId) => router.push(`/compete/${gameId}`)}
            />
          )}
        </div>

      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  )
}
