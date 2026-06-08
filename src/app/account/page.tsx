'use client'

import { DM_Sans } from 'next/font/google'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useIdentity } from '@/hooks/useIdentity'
import { signOut } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import styles from './account.module.css'
import TopBar from '@/components/layout/TopBar'

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
  const { playerId } = useIdentity()
  const t = useTranslations('account')

  const [accuracy, setAccuracy] = useState('--')
  const [xp, setXp] = useState('--')
  const [displayName, setDisplayName] = useState<string>('')
  const [savedName, setSavedName] = useState<string>('')
  const [email, setEmail] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [avatarInfo, setAvatarInfo] = useState<AvatarInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (!playerId) return

    const load = async () => {
      const { data: profile } = await supabaseBrowser
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', playerId)
        .single()

      const { data: sessionData } = await supabaseBrowser.auth.getSession()
      const userEmail = sessionData.session?.user?.email ?? null
      const userCreatedAt = sessionData.session?.user?.created_at ?? null

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
            bornLabel: bornParts.length ? `Born: ${bornParts.join(', ')}` : '',
            diedLabel: diedParts.length ? `Died: ${diedParts.join(', ')}` : '',
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
  }, [playerId])

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
    await signOut()
    router.push('/')
  }

  const getInitials = (name: string): string => {
    if (!name) return '??'
    const words = name.trim().split(/\s+/)
    return words.map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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
        onAvatarClick={() => {}}
      />

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

      {/* Settings card */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsCard}>
          {/* Row 1 — Display name */}
          <div>
            <div className={styles.fieldLabel}>{t('username')}</div>
            <input
              type="text"
              value={displayName}
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
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saveResult === 'success' && (
              <div className={styles.saveFeedbackSuccess}>✓ Saved</div>
            )}
            {saveResult === 'error' && (
              <div className={styles.saveFeedbackError}>Failed to save. Try again.</div>
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

      {/* Sign out */}
      <div className={styles.signOutSection}>
        <button
          onClick={handleSignOut}
          className={styles.signOutBtn}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
