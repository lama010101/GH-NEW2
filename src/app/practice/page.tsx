'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useIdentity } from '@/hooks/useIdentity'
import { readSession } from '@/core/supabaseBrowser'
import { forceClearAuthStorage, bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity'
import { loadPracticeSettings } from '@/components/practice/practiceSettings'
import pageStyles from './page.module.css'

export default function PracticeEntryPage() {
  const router = useRouter()
  const t = useTranslations('game')
  const tCommon = useTranslations('common')
  const { playerId, displayName, isLoading: identityLoading, error: identityError } = useIdentity()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showLoadingTimeout, setShowLoadingTimeout] = useState(false)
  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' })

  const handleForceClear = () => {
    forceClearAuthStorage()
    window.location.replace('/login')
  }

  const handleIdentityRetry = () => {
    setIdentity({ status: 'loading' })
    bootstrapIdentity().then(setIdentity)
  }

  // Identity state management for escape hatch
  useEffect(() => {
    let mounted = true;
    bootstrapIdentity().then(state => {
      if (mounted) setIdentity(state);
    });
    const unsubscribe = subscribeToIdentityChanges(state => {
      if (mounted) setIdentity(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Show escape hatch after 10s of continuous loading
  useEffect(() => {
    if (identity.status === 'ready') {
      setShowLoadingTimeout(false)
      return
    }
    const timer = setTimeout(() => setShowLoadingTimeout(true), 10000)
    return () => clearTimeout(timer)
  }, [identity.status])

  useEffect(() => {
    if (identityLoading || identityError || !playerId || creating) return

    let cancelled = false
    setCreating(true)

    const storageKey = `gh_practice_game_${playerId}`

    ;(async () => {
      // Try to resume an existing practice game before creating a new one.
      // This prevents refresh of /practice from silently discarding an
      // in-progress game.
      try {
        const storedGameId = typeof window !== 'undefined'
          ? localStorage.getItem(storageKey)
          : null
        if (storedGameId) {
          const resumeRes = await fetch(`/api/compete/${storedGameId}?playerId=${playerId}`, { cache: 'no-store' })
          if (resumeRes.ok) {
            const resumeSnap = await resumeRes.json()
            if (cancelled) return
            // Only resume if the game is still in a playable phase.
            if (resumeSnap && resumeSnap.status && resumeSnap.status !== 'SESSION_COMPLETE') {
              router.replace(`/practice/${storedGameId}`)
              return
            }
          }
          // Snapshot missing or complete — clear stale entry and fall through.
          if (typeof window !== 'undefined') localStorage.removeItem(storageKey)
        }
      } catch {
        // Resume check failed (network, etc.) — fall through to create new.
      }

      try {
        const settings = loadPracticeSettings()

        const session = await readSession()
        const accessToken = session?.access_token
        if (!accessToken) {
          setError(t('not_authenticated'))
          return
        }

        const response = await fetch('/api/practice/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            playerId,
            displayName: displayName ?? undefined,
            roundTimerSec: settings.roundTimerSec,
            selectedRegions: settings.selectedRegions,
            yearMin: settings.yearMin,
            yearMax: settings.yearMax,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error ?? t('failed_create_practice'))
        }

        const snapshot = await response.json()
        if (cancelled) return

        const gameId = snapshot.gameId
        if (!gameId) throw new Error(t('no_game_id_response'))

        if (typeof window !== 'undefined') localStorage.setItem(storageKey, gameId)
        router.replace(`/practice/${gameId}`)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('failed_start_practice'))
      } finally {
        if (!cancelled) setCreating(false)
      }
    })()

    return () => { cancelled = true }
  }, [playerId, displayName, identityLoading, identityError, router, creating, t])

  return (
    <div className={pageStyles.loadingScreen}>
      <div className={pageStyles.loadingBg} aria-hidden="true" />
      <div className={pageStyles.loadingScrim} aria-hidden="true" />
      <div className={pageStyles.loadingContent}>
        <div className={pageStyles.loadingSpinner} />
        <span className={pageStyles.loadingLabel}>
          {identityError ? t('identity_error') : error ?? t('loading_game')}
        </span>
        {error && (
          <button
            onClick={() => router.push('/home')}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              color: 'white',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 'var(--font-sm)',
            }}
          >
            {tCommon('back_to_home')}
          </button>
        )}
        {identity.status === 'error' && (
          <>
            <button
              type="button"
              onClick={handleIdentityRetry}
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
          </>
        )}
        {identity.status !== 'ready' && identity.status !== 'error' && showLoadingTimeout && (
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
