'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { AuthModal } from '@/components/AuthModal'
import { CardItem } from '@/components/home/CardItem'
import { DailyPanel } from '@/components/home/DailyPanel'
import { PracticePanel } from '@/components/home/PracticePanel'
import { LevelUpPanel } from '@/components/home/LevelUpPanel'
import { CompetePanel } from '@/components/home/CompetePanel'
import { MODES, type Mode } from '@/components/home/types'
import styles from './home.module.css'

function HomePageInner() {
  const router = useRouter()

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
  }, [identity])

  const [, setMosaicUrls] = useState<string[]>([])
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabaseBrowser.from('images').select('image_url').limit(15)
        if (data?.length) setMosaicUrls(data.map((r: { image_url: string }) => r.image_url))
      } catch {}
    })()
  }, [])

  const [cardState, setCardState] = useState<{ mode: Mode; panelVisible: boolean }>({ mode: 'daily', panelVisible: true })



  const selectCard = (mode: Mode) => {
    if (identity.status !== 'ready') { setShowAuthModal(true); return }
    setCardState({ mode, panelVisible: false })
    requestAnimationFrame(() => {
      setCardState({ mode, panelVisible: true })
    })
  }

  const handleNav = (path: string) => {
    if (identity.status !== 'ready') { setShowAuthModal(true); return }
    router.push(path)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#0a0a0a' }}>


      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'url(/home_background.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />

      <div style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(0,0,0,0.8)' }} />

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
          <button onClick={() => { if (identity.status !== 'ready') { setShowAuthModal(true); return } router.push('/profile') }} style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.4)', background: 'linear-gradient(135deg,#c45,#89b)', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

      <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 1 }}>

        {/* padded inner — logo only */}
        <div style={{ width: '100%', maxWidth: 860, padding: '0 24px', boxSizing: 'border-box', margin: '0 auto', marginBottom: 1, textAlign: 'center' }}>
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

        <div style={{ width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: 500, letterSpacing: '0.5px', marginBottom: 100, padding: '0 24px', boxSizing: 'border-box' }}>
          Where and when did it happen?
        </div>

        {/* cards — full width, no padding constraint */}
        <div className={styles['cards-container']} style={{ marginTop: -50 }}>
          {MODES.map(mode => (
            <CardItem key={mode} mode={mode} selected={cardState.mode === mode} onSelect={selectCard} />
          ))}
        </div>

        {/* info panel — padded */}
        <div style={{ width: '100%', maxWidth: 860, padding: '0 24px', boxSizing: 'border-box', margin: '0 auto', maxHeight: cardState.panelVisible ? 320 : 0, opacity: cardState.panelVisible ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.22s ease', marginTop: cardState.panelVisible ? 14 : 0 }}>
          {cardState.mode === 'daily' && <DailyPanel onPlay={() => handleNav('/daily')} />}
          {cardState.mode === 'practice' && <PracticePanel onStart={() => handleNav('/practice')} />}
          {cardState.mode === 'levelup' && <LevelUpPanel onStart={() => handleNav('/levelup')} />}
          {cardState.mode === 'compete' && (
            <CompetePanel
              playerId={(identity as { status: string; playerId: string; displayName: string }).playerId ?? ''}
              displayName={(identity as { status: string; playerId: string; displayName: string }).displayName ?? 'Player'}
              onLobby={(gameId) => router.push(`/compete/${gameId}`)}
              onRequireAuth={() => setShowAuthModal(true)}
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
