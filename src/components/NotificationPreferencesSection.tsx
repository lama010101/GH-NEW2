'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import {
  USER_CONFIGURABLE_NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_CHANNEL,
  type NotificationType,
  type NotificationChannel,
} from '@/core/notificationTypes'
import styles from './NotificationPreferencesSection.module.css'

type Prefs = Record<string, NotificationChannel>

export default function NotificationPreferencesSection() {
  const t = useTranslations('account')
  const tCommon = useTranslations('common')
  const { isSupported, permission, isSubscribed, isLoading: pushLoading } = usePushNotifications()
  const pushEnabled = isSupported && permission === 'granted' && isSubscribed

  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [pendingType, setPendingType] = useState<NotificationType | null>(null)
  const [errorType, setErrorType] = useState<NotificationType | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/user/notification-preferences')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.preferences) return
        const next: Prefs = {}
        for (const row of data.preferences as { type: string; channel: NotificationChannel }[]) {
          next[row.type] = row.channel
        }
        setPrefs(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (type: NotificationType, channel: NotificationChannel) => {
    if (!prefs || pendingType !== null) return
    const previous = prefs[type] ?? DEFAULT_NOTIFICATION_CHANNEL
    if (previous === channel) return
    setErrorType(null)
    setPrefs({ ...prefs, [type]: channel })
    setPendingType(type)
    fetch('/api/user/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, channel }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`save failed: ${res.status}`)
      })
      .catch(() => {
        setPrefs((p) => (p ? { ...p, [type]: previous } : p))
        setErrorType(type)
      })
      .finally(() => setPendingType(null))
  }

  return (
    <div className={styles.card}>
      <div className={styles.title}>{t('notif_prefs')}</div>
      {prefs === null ? (
        <div className={styles.muted}>{tCommon('loading_ellipsis')}</div>
      ) : (
        USER_CONFIGURABLE_NOTIFICATION_TYPES.map((type) => {
          const channel = prefs[type] ?? DEFAULT_NOTIFICATION_CHANNEL
          const wantsPush = channel === 'push' || channel === 'both'
          return (
            <fieldset key={type} className={styles.prefRow} disabled={pendingType === type}>
              <legend className={styles.prefLabel}>{t(`notif_prefs_${type}`)}</legend>
              <div className={styles.options} role="radiogroup" aria-label={t(`notif_prefs_${type}`)}>
                {NOTIFICATION_CHANNELS.map((ch) => {
                  const id = `notif-pref-${type}-${ch}`
                  return (
                    <label key={ch} className={styles.option} htmlFor={id}>
                      <input
                        id={id}
                        type="radio"
                        name={`notif-pref-${type}`}
                        className={styles.radio}
                        checked={channel === ch}
                        disabled={pendingType === type}
                        onChange={() => handleChange(type, ch)}
                      />
                      <span className={styles.pill}>{t(`notif_channel_${ch}`)}</span>
                    </label>
                  )
                })}
              </div>
              {wantsPush && !pushLoading && !pushEnabled && (
                <div className={styles.hint}>{t('notif_push_hint')}</div>
              )}
              {errorType === type && (
                <div className={styles.error} role="alert">{t('notif_save_error')}</div>
              )}
            </fieldset>
          )
        })
      )}
    </div>
  )
}
