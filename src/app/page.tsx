'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { AuthModal } from '@/components/AuthModal'
import { DailyPanel } from '@/components/home/DailyPanel'
import { PracticePanel } from '@/components/home/PracticePanel'
import { LevelUpPanel } from '@/components/home/LevelUpPanel'
import { CompetePanel } from '@/components/home/CompetePanel'
import { MODE_CARD_GRADIENT, MODE_CARD_TITLE, MODE_CARD_SUBTITLE, VERTICAL_CARD_ORDER, type Mode } from '@/components/home/types'
import styles from './home.module.css'
import { NavModal } from '@/components/NavModal'
import NotificationBell from '@/components/NotificationBell'

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
        const { data } = await supabaseBrowser.from('images').select('url').limit(15)
        if (data?.length) setMosaicUrls(data.map((r: { url: string }) => r.url))
      } catch {}
    })()
  }, [])

  const [showNavModal, setShowNavModal] = useState(false)

  const handleNav = (path: string) => {
    if (identity.status !== 'ready') { setShowAuthModal(true); return }
    router.push(path)
  }

  const playerId = (identity as { status: string; playerId: string; displayName: string }).playerId ?? ''
  const displayName = (identity as { status: string; playerId: string; displayName: string }).displayName ?? 'Player'

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#0a0a0a' }}>

      {/* Background */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'url(/home_background.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(0,0,0,0.8)' }} />

      {/* Top bar - unchanged */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 14px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{accuracy}<span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>%</span></span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f0c060' }}>{xp}<span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>XP</span></span>
        </div>
        <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'auto' }}>
          <NotificationBell />
          <button onClick={() => { if (identity.status !== 'ready') { setShowAuthModal(true); return } setShowNavModal(true) }} style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.4)', background: 'linear-gradient(135deg,#c45,#89b)', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

      {/* Scrollable content area */}
      <div className={styles['page-scroll']}>
        {/* Logo and tagline */}
        <div style={{ width: '100%', maxWidth: 860, padding: '0 24px', boxSizing: 'border-box', margin: '0 auto 32px', textAlign: 'center' }}>
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

        <div style={{ width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: 500, letterSpacing: '0.5px', marginBottom: 32, padding: '0 24px', boxSizing: 'border-box' }}>
          Where and when did it happen?
        </div>

        {/* Vertical card stack */}
        <div className={styles['cards-stack']}>
          {VERTICAL_CARD_ORDER.map(mode => (
            <ModeCard
              key={mode}
              mode={mode}
              playerId={playerId}
              displayName={displayName}
              onRequireAuth={() => setShowAuthModal(true)}
              onNavigate={handleNav}
              onLobby={(gameId) => router.push(`/compete/${gameId}`)}
            />
          ))}
        </div>
      </div>

      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={avatarUrl}
        initials={initials}
        displayName={(identity as { status: string; playerId: string; displayName: string }).displayName ?? initials}
      />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}

function ModeCard({
  mode,
  playerId,
  displayName,
  onRequireAuth,
  onNavigate,
  onLobby
}: {
  mode: Mode
  playerId: string
  displayName: string
  onRequireAuth: () => void
  onNavigate: (path: string) => void
  onLobby: (gameId: string) => void
}) {
  const gradient = MODE_CARD_GRADIENT[mode]
  const title = MODE_CARD_TITLE[mode]
  const subtitle = MODE_CARD_SUBTITLE[mode]

  const getIconSrc = () => {
    switch (mode) {
      case 'compete': return '/icons/compete_large.webp'
      case 'daily': return '/icons/daily_large.webp'
      case 'levelup': return '/icons/levels_large.webp'
      case 'practice': return '/icons/practice_large.webp'
      default: return '/icons/daily_large.webp'
    }
  }

  return (
    <div className={styles['mode-card']} style={{ background: gradient }}>
      <div className={styles['card-inner']}>
        {/* Header with title and icon */}
        <div className={styles['card-header']}>
          <div className={styles['card-title-section']}>
            <h2 className={styles['card-title']}>{title}</h2>
            <p className={styles['card-subtitle']}>{subtitle}</p>
          </div>
          <div className={styles['card-icon-wrap']}>
            <Image
              src={getIconSrc()}
              alt={title}
              fill
              style={{ objectFit: 'contain' }}
              sizes="80px"
            />
            {mode === 'daily' && (
              <span className={styles['card-badge']}>LIVE</span>
            )}
          </div>
        </div>

        {/* Mode-specific panel content */}
        {mode === 'compete' && (
          <CompetePanel
            playerId={playerId}
            displayName={displayName}
            onLobby={onLobby}
            onRequireAuth={onRequireAuth}
          />
        )}
        {mode === 'daily' && (
          <DailyPanel onPlay={() => onNavigate('/daily')} />
        )}
        {mode === 'levelup' && (
          <LevelUpPanel onStart={() => onNavigate('/levelup')} />
        )}
        {mode === 'practice' && (
          <PracticePanel onStart={() => onNavigate('/practice')} />
        )}
      </div>
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
