'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity'
import { CompetePanel } from '@/components/home/CompetePanel'
import styles from './page.module.css'

export default function CompeteAllPage() {
  const router = useRouter()
  const t = useTranslations()
  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' })

  useEffect(() => {
    bootstrapIdentity().then(setIdentity)
    const unsub = subscribeToIdentityChanges(setIdentity)
    return unsub
  }, [])

  const playerId = (identity as { status: string; playerId?: string }).playerId

  if (identity.status === 'loading') {
    return (
      <main className={styles.shell}>
        <div className={styles.loading}>{t('home.compete_loading_invites')}</div>
      </main>
    )
  }

  if (identity.status === 'error' || !playerId) {
    router.push('/home')
    return null
  }

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => router.push('/home')}
          aria-label={t('common.home')}
        >
          ←
        </button>
        <h1 className={styles.title}>{t('home.compete_all_title')}</h1>
      </div>
      <CompetePanel onLobby={(gameId) => router.push(`/compete/${gameId}`)} playerId={playerId} />
    </main>
  )
}
