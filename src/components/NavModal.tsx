'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import styles from './NavModal.module.css'
import { ThemeToggle } from './layout/ThemeToggle'

interface NavModalProps {
  isOpen: boolean
  onClose: () => void
  avatarUrl: string | null
  initials: string
  displayName: string
}

export function NavModal({ isOpen, onClose, avatarUrl, initials, displayName }: NavModalProps) {
  const router = useRouter()
  const t = useTranslations('nav')

  const [locale, setLocaleState] = React.useState<'en' | 'fr'>(() => {
    if (typeof document === 'undefined') return 'en'
    const match = document.cookie.split(';').find(c => c.trim().startsWith('gh_locale='))
    const val = match?.split('=')[1]?.trim()
    return val === 'fr' ? 'fr' : 'en'
  })

  const handleLocale = (l: 'en' | 'fr') => {
    setLocaleState(l)
    import('@/actions/setLocale').then(m => m.setLocale(l))
  }

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const navigate = (path: string) => {
    onClose()
    router.push(path)
  }

  const ITEMS = [
    { id: 'home',         label: t('home'),          icon: HOME_ICON,          action: () => navigate('/') },
    { id: 'leaderboard',  label: t('leaderboard'),   icon: LEADERBOARD_ICON,   action: () => navigate('/leaderboard') },
    { id: 'profile_stats',label: t('profile_stats'), icon: PROFILE_ICON,       action: () => navigate('/progress') },
    { id: 'account',      label: t('account'),       icon: ACCOUNT_ICON,       action: () => navigate('/account') },
    { id: 'help',         label: t('help'),           icon: HELP_ICON,          action: () => navigate('/help') },
  ]

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />

      <button
        onClick={onClose}
        className={styles.closeBtn}
        aria-label={t('close')}
      >✕</button>

      <div className={styles.panel}>

        <div className={styles.avatarSection}>
          <div className={styles.avatarRing}>
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="" className={styles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
              : null
            }
            <span className={styles.avatarInitials} style={{ display: avatarUrl ? "none" : "inline" }}>{initials.slice(0, 2)}</span>
          </div>
          <span className={styles.displayName}>{displayName}</span>
        </div>

        <div className={styles.divider} />

        {ITEMS.map(({ id, label, icon, action }) => (
          <button
            key={id}
            onClick={action}
            className={`${styles.menuItem} ${id === 'home' ? styles.menuItemHome : ""}`}
          >
            <span className={id === 'home' ? styles.menuItemIconHome : styles.menuItemIcon}>
              {icon}
            </span>
            {label}
          </button>
        ))}

        <div className={`${styles.menuItem} ${styles.navCursorDefault}`}>
          <span className={styles.menuItemIcon}>
            {LANGUAGE_ICON}
          </span>
          {t('language')}
          <span className={styles.navLangToggle}>
            <button
              onClick={() => handleLocale('en')}
              className={`${styles.navLangOption} ${locale === 'en' ? styles.navLangOptionActive : ''}`}
            >EN</button>
            <button
              onClick={() => handleLocale('fr')}
              className={`${styles.navLangOption} ${locale === 'fr' ? styles.navLangOptionActive : ''}`}
            >FR</button>
          </span>
        </div>

        <div className={`${styles.menuItem} ${styles.navCursorDefault}`}>
          <span className={styles.menuItemIcon}>
            {THEME_ICON}
          </span>
          {t('theme')}
          <ThemeToggle />
        </div>

        <div className={styles.dividerBottom} />

        <button
          className={styles.signOutBtn}
          onClick={async () => {
            const { signOut } = await import('@/core/identity')
            await signOut()
            onClose()
          }}
        >
          <span className={styles.signOutIcon}>{SIGNOUT_ICON}</span>
          {t('sign_out')}
        </button>

      </div>
    </>
  )
}

/* ── SVG icon constants ── */

const HOME_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3L2 12h3v9h6v-6h2v6h6v-9h3L12 3z"/>
  </svg>
)

const LEADERBOARD_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="4"/><path d="M8 12l-5 8h18l-5-8"/>
  </svg>
)

const PROFILE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)

const ACCOUNT_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="4"/><circle cx="12" cy="8" r="1" fill="currentColor"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    <circle cx="19" cy="5" r="3" stroke="currentColor"/>
    <path d="M19 4v2m-1-1h2" strokeLinecap="round"/>
  </svg>
)

const HELP_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5"/>
  </svg>
)

const SIGNOUT_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

const LANGUAGE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)

const THEME_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>
)
