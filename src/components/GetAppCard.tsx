'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ANDROID_APK_URL } from '@/core/appLinks'
import { isIOsSafariNonPwa } from '@/core/relaxPwaInterstitial'
import styles from './GetAppCard.module.css'

export const GET_APP_CARD_DISMISSED_KEY = 'gh_get_app_card_dismissed'

export type GetAppPlatform = 'android' | 'ios' | null

/** Pure detection; call only after mount (reads window/navigator). */
export function detectGetAppPlatform(): GetAppPlatform {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  if (standalone) return null
  const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (capacitor?.isNativePlatform?.()) return null
  if (/Android/i.test(navigator.userAgent)) return 'android'
  if (isIOsSafariNonPwa()) return 'ios'
  return null
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(GET_APP_CARD_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(GET_APP_CARD_DISMISSED_KEY, '1')
  } catch {
    // storage unavailable — card simply reappears next load
  }
}

/**
 * "Get the app" card: Android APK download or iOS Add-to-Home-Screen steps.
 * Renders nothing on the server, on desktop, or inside the installed app.
 */
export default function GetAppCard({
  suppress = false,
  style,
}: {
  suppress?: boolean
  style?: CSSProperties
}) {
  const t = useTranslations('account')
  const tPwa = useTranslations('pwa')
  const tLobby = useTranslations('lobby')
  const tNav = useTranslations('nav')
  const [platform, setPlatform] = useState<GetAppPlatform>(null)
  const [dismissed, setDismissed] = useState(false)

  // Post-mount only: avoids SSR/hydration mismatch.
  useEffect(() => {
    setDismissed(readDismissed())
    setPlatform(detectGetAppPlatform())
  }, [])

  if (suppress || dismissed || platform === null) return null

  const strong = (chunks: ReactNode) => <strong>{chunks}</strong>

  const handleDismiss = () => {
    writeDismissed()
    setDismissed(true)
  }

  return (
    <section className={styles.card} style={style} data-testid="get-app-card" data-platform={platform}>
      <button
        type="button"
        className={styles.closeButton}
        onClick={handleDismiss}
        aria-label={tNav('close')}
      >
        ×
      </button>
      {platform === 'android' ? (
        <>
          <h2 className={styles.title}>{t('android_apk_title')}</h2>
          <p className={styles.body}>{t('android_apk_body')}</p>
          <a href={ANDROID_APK_URL} download className={styles.button}>
            {t('android_apk_button')}
          </a>
          <div className={styles.stepLine}>
            <div>{t('android_apk_step1')}</div>
            <div>{t('android_apk_step2')}</div>
            <div>{t('android_apk_step3')}</div>
          </div>
          <div className={styles.note}>{t('android_apk_note')}</div>
        </>
      ) : (
        <>
          <h2 className={styles.title}>{tPwa('install_app')}</h2>
          <p className={styles.body}>{tPwa.rich('ios_intro', { strong })}</p>
          <ol className={styles.steps}>
            <li>{tLobby.rich('pwa_step_share', { strong })}</li>
            <li>{tLobby.rich('pwa_step_home', { strong })}</li>
            <li>{tLobby.rich('pwa_step_open', { strong })}</li>
          </ol>
        </>
      )}
    </section>
  )
}
