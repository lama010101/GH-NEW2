'use client'

import { useState, useEffect } from 'react'
import styles from '@/app/home.module.css'
import { supabaseBrowser } from '@/core/supabaseBrowser'

type ActiveGame = {
  id: string
  game_id: string
  opponent_name: string
  opponent_avatar?: string
  round_current: number
  round_total: number
  status: 'your_turn' | 'waiting' | 'completed'
  score_you?: number
  score_them?: number
}

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
  const [tab, setTab] = useState<'invitations'|'your_turn'|'completed'>('invitations')
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([])

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
    } catch {
      setInvites([])
      setInvitesLoading(false)
    }
  }

  const fetchActiveGames = async () => {
    if (!playerId) return
    try {
      const res = await fetch('/api/compete/active-games')
      if (!res.ok) return
      const { games } = await res.json()
      setActiveGames(games ?? [])
    } catch {}
  }

  useEffect(() => {
    if (!playerId) {
      setInvitesLoading(false)
      return
    }

    fetchInvites()
    fetchActiveGames()

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

  const yourTurnGames = activeGames.filter(g => g.status === 'your_turn')
  const completedGames = activeGames.filter(g => g.status === 'completed')

  const tabs: Array<{ key: typeof tab; label: string; count: number }> = [
    { key: 'invitations', label: 'INVITATIONS', count: invites.length },
    { key: 'your_turn', label: 'YOUR TURN', count: yourTurnGames.length },
    { key: 'completed', label: 'COMPLETED', count: completedGames.length },
  ]

  return (
    <>
      {/* Tab bar */}
      <div className={styles['card-sub-panel']}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.3)',
                borderRadius: 8,
                padding: '7px 0',
                flex: 1,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.45)',
                textAlign: 'center',
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700, padding: '1px 5px', marginLeft: 4 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Invitations tab */}
        {tab === 'invitations' && (
          invitesLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#00adc1', animation: 'spin 1s linear infinite' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Looking for invitations…</span>
            </div>
          ) : invites.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <InviteIcon />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>No pending invitations</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {invites.map(invite => (
                <div
                  key={invite.id}
                  onClick={() => handleAccept(invite.id, invite.game_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', marginBottom: 6, cursor: 'pointer' }}
                >
                  {invite.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={invite.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,173,193,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>
                      {(invite.inviter_name ?? 'Unknown').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{invite.inviter_name ?? 'Unknown'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Invited you to a game</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDecline(invite.id) }}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* Your Turn tab */}
        {tab === 'your_turn' && (
          yourTurnGames.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              No games waiting for your turn
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {yourTurnGames.map(game => (
                <div
                  key={game.id}
                  onClick={() => onLobby(game.game_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', marginBottom: 6, cursor: 'pointer' }}
                >
                  {game.opponent_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.opponent_avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,173,193,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>
                      {(game.opponent_name ?? '??').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{game.opponent_name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Round {game.round_current} / {game.round_total}</span>
                  </div>
                  <span style={{ background: '#0891b2', color: '#fff', fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: 'none' }}>
                    PLAY
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {/* Completed tab */}
        {tab === 'completed' && (
          completedGames.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              No completed games yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {completedGames.map(game => (
                <div
                  key={game.id}
                  onClick={() => onLobby(game.game_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', marginBottom: 6, cursor: 'pointer' }}
                >
                  {game.opponent_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.opponent_avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,173,193,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>
                      {(game.opponent_name ?? '??').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{game.opponent_name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Round {game.round_current} / {game.round_total}</span>
                  </div>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                    {game.score_you != null && game.score_them != null
                      ? `${game.score_you} – ${game.score_them}`
                      : 'Completed'}
                  </span>
                </div>
              ))}
            </div>
          )
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

function InviteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="8" r="4" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M2 20c0-4 3.6-7 8-7" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="19" y1="13" x2="19" y2="21" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="17" x2="23" y2="17" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8" strokeLinecap="round"/>
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
