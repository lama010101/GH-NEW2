'use client'

import { useState, useEffect } from 'react'
import styles from '@/app/home.module.css'
import { supabaseBrowser } from '@/core/supabaseBrowser'

export function CompetePanel({ onLobby, playerId, displayName, onRequireAuth }: {
  onLobby: (gameId: string) => void
  playerId: string
  displayName: string
  onRequireAuth: () => void
}) {
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [invites, setInvites] = useState<Array<{
    id: string
    game_id: string
    inviter_id: string
    inviter_name: string
    avatar_url?: string
    created_at: string
    expires_at: string
  }>>([])
  const [invitesLoading, setInvitesLoading] = useState(true)

  const fetchInvites = async () => {
    if (!playerId) {
      setInvites([])
      setInvitesLoading(false)
      return
    }
    try {
      const res = await fetch('/api/invitations/pending')
      if (!res.ok) {
        setInvites([])
        setInvitesLoading(false)
        return
      }
      const { invitations } = await res.json()
      setInvites(invitations ?? [])
      setInvitesLoading(false)
    } catch (e) {
      setInvites([])
      setInvitesLoading(false)
    }
  }

  useEffect(() => {
    if (!playerId) {
      setInvitesLoading(false)
      return
    }

    fetchInvites()

    const channel = supabaseBrowser
      .channel('pending-invites-' + playerId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_invitations',
          filter: `invitee_id=eq.${playerId}`,
        },
        () => { fetchInvites() }
      )
      .subscribe()

    return () => { supabaseBrowser.removeChannel(channel) }
  }, [playerId])

  const handleCreate = async () => {
    if (!playerId) { onRequireAuth(); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compete/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          displayName,
          mode: 'sync',
          roundTimerSec: 120,
          totalRounds: 5,
          yearMin: -100,
          yearMax: 2025,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      onLobby(data.gameId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating game')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!playerId) { onRequireAuth(); return }
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compete/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Room not found')
      onLobby(data.gameId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Room not found')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinClick = () => {
    if (!showJoinInput) {
      setShowJoinInput(true)
      return
    }
    handleJoin()
  }

  const handleAccept = async (inviteId: string, gameId: string) => {
    await supabaseBrowser
      .from('game_invitations')
      .update({ status: 'accepted' })
      .eq('id', inviteId)
    onLobby(gameId)
  }

  const handleDecline = async (inviteId: string) => {
    await supabaseBrowser
      .from('game_invitations')
      .update({ status: 'declined' })
      .eq('id', inviteId)
      .eq('invitee_id', playerId)
    setInvites(prev => prev.filter(i => i.id !== inviteId))
  }

  return (
    <>
      {/* Middle sub-panel */}
      <div className={styles['card-sub-panel']}>
        {invitesLoading ? (
          <div className={styles['card-sub-panel-row-stack']}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#00adc1', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Looking for invitations…</span>
          </div>
        ) : invites.length === 0 ? (
          <div className={styles['card-sub-panel-row-stack']}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CrossedSwordsIcon />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className={styles['card-sub-panel-text']}>No games yet</span>
              <span className={styles['card-sub-panel-muted']}>Challenge others or join a game to get started!</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {invites.slice(0, 3).map((invite, index) => (
              <div key={invite.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                  {invite.avatar_url ? (
                    <img
                      src={invite.avatar_url}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,173,193,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 'bold' }}>
                      {(invite.inviter_name ?? 'Unknown').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: 'white', fontSize: '13px', fontWeight: 'bold' }}>{invite.inviter_name ?? 'Unknown'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>invited you to play</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAccept(invite.id, invite.game_id)}
                      style={{ background: '#00adc1', color: 'white', fontSize: '11px', padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                    >
                      Join
                    </button>
                    <button
                      onClick={() => handleDecline(invite.id)}
                      style={{ background: 'transparent', color: 'white', fontSize: '11px', padding: '5px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {index < Math.min(invites.length, 3) - 1 && (
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                )}
              </div>
            ))}
            {invites.length > 3 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '11px', paddingTop: '8px' }}>
                + {invites.length - 3} more invitations
              </div>
            )}
          </div>
        )}
      </div>

      {/* Join code input (shown when JOIN GAME clicked) */}
      {showJoinInput && (
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABCD12"
          maxLength={6}
          className={styles['join-code-input']}
          autoFocus
        />
      )}

      {/* CTA buttons */}
      <div className={styles['card-cta-row']}>
        <button
          onClick={handleJoinClick}
          disabled={loading || (showJoinInput && !code)}
          className={`${styles['card-cta-btn']} ${styles['card-cta-btn-outline']}`}
        >
          {showJoinInput ? <><PeopleIcon /> GO TO LOBBY</> : <><PeopleIcon /> JOIN GAME</>}
        </button>
        <button
          onClick={handleCreate}
          disabled={loading}
          className={`${styles['card-cta-btn']} ${styles['card-cta-btn-blue']}`}
        >
          <PlusIcon /> CREATE GAME
        </button>
      </div>

      {error && (
        <div className={styles['error-text']}>
          {error}
        </div>
      )}
    </>
  )
}

function CrossedSwordsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 19l6-6" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 16l4 4" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 21l2-2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.5 6.5L21 18v3h-3L6.5 9.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 9L3 12" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 9l3 3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
