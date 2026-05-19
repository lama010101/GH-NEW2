'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
    { label: 'Leaderboard',     icon: LEADERBOARD_ICON,   action: () => comingSoon('Leaderboard') },
    { label: 'Profile & Stats', icon: PROFILE_ICON,       action: () => navigate('/progress') },
    { label: 'Account',         icon: ACCOUNT_ICON,       action: () => navigate('/account') },
    { label: 'Help',            icon: HELP_ICON,          action: () => comingSoon('Help') },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Modal panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1001,
        width: 'min(340px, 90vw)',
        background: '#111',
        borderRadius: 18,
        padding: '28px 0 8px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#f97316', fontSize: 22, lineHeight: 1, padding: 4,
          }}
          aria-label="Close"
        >✕</button>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
            border: '2.5px solid rgba(180,140,255,0.6)',
            background: 'linear-gradient(135deg,#c45,#89b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: '#fff', fontSize: 26, fontWeight: 700 }}>{initials.slice(0, 2)}</span>
            }
          </div>
          <span style={{ color: '#c084fc', fontSize: 17, fontWeight: 600 }}>{displayName}</span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 0 6px' }} />

        {/* Menu items */}
        {ITEMS.map(({ label, icon, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              width: '100%', padding: '14px 24px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#fff', fontSize: 16, fontWeight: 400,
              textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ opacity: 0.75, flexShrink: 0 }}>{icon}</span>
            {label}
          </button>
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

        {/* Sign out */}
        <button
          onClick={async () => {
            const sb = (await import('@/core/supabaseBrowser')).supabaseBrowser
            await sb.auth.signOut()
            onClose()
            router.push('/')
            router.refresh()
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            width: '100%', padding: '14px 24px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#ef4444', fontSize: 16, fontWeight: 500,
            textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ opacity: 0.85, flexShrink: 0 }}>{SIGNOUT_ICON}</span>
          Sign Out
        </button>

      </div>
    </>
  )
}

/* ── SVG icon constants ── */

const HOME_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
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
