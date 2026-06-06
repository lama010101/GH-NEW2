'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './NavModal.module.css'

interface NavModalProps {
  isOpen: boolean
  onClose: () => void
  avatarUrl: string | null
  initials: string
  displayName: string
}

export function NavModal({ isOpen, onClose, avatarUrl, initials, displayName }: NavModalProps) {
  const router = useRouter()

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

  const comingSoon = (label: string) => {
    alert(`${label} — coming soon!`)
  }

  const ITEMS = [
    { label: 'Home',            icon: HOME_ICON,          action: () => navigate('/') },
    { label: 'Friends',         icon: FRIENDS_ICON,       action: () => comingSoon('Friends') },
    { label: 'Leaderboard',     icon: LEADERBOARD_ICON,   action: () => navigate('/leaderboard') },
    { label: 'Profile & Stats', icon: PROFILE_ICON,       action: () => navigate('/progress') },
    { label: 'Account',         icon: ACCOUNT_ICON,       action: () => navigate('/account') },
    { label: 'Help',            icon: HELP_ICON,          action: () => comingSoon('Help') },
  ]

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />

      <button
        onClick={onClose}
        className={styles.closeBtn}
        aria-label="Close"
      >✕</button>

      <div className={styles.panel}>

        <div className={styles.avatarSection}>
          <div className={styles.avatarRing}>
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="" className={styles.avatarImg} />
              : <span className={styles.avatarInitials}>{initials.slice(0, 2)}</span>
            }
          </div>
          <span className={styles.displayName}>{displayName}</span>
        </div>

        <div className={styles.divider} />

        {ITEMS.map(({ label, icon, action }) => (
          <button
            key={label}
            onClick={action}
            className={`${styles.menuItem} ${label === 'Home' ? styles.menuItemHome : ""}`}
          >
            <span className={label === 'Home' ? styles.menuItemIconHome : styles.menuItemIcon}>
              {icon}
            </span>
            {label}
          </button>
        ))}

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
          Sign Out
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

const FRIENDS_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
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
