'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useIdentity } from '@/hooks/useIdentity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import pageStyles from './page.module.css'

const STORAGE_KEY = 'practice_settings'

type PracticeSettings = {
  roundTimerSec: number
  yearMin: number
  yearMax: number
}

function loadSettings(): PracticeSettings {
  if (typeof window === 'undefined') {
    return { roundTimerSec: 0, yearMin: -100, yearMax: new Date().getFullYear() }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PracticeSettings>
      return {
        roundTimerSec: typeof parsed.roundTimerSec === 'number' ? parsed.roundTimerSec : 0,
        yearMin: typeof parsed.yearMin === 'number' ? parsed.yearMin : -100,
        yearMax: typeof parsed.yearMax === 'number' ? parsed.yearMax : new Date().getFullYear(),
      }
    }
  } catch { /* ignore */ }
  return { roundTimerSec: 0, yearMin: -100, yearMax: new Date().getFullYear() }
}

export default function PracticeEntryPage() {
  const router = useRouter()
  const t = useTranslations('game')
  const { playerId, displayName, isLoading: identityLoading, error: identityError } = useIdentity()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (identityLoading || identityError || !playerId || creating) return

    let cancelled = false
    setCreating(true)

    ;(async () => {
      try {
        const settings = loadSettings()

        const { data: { session } } = await supabaseBrowser.auth.getSession()
        const accessToken = session?.access_token
        if (!accessToken) {
          setError('Not authenticated')
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
            yearMin: settings.yearMin,
            yearMax: settings.yearMax,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to create practice session')
        }

        const snapshot = await response.json()
        if (cancelled) return

        const gameId = snapshot.gameId
        if (!gameId) throw new Error('No gameId in response')

        router.replace(`/practice/${gameId}`)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to start practice')
      } finally {
        if (!cancelled) setCreating(false)
      }
    })()

    return () => { cancelled = true }
  }, [playerId, displayName, identityLoading, identityError, router, creating])

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
            Back to Home
          </button>
        )}
      </div>
    </div>
  )
}
