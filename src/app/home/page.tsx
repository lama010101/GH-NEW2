'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { WelcomeModal } from '@/components/WelcomeModal'
import { DailyPanel } from '@/components/home/DailyPanel'
import { PracticePanel } from '@/components/home/PracticePanel'
import { LevelUpPanel } from '@/components/home/LevelUpPanel'
import { CompetePanel } from '@/components/home/CompetePanel'
import { MODE_CARD_GRADIENT, VERTICAL_CARD_ORDER, type Mode } from '@/components/home/types'
import { PracticeSettingsModal, type PracticeModalSettings } from '@/components/practice/PracticeSettingsModal'
import { loadPracticeSettings, savePracticeSettings } from '@/components/practice/practiceSettings'
import styles from './home.module.css'
import { NavModal } from '@/components/NavModal'
import TopBar from '@/components/layout/TopBar'

function HomePageInner() {
  const router = useRouter()
  const t = useTranslations()

  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' })
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
  const [welcomeLoading, setWelcomeLoading] = useState(false)
  const welcomeHandledRef = useRef(false)

  const triggerAssignAvatar = () => {
    if (welcomeHandledRef.current) return
    welcomeHandledRef.current = true
    setWelcomeLoading(true)
    fetch('/api/user/assign-avatar', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.avatar) {
          setWelcomeData({ avatar: data.avatar, displayName: data.profile.display_name });
        }
      })
      .catch(() => {})
      .finally(() => setWelcomeLoading(false));
  }

  useEffect(() => {
    bootstrapIdentity().then((state) => {
      setIdentity(state);
      if (state.status === 'unauthenticated') {
        router.replace('/login?next=/home');
      }
      if (state.status === 'ready' && state.isNewUser) {
        triggerAssignAvatar();
      }
    })
    return subscribeToIdentityChanges((state) => {
      setIdentity(state);
      if (state.status === 'unauthenticated') {
        router.replace('/login?next=/home');
        return;
      }
      if (state.status === 'ready') {
        if (state.isNewUser) {
          triggerAssignAvatar();
        }
      }
    });
  }, [router])

  const [accuracy, setAccuracy] = useState('--')
  const [xp, setXp] = useState('--')

  const [avatarUrl, setAvatarUrl] = useState<string|null>(null)
  const [initials, setInitials] = useState('')
  const [profileVersion, setProfileVersion] = useState(0)

  useEffect(() => {
    if (identity.status !== 'ready') {
      setAvatarUrl(null)
      setInitials('PL')
      setAccuracy('--')
      setXp('--')
      return
    }
    const pid = (identity as { status: string; playerId?: string }).playerId
    if (!pid) return
    // Capture pid at effect start so we can bail if identity changes before
    // the async queries resolve (cross-user sign-in in same browser context).
    // Without this guard, Player A's profile data overwrites Player B's UI.
    let cancelled = false
    ;(async () => {
      try {
        const { data: stats } = await supabaseBrowser.from('player_global_stats').select('avg_accuracy,total_xp').eq('player_id', pid).single()
        if (cancelled) return
        if (stats) {
          setAccuracy(String(Math.round(Number(stats.avg_accuracy))))
          setXp(Number(stats.total_xp).toLocaleString('fr-FR'))
        }
      } catch {}
      try {
        const { data: profile } = await supabaseBrowser.from('profiles').select('display_name,avatar_url').eq('id', pid).single()
        if (cancelled) return
        if (profile) {
          setAvatarUrl(profile.avatar_url ?? null)
          if (profile.display_name) setInitials(profile.display_name.slice(0,2).toUpperCase())
        }
      } catch {}
      // profileVersion is used to force re-fetch when WelcomeModal saves
      void profileVersion
    })()
    return () => { cancelled = true }
  }, [identity, profileVersion])

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
  const [practiceModalOpen, setPracticeModalOpen] = useState(false)

  const handleNav = (path: string) => {
    router.push(path)
  }

  const handlePracticeStart = (settings: PracticeModalSettings) => {
    savePracticeSettings(settings)
    setPracticeModalOpen(false)
    router.push('/practice')
  }

  if (identity.status === 'error') {
    router.replace('/login?next=/home')
    return null
  }

  if (identity.status !== 'ready') {
    return (
      <div className={styles.pageRoot}>
        <div aria-hidden="true" className={styles.bgImage} />
        <div className={styles.bgOverlay} />
        <div className={styles.loadingIndicator}>{t('common.loading')}</div>
      </div>
    )
  }

  // New users: keep the loading screen until the welcome data is ready so the
  // home UI never flashes before the welcome modal.
  if (welcomeLoading && !welcomeData) {
    return (
      <div className={styles.pageRoot}>
        <div aria-hidden="true" className={styles.bgImage} />
        <div className={styles.bgOverlay} />
        <div className={styles.loadingIndicator}>{t('common.loading')}</div>
      </div>
    )
  }

  const playerId = identity.playerId
  const displayName = identity.displayName

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
        onAvatarClick={() => setShowNavModal(true)}
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
              onRequireAuth={() => {}}
              onNavigate={handleNav}
              onLobby={(gameId) => router.push(`/compete/${gameId}`)}
              onPracticeStart={() => setPracticeModalOpen(true)}
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
      {welcomeData && (
        <WelcomeModal
          isOpen={true}
          onClose={() => setWelcomeData(null)}
          avatar={welcomeData.avatar}
          initialDisplayName={welcomeData.displayName}
          onSaved={() => setProfileVersion(v => v + 1)}
        />
      )}
      <PracticeSettingsModal
        isOpen={practiceModalOpen}
        onClose={() => setPracticeModalOpen(false)}
        onStart={handlePracticeStart}
        initialSettings={loadPracticeSettings()}
      />
    </div>
  )
}

function ModeCard({
  mode,
  playerId,
  displayName,
  onRequireAuth,
  onNavigate,
  onLobby,
  onPracticeStart
}: {
  mode: Mode
  playerId: string
  displayName: string
  onRequireAuth: () => void
  onNavigate: (path: string) => void
  onLobby: (gameId: string) => void
  onPracticeStart: () => void
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
              <h2 className={styles['card-title']}>{subtitle}</h2>
              <div className={styles['card-desc-wrap']}>
                <p className={styles['card-desc']}>
                  {desc.split('\n').map((line, i) => (
                    <span key={i}>{line}{i < desc.split('\n').length - 1 && <br />}</span>
                  ))}
                </p>
              </div>
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
            <PracticePanel onStart={onPracticeStart} />
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
