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
    if (identity.status !== 'ready') {
      setAvatarUrl(null)
      setInitials('?')
      setAccuracy('--')
      setXp('--')
      return
    }
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
    <div style={{ width: '100vw', minHeight: '100vh', position: 'relative', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#0a0a0a' }}>

      {/* Background */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'url(/home_background.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(0,0,0,0.8)' }} />

      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Image src="/icons/logo.webp" alt="Guess-History" width={120} height={32} style={{ objectFit: 'contain' }} priority />
        </div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 14px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{accuracy}<span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>%</span></span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f0c060' }}>{xp}<span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>XP</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        {/* Tagline */}
        <div style={{
          width: '100%',
          maxWidth: 480,
          padding: '0px 16px 12px',
          boxSizing: 'border-box' as const,
          textAlign: 'center',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '0.1px',
          lineHeight: 1.2,
          margin: '0 auto',
        }}>
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
    <div className={styles['mode-card']}>
      {/* Card background with clip */}
      <div className={styles['card-bg']} style={{ background: gradient }}>
        <div className={styles['card-inner']}>
          {/* Header: title only */}
          <div className={styles['card-header']}>
            <div className={styles['card-title-section']}>
              <h2 className={styles['card-title']}>{title}</h2>
              <p className={styles['card-subtitle']}>{subtitle}</p>
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

      {/* Icon floats above, outside clip */}
      <div className={styles['card-icon-wrap']}>
        <Image
          src={getIconSrc()}
          alt={title}
          fill
          style={{ objectFit: 'contain' }}
          sizes="180px"
        />
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
