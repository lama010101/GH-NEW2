'use client'

import { DM_Sans } from 'next/font/google'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIdentity } from '@/hooks/useIdentity'
import { signOut } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'

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
    const words = name.trim().split(/\s+/)
    return words.map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const isSaveDisabled = displayName.trim() === savedName.trim() || saving

  return (
    <div className={dmSans.className} style={{ minHeight: '100vh', background: '#0f0e0c', color: '#f5f0e8' }}>

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#0f0e0c',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f5f0e8', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ fontSize: 18 }}>←</span> Back
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Account</span>
        <div style={{ width: 60 }} />
      </div>

      {/* Avatar card */}
      {avatarInfo && (
        <div style={{ maxWidth: 400, margin: '24px auto 0', padding: '0 20px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 16,
            padding: 20,
            textAlign: 'center',
          }}>
            {avatarInfo.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarInfo.imageUrl}
                alt={avatarInfo.name}
                style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.15)', margin: '0 auto 12px' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div style={{ width: 96, height: 96, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 32, fontWeight: 700, background: 'rgba(255,255,255,0.08)' }}>
                {getInitials(avatarInfo.name)}
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f5f0e8', marginBottom: 6 }}>{avatarInfo.name}</div>
            {avatarInfo.description && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {avatarInfo.description}
              </div>
            )}
            {avatarInfo.bornLabel && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{avatarInfo.bornLabel}</div>
            )}
            {avatarInfo.diedLabel && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{avatarInfo.diedLabel}</div>
            )}
          </div>
        </div>
      )}

      {/* Settings card */}
      <div style={{ maxWidth: 400, margin: '16px auto 0', padding: '0 20px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* Row 1 — Display name */}
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Username</div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#f5f0e8',
                fontSize: 15,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSave}
              disabled={isSaveDisabled}
              style={{
                marginTop: 10,
                width: '100%',
                background: isSaveDisabled ? 'rgba(251,146,60,0.4)' : '#fb923c',
                color: '#0f0e0c',
                fontWeight: 700,
                borderRadius: 8,
                padding: 10,
                border: 'none',
                fontSize: 15,
                cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saveResult === 'success' && (
              <div style={{ marginTop: 6, fontSize: 13, color: '#22c55e' }}>✓ Saved</div>
            )}
            {saveResult === 'error' && (
              <div style={{ marginTop: 6, fontSize: 13, color: '#ef4444' }}>Failed to save. Try again.</div>
            )}
          </div>

          {/* Row 2 — Email */}
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Email</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{email ?? '—'}</div>
          </div>

          {/* Row 3 — Member since */}
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Member since</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>{formatDate(createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div style={{ maxWidth: 400, margin: '12px auto 0', padding: '0 20px 40px' }}>
        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            background: 'rgba(239,68,68,0.12)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            padding: 14,
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
