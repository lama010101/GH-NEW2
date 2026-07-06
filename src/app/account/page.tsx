'use client'

import { DM_Sans } from 'next/font/google'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useIdentity } from '@/hooks/useIdentity'
import { signOut } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import styles from './account.module.css'
import TopBar from '@/components/layout/TopBar'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { LanguageDropdown } from '@/components/layout/LanguageDropdown'
import { NavModal } from '@/components/NavModal'
import RankCard from '@/components/RankCard'
import { useRankOpen } from '@/hooks/useRankOpen'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500'] })

type AvatarInfo = {
  name: string
  description: string
  bornLabel: string
  diedLabel: string
  imageUrl: string
}

export default function AccountPage() {
  const router = useRouter()
  const { playerId, isLoading, displayName: identityDisplayName } = useIdentity()
  const t = useTranslations('account')
  const tNav = useTranslations('nav')
  const tCommon = useTranslations('common')
  const locale = useLocale()

  const [rankOpen, toggleRankOpen] = useRankOpen()

  const [accuracy, setAccuracy] = useState('--')
  const [xp, setXp] = useState('--')
  const [displayName, setDisplayName] = useState<string>('')
  const [savedName, setSavedName] = useState<string>('')
  const [email, setEmail] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle')
  const [avatarInfo, setAvatarInfo] = useState<AvatarInfo | null>(null)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [showNavModal, setShowNavModal] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gh_sound')
      return saved !== null ? saved === 'true' : true
    }
    return true
  })
  const [vibrateEnabled, setVibrateEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gh_vibrate')
      return saved !== null ? saved === 'true' : true
    }
    return true
  })

  // Persist sound/vibrate settings to localStorage (same keys as in-game settings)
  useEffect(() => {
    localStorage.setItem('gh_sound', String(soundEnabled))
  }, [soundEnabled])

  useEffect(() => {
    localStorage.setItem('gh_vibrate', String(vibrateEnabled))
  }, [vibrateEnabled])

  // Fetch email/createdAt directly from supabaseBrowser.auth.getUser()
  // independently of useIdentity's isLoading — under cross-user sign-in,
  // useIdentity can stay in loading state for a long time, but the auth
  // session is already available via supabaseBrowser.
  useEffect(() => {
    const fetchAuth = async () => {
      const { data: { user: authUser } } = await supabaseBrowser.auth.getUser()
      if (authUser?.email) setEmail(authUser.email)
      if (authUser?.created_at) setCreatedAt(authUser.created_at)
    }
    fetchAuth().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (isLoading) return
    if (!playerId) {
      router.replace('/login')
      return
    }

    const load = async () => {
      const { data: profile } = await supabaseBrowser
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', playerId)
        .single()

      const { data: { user: authUser } } = await supabaseBrowser.auth.getUser()
      const userEmail = authUser?.email ?? null
      const userCreatedAt = authUser?.created_at ?? null

      const { data: stats } = await supabaseBrowser
        .from('player_global_stats')
        .select('avg_accuracy,total_xp')
        .eq('player_id', playerId)
        .single()

      if (stats) {
        setAccuracy(String(Math.round(Number(stats.avg_accuracy))))
        setXp(Number(stats.total_xp).toLocaleString('fr-FR'))
      }

      if (profile?.avatar_url) {
        let { data: av } = await supabaseBrowser
          .from('avatars')
          .select('first_name, last_name, description, birth_day, death_day, birth_city, birth_country, death_city, death_country')
          .eq('image_url', profile.avatar_url)
          .single()

        if (!av) {
          ;({ data: av } = await supabaseBrowser
            .from('avatars')
            .select('first_name, last_name, description, birth_day, death_day, birth_city, birth_country, death_city, death_country')
            .eq('firebase_url', profile.avatar_url)
            .single())
        }

        if (av) {
          const name = [av.first_name, av.last_name].filter(Boolean).join(' ')
          const bornParts = [av.birth_day, av.birth_city, av.birth_country].filter(Boolean)
          const diedParts = [av.death_day, av.death_city, av.death_country].filter(Boolean)
          setAvatarInfo({
            name,
            description: av.description ?? '',
            bornLabel: bornParts.length ? `${tCommon('born_prefix')} ${bornParts.join(', ')}` : '',
            diedLabel: diedParts.length ? `${tCommon('died_prefix')} ${diedParts.join(', ')}` : '',
            imageUrl: profile.avatar_url,
          })
        }
      }

      setDisplayName(profile?.display_name ?? '')
      setSavedName(profile?.display_name ?? '')
      setEmail(userEmail)
      setCreatedAt(userCreatedAt)
    }

    load().catch((err) => console.error('[account] load error:', err))
  }, [playerId, isLoading, router])

  const handleSave = async () => {
    if (!playerId || displayName.trim() === savedName.trim()) return
    setSaving(true)
    setSaveResult('idle')
    const { error } = await supabaseBrowser
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', playerId)
    setSaving(false)
    if (error) {
      setSaveResult('error')
    } else {
      setSavedName(displayName.trim())
      setSaveResult('success')
      setTimeout(() => setSaveResult('idle'), 2500)
    }
  }

  const handleSignOut = async () => {
    setSignOutError(null)
    try {
      await signOut()
      window.location.href = '/'
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : t('sign_out_failed'))
    }
  }

  const getInitials = (name: string): string => {
    if (!name) return '??'
    const words = name.trim().split(/\s+/)
    return words.map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const isSaveDisabled = displayName.trim() === savedName.trim() || saving

  return (
    <div className={`${dmSans.className} ${styles.page}`}>

      {/* Top bar */}
      <TopBar
        accuracy={accuracy}
        xp={xp}
        avatarUrl={avatarInfo?.imageUrl ?? null}
        initials={getInitials(displayName)}
        onAvatarClick={() => setShowNavModal(true)}
        rankOpen={rankOpen}
        onToggleRank={toggleRankOpen}
      />
      <RankCard totalXp={Number(xp.replace(/[^\d]/g, '')) || 0} open={rankOpen} />

      {/* Header — back button + title */}
      <div className={styles.header}>
        <button onClick={() => router.push('/home')} className={styles.backBtn}>
          <span className={styles.backArrow}>←</span>
          <span>{tCommon('home')}</span>
        </button>
        <h1 className={styles.title}>{t('title')}</h1>
        <div className={styles.headerSpacer} />
      </div>

      {/* Avatar card */}
      {avatarInfo && (
        <div className={styles.avatarSection}>
          <div className={styles.card}>
            {avatarInfo.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarInfo.imageUrl}
                alt={avatarInfo.name}
                className={styles.avatarImg}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className={styles.avatarInitials}>
                {getInitials(avatarInfo.name)}
              </div>
            )}
            <div className={styles.avatarName}>{avatarInfo.name}</div>
            {avatarInfo.description && (
              <div className={styles.avatarDescription}>
                {avatarInfo.description}
              </div>
            )}
            {avatarInfo.bornLabel && (
              <div className={styles.avatarMeta}>{avatarInfo.bornLabel}</div>
            )}
            {avatarInfo.diedLabel && (
              <div className={styles.avatarMetaLast}>{avatarInfo.diedLabel}</div>
            )}
          </div>
        </div>
      )}

      {/* Profile card — display name / email / member since */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsCard}>
          {/* Row 1 — Display name */}
          <div>
            <div className={styles.fieldLabel}>{t('username')}</div>
            <input
              type="text"
              value={displayName || identityDisplayName || ''}
              onChange={(e) => setDisplayName(e.target.value)}
              className={styles.input}
            />
            <button
              onClick={handleSave}
              disabled={isSaveDisabled}
              className={styles.saveBtn}
              style={{
                background: isSaveDisabled ? 'rgba(251,146,60,0.4)' : 'var(--gh-orange)',
                cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? t('saving') : t('save')}
            </button>
            {saveResult === 'success' && (
              <div className={styles.saveFeedbackSuccess}>{t('saved')}</div>
            )}
            {saveResult === 'error' && (
              <div className={styles.saveFeedbackError}>{t('err_save_failed')}</div>
            )}
          </div>

          {/* Row 2 — Email */}
          <div>
            <div className={styles.fieldLabelSmall}>{t('email')}</div>
            <div className={styles.fieldValueItalic}>{email ?? '—'}</div>
          </div>

          {/* Row 3 — Member since */}
          <div>
            <div className={styles.fieldLabelSmall}>{t('member_since')}</div>
            <div className={styles.fieldValue}>{formatDate(createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Preferences card — sound / vibrate / theme / language */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>{t('settings')}</div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>{t('sound')}</span>
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={styles.toggle}
              style={{
                '--toggle-bg': soundEnabled ? 'var(--gh-orange)' : 'rgba(255, 255, 255, 0.15)',
                '--toggle-left': soundEnabled ? '22px' : '2px',
              } as React.CSSProperties}
            >
              <div className={styles.toggleKnob} />
            </button>
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>{t('vibrate')}</span>
            <button
              type="button"
              onClick={() => setVibrateEnabled(!vibrateEnabled)}
              className={styles.toggle}
              style={{
                '--toggle-bg': vibrateEnabled ? 'var(--gh-orange)' : 'rgba(255, 255, 255, 0.15)',
                '--toggle-left': vibrateEnabled ? '22px' : '2px',
              } as React.CSSProperties}
            >
              <div className={styles.toggleKnob} />
            </button>
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>{tNav('theme')}</span>
            <ThemeToggle />
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>{tNav('language')}</span>
            <div className={styles.langDropdown}>
              <LanguageDropdown />
            </div>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div className={styles.signOutSection}>
        {signOutError && (
          <div className={styles.saveFeedbackError}>{signOutError}</div>
        )}
        <button
          onClick={handleSignOut}
          className={styles.signOutBtn}
        >
          {tNav('sign_out')}
        </button>
      </div>

      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={avatarInfo?.imageUrl ?? null}
        initials={getInitials(displayName)}
        displayName={displayName || getInitials(displayName)}
      />
    </div>
  )
}
