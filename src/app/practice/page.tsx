'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useIdentity } from '@/hooks/useIdentity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { loadPracticeSettings } from '@/components/practice/practiceSettings'
import pageStyles from './page.module.css'

export default function PracticeEntryPage() {
  const router = useRouter()
  const t = useTranslations('game')
  const tCommon = useTranslations('common')
  const { playerId, displayName, isLoading: identityLoading, error: identityError } = useIdentity()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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

        const { data: { session } } = await supabaseBrowser.auth.getSession()
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
              fontSize: '14px',
            }}
          >
            {tCommon('back_to_home')}
          </button>
        )}
      </div>
    </div>
  )
}
