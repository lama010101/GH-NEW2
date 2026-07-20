'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bootstrapIdentity, subscribeToIdentityChanges, forceClearAuthStorage, type IdentityState } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { WelcomeModal } from '@/components/WelcomeModal'
import { DailyPanel } from '@/components/home/DailyPanel'
import { CompetePanel } from '@/components/home/CompetePanel'
import { MODE_CARD_GRADIENT, VERTICAL_CARD_ORDER, type Mode } from '@/components/home/types'
import { PracticeSettingsModal, type PracticeModalSettings } from '@/components/practice/PracticeSettingsModal'
import { loadPracticeSettings, savePracticeSettings } from '@/components/practice/practiceSettings'
import styles from './home.module.css'
import { NavModal } from '@/components/NavModal'
import TopBar from '@/components/layout/TopBar'
import RankCard from '@/components/RankCard'

function HomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()

  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' })
  const [kickedMessage, setKickedMessage] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('kicked') === '1') {
      setKickedMessage(t('lobby.kicked_toast'))
      const timer = setTimeout(() => setKickedMessage(null), 5000)
      router.replace('/home', { scroll: false })
      return () => clearTimeout(timer)
    }
  }, [searchParams, router, t])
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
  const [totalXpNum, setTotalXpNum] = useState<number | null>(null)

  const [avatarUrl, setAvatarUrl] = useState<string|null>(null)
  const [initials, setInitials] = useState('')
  const [profileVersion, setProfileVersion] = useState(0)

  useEffect(() => {
    if (identity.status !== 'ready') {
      setAvatarUrl(null)
      setInitials('PL')
      setAccuracy('--')
      setXp('--')
      setTotalXpNum(null)
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
          setTotalXpNum(Number(stats.total_xp))
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
  const [showLoadingTimeout, setShowLoadingTimeout] = useState(false)

  // Show escape hatch after 10s of continuous loading
  useEffect(() => {
    if (identity.status === 'ready') {
      setShowLoadingTimeout(false)
      return
    }
    const timer = setTimeout(() => setShowLoadingTimeout(true), 10000)
    return () => clearTimeout(timer)
  }, [identity.status])

  const handleNav = (path: string) => {
    router.push(path)
  }

  const handlePracticeStart = (settings: PracticeModalSettings) => {
    savePracticeSettings(settings)
    router.push('/practice')
  }

  const handleForceClear = () => {
    forceClearAuthStorage()
    window.location.replace('/login')
  }

  if (identity.status === 'error') {
    // A transient client-side failure (GoTrue lock contention / network) — the
    // middleware already validated the cookie server-side, so the user is very
    // likely authenticated. Redirecting to /login here produces the
    // "blank-black + empty console" screen (return null renders nothing on the
    // #080c14 body). Instead, offer a retry that re-runs bootstrapIdentity()
    // (which is retryable after an error: the previous bootstrap has settled
    // and no in-flight bootstrap is running, so it runs again).
    const handleRetry = () => {
      setIdentity({ status: 'loading' })
      bootstrapIdentity().then(setIdentity)
    }
    return (
      <div className={styles.pageRoot}>
        <div aria-hidden="true" className={styles.bgImage} />
        <div className={styles.bgOverlay} />
        <div className={styles.loadingIndicator}>
          <div>{t('game.identity_error')}</div>
          <button
            type="button"
            onClick={handleRetry}
            style={{ marginTop: 16, padding: '10px 24px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.22)', color: 'var(--gh-text-primary, #fff)', fontSize: 'var(--font-base)', cursor: 'pointer' }}
          >
            {t('game.retry')}
          </button>
          <button
            type="button"
            onClick={handleForceClear}
            style={{ marginTop: 8, padding: '10px 24px', borderRadius: 999, border: 'none', background: 'rgba(255,100,100,0.3)', color: 'var(--gh-text-primary, #fff)', fontSize: 'var(--font-base)', cursor: 'pointer' }}
          >
            {t('game.clear_session_restart')}
          </button>
        </div>
      </div>
    )
  }

  if (identity.status !== 'ready') {
    return (
      <div className={styles.pageRoot}>
        <div aria-hidden="true" className={styles.bgImage} />
        <div className={styles.bgOverlay} />
        <div className={styles.loadingIndicator}>
          <div>{t('common.loading')}</div>
          {showLoadingTimeout && (
            <>
              <div style={{ marginTop: 8, fontSize: 'var(--font-sm)', opacity: 0.8 }}>{t('game.taking_too_long')}</div>
              <button
                type="button"
                onClick={handleForceClear}
                style={{ marginTop: 16, padding: '10px 24px', borderRadius: 999, border: 'none', background: 'rgba(255,100,100,0.3)', color: 'var(--gh-text-primary, #fff)', fontSize: 'var(--font-base)', cursor: 'pointer' }}
              >
                {t('game.clear_session_restart')}
              </button>
            </>
          )}
        </div>
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

      {kickedMessage && (
        <div
          role="alert"
          style={{
            position: 'relative',
            zIndex: 50,
            padding: '10px 16px',
            background: 'var(--gh-error)',
            color: 'var(--gh-text-primary)',
            textAlign: 'center',
            fontSize: 'var(--font-sm)',
            fontWeight: 600,
          }}
        >
          {kickedMessage}
        </div>
      )}

      {/* Scrollable content area — rank card scrolls with the page (inline, not fixed) */}
      <div className={`${styles['page-scroll']} ${styles.pageScrollRankOpen}`}>
        {/* Rank title progress card — inline, scrolls with content */}
        <div className={styles.rankCardInline}>
          <RankCard totalXp={totalXpNum} open inline />
        </div>

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
  const desc = t(`home.${mode}_desc`)
  const isCompete = mode === 'compete'
  const [navigating, setNavigating] = useState(false)
  const [competeLoading, setCompeteLoading] = useState(false)
  const [competeError, setCompeteError] = useState<string | null>(null)

  const handleCompeteCreate = async () => {
    if (!playerId) { onRequireAuth(); return }
    setCompeteLoading(true)
    setCompeteError(null)
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
          yearMin: -400,
          yearMax: 2025,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('game.failed_create_session'))
      onLobby(data.gameId)
    } catch (e) {
      setCompeteError(e instanceof Error ? e.message : t('game.error_creating_game'))
    } finally {
      setCompeteLoading(false)
    }
  }

  const getIconSrc = () => {
    switch (mode) {
      case 'compete': return '/icons/compete_large.webp'
      case 'daily': return '/icons/daily_large.webp'
      case 'levelup': return '/icons/levels_large.webp'
      case 'practice': return '/icons/practice_large.webp'
      default: return '/icons/daily_large.webp'
    }
  }

  const handlePlay = () => {
    if (mode === 'daily') { setNavigating(true); onNavigate('/daily') }
    else if (mode === 'levelup') { setNavigating(true); onNavigate('/levelup') }
    else if (mode === 'practice') onPracticeStart()
  }

  // Compete card: icon+text row, then full CompetePanel below
  if (isCompete) {
    return (
      <div className={styles['mode-card']}>
        <div className={styles['card-bg']} style={{ background: gradient }}>
          <div className={styles.cardInnerHorizontal}>
            {/* Icon thumbnail on the LEFT */}
            <div className={styles.cardIconThumb} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getIconSrc()} alt="" className={styles.cardIconThumbImg} draggable={false} />
            </div>

            {/* Title + description in the MIDDLE */}
            <div className={styles.cardTextCol}>
              <h2 className={styles.cardTitleLeft}>{title}</h2>
              <p className={styles.cardDescLeft}>
                {desc.split('\n').map((line, i) => (
                  <span key={i}>{line}{i < desc.split('\n').length - 1 && <br />}</span>
                ))}
              </p>
            </div>

            {/* CREATE pill button on the RIGHT (plus icon + i18n create label) */}
            <button
              type="button"
              className={styles.playPill}
              onClick={handleCompeteCreate}
              disabled={competeLoading}
              aria-label={t('home.play_mode_aria', { mode: title })}
            >
              {competeLoading ? (
                <span className={styles.playPillSpinner} aria-hidden="true" />
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t('home.compete_create_game')}
                </>
              )}
            </button>
          </div>

          {/* Compete panel below the icon+text row */}
          <div className={styles.competePanelWrap}>
            <CompetePanel
              playerId={playerId}
              onLobby={onLobby}
            />
          </div>
          {competeError && (
            <div style={{ color: 'var(--gh-danger)', fontSize: 'var(--font-2xs)', padding: '4px 20px 12px' }}>
              {competeError}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Non-compete card: icon-left, text-middle, play-right
  return (
    <div className={styles['mode-card']}>
      <div className={styles['card-bg']} style={{ background: gradient }}>
        <div className={styles.cardInnerHorizontal}>
          {/* Icon thumbnail on the LEFT */}
          <div className={styles.cardIconThumb} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getIconSrc()} alt="" className={styles.cardIconThumbImg} draggable={false} />
          </div>

          {/* Title + description in the MIDDLE */}
          <div className={styles.cardTextCol}>
            <h2 className={styles.cardTitleLeft}>{title}</h2>
            <p className={styles.cardDescLeft}>
              {desc.split('\n').map((line, i) => (
                <span key={i}>{line}{i < desc.split('\n').length - 1 && <br />}</span>
              ))}
            </p>
            {/* Daily card: timer inline below description */}
            {mode === 'daily' && (
              <DailyPanel onPlay={() => onNavigate('/daily')} />
            )}
          </div>

          {/* Play pill button on the RIGHT (triangle icon + i18n play label) */}
          <button
            type="button"
            className={styles.playPill}
            onClick={handlePlay}
            disabled={navigating}
            aria-label={t('home.play_mode_aria', { mode: title })}
          >
            {navigating ? (
              <span className={styles.playPillSpinner} aria-hidden="true" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
                {t('home.compete_play')}
              </>
            )}
          </button>
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
