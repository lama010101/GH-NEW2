'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { AuthModal } from '@/components/AuthModal'
import { WelcomeModal } from '@/components/WelcomeModal'
import { DailyPanel } from '@/components/home/DailyPanel'
import { PracticePanel } from '@/components/home/PracticePanel'
import { LevelUpPanel } from '@/components/home/LevelUpPanel'
import { CompetePanel } from '@/components/home/CompetePanel'
import { MODE_CARD_GRADIENT, VERTICAL_CARD_ORDER, type Mode } from '@/components/home/types'
import styles from './home.module.css'
import { NavModal } from '@/components/NavModal'
import TopBar from '@/components/layout/TopBar'

function HomePageInner() {
  const router = useRouter()
  const t = useTranslations()

  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' })
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [welcomeData, setWelcomeData] = useState<{
    avatar: {
      id: string;
      first_name: string;
      last_name: string | null;
      description: string | null;
      gender: string | null;
      birth_city: string | null;
      birth_country: string | null;
      death_city: string | null;
      death_country: string | null;
      birth_day: string | null;
      death_day: string | null;
      image_url: string | null;
    };
    displayName: string;
  } | null>(null)
  useEffect(() => {
    bootstrapIdentity().then(setIdentity)
    return subscribeToIdentityChanges((state) => {
      setIdentity(state);
      if (state.status === 'ready') {
        setShowAuthModal(false);
        if (state.isNewUser) {
          fetch('/api/user/assign-avatar', { method: 'POST' })
            .then(r => r.json())
            .then(data => {
              if (data.avatar) {
                setWelcomeData({ avatar: data.avatar, displayName: data.profile.display_name });
              }
            })
            .catch(() => {});
        }
      } else if (state.status === 'unauthenticated') {
        setShowAuthModal(true);
      }
    });
  }, [])

  const [accuracy, setAccuracy] = useState('--')
  const [xp, setXp] = useState('--')

  const [avatarUrl, setAvatarUrl] = useState<string|null>(null)
  const [initials, setInitials] = useState('')

  useEffect(() => {
    if (identity.status !== 'ready') {
      setAvatarUrl(null)
      setInitials('PL')
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
      if (initials === '') {
        const dn = (identity as { status: string; playerId: string; displayName: string }).displayName
        if (dn && dn !== 'Player') {
          setInitials(dn.slice(0,2).toUpperCase())
        } else {
          setInitials('PL')
        }
      }
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
    <div className={styles.pageRoot}>

      {/* Background */}
      <div aria-hidden="true" className={styles.bgImage} />
      <div className={styles.bgOverlay} />

      {/* Top bar */}
      <TopBar
        accuracy={accuracy}
        xp={xp}
        avatarUrl={avatarUrl}
        initials={initials}
        onAvatarClick={() => { if (identity.status !== 'ready') { setShowAuthModal(true); return } setShowNavModal(true) }}
      />

      {/* Scrollable content area */}
      <div className={styles['page-scroll']}>
        {/* Tagline */}
        <div className={styles.tagline}>
          {t('home.tagline')}
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
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} required={true} />
      {welcomeData && (
        <WelcomeModal
          isOpen={true}
          onClose={() => setWelcomeData(null)}
          avatar={welcomeData.avatar}
          initialDisplayName={welcomeData.displayName}
        />
      )}
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
  const t = useTranslations()
  const gradient = MODE_CARD_GRADIENT[mode]
  const title = t(`home.${mode}_name`)
  const subtitle = t(`home.${mode}_subtitle`)
  const desc = t(`home.${mode}_desc`)

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
              <p className={styles['card-desc']}>
                {desc.split('\n').map((line, i) => (
                  <span key={i}>{line}{i < desc.split('\n').length - 1 && <br />}</span>
                ))}
              </p>
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

        {/* Icon inside card — positioned absolute top-right */}
        <div className={styles['card-icon-wrap']}>
          <Image
            src={getIconSrc()}
            alt={title}
            fill
            className={styles.cardIconImg}
            sizes="110px"
          />
        </div>
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
