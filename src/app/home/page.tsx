'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bootstrapIdentity, subscribeToIdentityChanges, forceClearAuthStorage, updateCachedDisplayName, updateCachedAvatarUrl, type IdentityState } from '@/core/identity'
import { supabaseBrowser, readSession } from '@/core/supabaseBrowser'
import { WelcomeModal } from '@/components/WelcomeModal'
import { PushSoftAsk } from '@/components/PushSoftAsk'
import { JourneyCard } from '@/components/home/JourneyCard'
import { DailyCard } from '@/components/home/DailyCard'
import { ChallengeCard } from '@/components/home/ChallengeCard'
import { PracticeCard } from '@/components/home/PracticeCard'
import { GuestConversionModal } from '@/app/journey/_components/GuestConversionModal'
import { useHomeCardOrder, useIsMobileViewport } from '@/components/home/useHomeCardOrder'
import { HOME_CARD_DESKTOP_ORDER } from '@/core/homeCardOrder'
import { PracticeSettingsModal, type PracticeModalSettings } from '@/components/practice/PracticeSettingsModal'
import { PracticeResumeModal } from '@/components/practice/PracticeResumeModal'
import { loadPracticeSettings, savePracticeSettings } from '@/components/practice/practiceSettings'
import styles from './home.module.css'
import { NavModal } from '@/components/NavModal'
import TopBar from '@/components/layout/TopBar'

function HomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()

  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' })
  const [kickedMessage, setKickedMessage] = useState<string | null>(null)
  const currentPlayerId = (identity as { status: string; playerId?: string }).playerId

  // State-aware card order on single-column viewports (UIX-HOME-DYNORDER-
  // 1022-001). Must stay above the early returns below (rules of hooks); the
  // settle clock starts on the first card signal, not at hook mount.
  const { order: homeCardOrder, reportDaily, reportJourney, reportChallenge } =
    useHomeCardOrder(currentPlayerId)
  const isMobileViewport = useIsMobileViewport()

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
  const [welcomeCompleted, setWelcomeCompleted] = useState<boolean | null>(null)
  const [pushSoftAskDismissed, setPushSoftAskDismissed] = useState<boolean | null>(null)
  const [isNewUserForWelcome, setIsNewUserForWelcome] = useState(false)

  const triggerAssignAvatar = useCallback(() => {
    if (welcomeHandledRef.current) return
    welcomeHandledRef.current = true
    setWelcomeLoading(true)
    fetch('/api/user/assign-avatar', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.avatar) {
          setWelcomeData({ avatar: data.avatar, displayName: data.profile.display_name });
          if (data.profile?.display_name) {
            updateCachedDisplayName(data.profile.display_name);
          }
          if (data.avatar?.image_url) {
            updateCachedAvatarUrl(data.avatar.image_url);
          }
          setProfileVersion(v => v + 1);
        }
      })
      .catch(() => {})
      .finally(() => setWelcomeLoading(false));
  }, [])

  useEffect(() => {
    bootstrapIdentity().then((state) => {
      setIdentity(state);
      if (state.status === 'unauthenticated') {
        router.replace('/login?next=/home');
      }
    })
    return subscribeToIdentityChanges((state) => {
      setIdentity(state);
      if (state.status === 'unauthenticated') {
        router.replace('/login?next=/home');
        return;
      }
    });
  }, [router])

  // Reset the one-shot welcome guard whenever the authenticated player changes
  // so a different account in the same browser context gets its own onboarding.
  useEffect(() => {
    welcomeHandledRef.current = false
  }, [currentPlayerId])

  // GUEST-FIX-FIRSTVISIT-1031-005: one-shot resume for a brand-new guest whose
  // first Play Now was redirected to /home by a residual race (e.g. the
  // first-install SW reload). The marker is written by the landing page right
  // before navigating to /practice/<gameId>; it is removed on read and only
  // honored within 30s, for anonymous identities only — never for returning
  // guests or registered users.
  useEffect(() => {
    if (identity.status !== 'ready' || !identity.isAnonymous) return
    try {
      const raw = sessionStorage.getItem('gh_guest_launch')
      sessionStorage.removeItem('gh_guest_launch')
      if (!raw) return
      const { gameId, ts } = JSON.parse(raw) as { gameId?: string; ts?: number }
      if (gameId && typeof ts === 'number' && Date.now() - ts < 30000) {
        router.replace(`/practice/${gameId}`)
      }
    } catch {}
  }, [identity, router])

  // Trigger the welcome flow only when we know the persisted flag is false.
  // The profile fetch effect below is the single source of truth for welcome_completed.
  useEffect(() => {
    if (!isNewUserForWelcome) return
    if (welcomeCompleted === null) {
      setWelcomeLoading(true)
      return
    }
    if (welcomeCompleted) {
      setWelcomeLoading(false)
      return
    }
    if (welcomeHandledRef.current) return
    triggerAssignAvatar()
  }, [isNewUserForWelcome, welcomeCompleted, triggerAssignAvatar])

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
      setIsNewUserForWelcome(false)
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
        const session = await readSession()
        if (cancelled) return
        if (session?.user && session.user.id === pid) {
          const createdAt = new Date(session.user.created_at).getTime()
          const lastSignIn = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : createdAt
          // GUEST-BUILD-ANONSIGNIN-1029-003: anonymous guests never enter the
          // welcome/assign-avatar flow — welcome_completed must stay false
          // until after conversion.
          setIsNewUserForWelcome(!identity.isAnonymous && Math.abs(createdAt - lastSignIn) < 300_000)
        } else {
          setIsNewUserForWelcome(false)
        }
      } catch {
        setIsNewUserForWelcome(false)
      }
      try {
        const { data: stats } = await supabaseBrowser.from('player_global_stats').select('avg_accuracy,total_xp,rounds_played').eq('player_id', pid).single()
        if (cancelled) return
        if (stats) {
          setAccuracy(String(Math.round(Number(stats.avg_accuracy))))
          setXp(Number(stats.total_xp).toLocaleString('fr-FR'))
        }
      } catch {}
      try {
        const { data: profile } = await supabaseBrowser.from('profiles').select('display_name,avatar_url,welcome_completed,push_soft_ask_dismissed').eq('id', pid).single()
        if (cancelled) return
        if (profile) {
          setAvatarUrl(profile.avatar_url ?? null)
          setWelcomeCompleted(profile.welcome_completed ?? false)
          setPushSoftAskDismissed(profile.push_soft_ask_dismissed ?? true)
          if (profile.display_name) setInitials(profile.display_name.slice(0,2).toUpperCase())
          if (profile.display_name && (identity as { displayName?: string }).displayName !== profile.display_name) {
            updateCachedDisplayName(profile.display_name)
          }
          if (profile.avatar_url) {
            updateCachedAvatarUrl(profile.avatar_url)
          }
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
  const [guestGateOpen, setGuestGateOpen] = useState(false)
  const handleGuestGate = useCallback(() => setGuestGateOpen(true), [])
  const [practiceModalOpen, setPracticeModalOpen] = useState(false)
  const [resumeModalOpen, setResumeModalOpen] = useState(false)
  const [resumeGameId, setResumeGameId] = useState<string | null>(null)
  const [practiceTileLoading, setPracticeTileLoading] = useState(false)
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

  const handlePracticeStart = (settings: PracticeModalSettings) => {
    savePracticeSettings(settings)
    if (currentPlayerId && typeof window !== 'undefined') {
      localStorage.removeItem(`gh_practice_game_${currentPlayerId}`)
    }
    router.push('/practice')
  }

  const handlePracticeTileClick = async () => {
    if (!currentPlayerId) return
    if (typeof window === 'undefined') {
      setPracticeModalOpen(true)
      return
    }
    const storageKey = `gh_practice_game_${currentPlayerId}`
    const storedGameId = localStorage.getItem(storageKey)
    if (!storedGameId) {
      setPracticeModalOpen(true)
      return
    }
    setPracticeTileLoading(true)
    try {
      const res = await fetch(`/api/compete/${storedGameId}?playerId=${currentPlayerId}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (data && data.status && data.status !== 'SESSION_COMPLETE') {
          setResumeGameId(storedGameId)
          setResumeModalOpen(true)
          return
        }
      }
      localStorage.removeItem(storageKey)
      setPracticeModalOpen(true)
    } catch {
      localStorage.removeItem(storageKey)
      setPracticeModalOpen(true)
    } finally {
      setPracticeTileLoading(false)
    }
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

  // Keyed lookup so React MOVES the card DOM nodes when the order changes
  // (no remount → no state loss, no refetch). Desktop (>= 1024px) keeps the
  // fixed order; single-column uses the settled signal-based order.
  const homeCards = {
    journey: <JourneyCard key="journey" playerId={playerId} onOrderSignal={reportJourney} />,
    challenge: (
      <ChallengeCard
        key="challenge"
        playerId={playerId}
        displayName={displayName}
        onLobby={(gameId) => router.push(`/compete/${gameId}`)}
        onOrderSignal={reportChallenge}
        onGuestGate={handleGuestGate}
      />
    ),
    daily: <DailyCard key="daily" playerId={playerId} onOrderSignal={reportDaily} onGuestGate={handleGuestGate} />,
    practice: (
      <PracticeCard
        key="practice"
        playerId={playerId}
        onCtaClick={handlePracticeTileClick}
        ctaLoading={practiceTileLoading}
        onGuestGate={handleGuestGate}
      />
    ),
  }
  const visibleHomeOrder = isMobileViewport ? homeCardOrder : HOME_CARD_DESKTOP_ORDER

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

      {/* Scrollable content area */}
      <div className={styles['page-scroll']}>
        <div className={styles['hv2-wrap']}>
          {/* Tagline */}
          <div className={styles.tagline}>
            {t('home.tagline')}
          </div>

          {/* Home v2 four-card grid — Journey / Challenge / Daily / Practice
              (port of prototype/home-v2; flex column on mobile, 7fr/5fr grid
              at >= 1024px) */}
          <div className={styles['hv2-grid']}>
            {visibleHomeOrder.map((id) => homeCards[id])}
          </div>
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
      {/* GUEST-BUILD-ANONSIGNIN-1029-003: PushSoftAsk never shows for
          anonymous guests; for registered users it is deferred until their
          first completed round — DB-derived via player_global_stats
          (rounds_played/total_xp), no localStorage, no new column. */}
      {welcomeData === null && pushSoftAskDismissed === false && !identity.isAnonymous && (
        <PushSoftAsk
          playerId={currentPlayerId ?? ''}
          pushSoftAskDismissed={pushSoftAskDismissed === false ? false : true}
          onDismissed={() => setPushSoftAskDismissed(true)}
        />
      )}
      <PracticeSettingsModal
        isOpen={practiceModalOpen}
        onClose={() => setPracticeModalOpen(false)}
        onStart={handlePracticeStart}
        initialSettings={loadPracticeSettings()}
      />
      {/* GUEST-BUILD-ANONSIGNIN-1029-003: one shared conversion modal for the
          Daily/Challenge/Practice card guest gates (JourneyCard keeps its
          own stage-aware instance). */}
      <GuestConversionModal
        isOpen={guestGateOpen}
        stageNumber={2}
        onClose={() => setGuestGateOpen(false)}
        onConverted={() => setGuestGateOpen(false)}
      />
      <PracticeResumeModal
        isOpen={resumeModalOpen}
        onClose={() => setResumeModalOpen(false)}
        onResume={() => {
          setResumeModalOpen(false)
          if (resumeGameId) router.push(`/practice/${resumeGameId}`)
        }}
        onCreateNew={() => {
          setResumeModalOpen(false)
          if (currentPlayerId && typeof window !== 'undefined' && resumeGameId) {
            localStorage.removeItem(`gh_practice_game_${currentPlayerId}`)
          }
          setPracticeModalOpen(true)
        }}
      />
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
