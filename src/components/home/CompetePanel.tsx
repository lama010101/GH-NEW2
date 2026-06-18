'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { supabaseBrowser, getValidAccessToken } from '@/core/supabaseBrowser'
import cpStyles from "./CompetePanel.module.css";

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
  accuracy_you?: number
}

function getAccuracyColor(pct: number): string {
  if (pct >= 85) return '#22c55e'
  if (pct >= 60) return '#eab308'
  if (pct >= 40) return 'var(--gh-orange)'
  return '#ef4444'
}

export function CompetePanel({ onLobby, playerId, displayName, onRequireAuth }: {
  onLobby: (gameId: string) => void
  playerId: string
  displayName: string
  onRequireAuth: () => void
}) {
  const t = useTranslations()
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

  const fetchInvites = useCallback(async () => {
    if (!playerId) {
      setInvites([])
      setInvitesLoading(false)
      return
    }
    try {
      const token = await getValidAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/invitations/pending', { headers })
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
  }, [playerId])

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

    const interval = setInterval(() => {
      fetchInvites()
    }, 15000)

    return () => {
      supabaseBrowser.removeChannel(channel)
      clearInterval(interval)
    }
  }, [playerId, fetchInvites])

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
          yearMin: -400,
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
    const res = await fetch('/api/notifications')
    if (res.ok) {
      const data = await res.json()
      const match = (data.notifications ?? []).find(
        (n: { payload?: { game_id?: string }; id: string }) =>
          n.payload?.game_id === gameId
      )
      if (match) {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [match.id] })
        })
      }
    }
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
    { key: 'invitations', label: t('home.compete_tab_invitations'), count: invites.length },
    { key: 'your_turn', label: t('home.compete_tab_your_turn'), count: yourTurnGames.length },
    { key: 'completed', label: t('home.compete_tab_completed'), count: completedGames.length },
  ]

  return (
    <>
      {/* Tab bar */}
      <div className={cpStyles.cardSubPanel}>
        <div className={cpStyles.tabBar}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`${cpStyles.tab} ${tab === t.key ? cpStyles.tabActive : ""}`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={cpStyles.tabBadge}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Invitations tab */}
        {tab === 'invitations' && (
          invitesLoading ? (
            <div className={cpStyles.loadingRow}>
              <div className={cpStyles.spinner} />
              <span className={cpStyles.loadingText}>{t('home.compete_loading_invites')}</span>
            </div>
          ) : invites.length === 0 ? (
            <div className={cpStyles.emptyState}>
              <div className={cpStyles.emptyIconWrap}>
                <InviteIcon />
              </div>
              <span>{t('home.compete_no_invitations')}</span>
            </div>
          ) : (
            <div className={cpStyles.gameList}>
              {invites.map(invite => (
                <div
                  key={invite.id}
                  onClick={() => handleAccept(invite.id, invite.game_id)}
                  className={cpStyles.gameRow}
                >
                  {invite.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={invite.avatar_url} alt="" className={cpStyles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
                  ) : null}
                  <div className={cpStyles.avatarFallback} style={{ display: invite.avatar_url ? "none" : "flex" }}>
                    {(invite.inviter_name ?? 'Unknown').slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>{invite.inviter_name ?? 'Unknown'}</span>
                    <span className={cpStyles.gameSub}>{t('home.compete_invited_you')}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDecline(invite.id) }}
                    className={cpStyles.declineBtn}
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
            <div className={cpStyles.emptyStateCenter}>{t('home.compete_no_your_turn')}</div>
          ) : (
            <div className={cpStyles.gameList}>
              {yourTurnGames.map(game => (
                <div
                  key={game.id}
                  onClick={() => onLobby(game.game_id)}
                  className={cpStyles.gameRow}
                >
                  {game.opponent_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.opponent_avatar} alt="" className={cpStyles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
                  ) : null}
                  <div className={cpStyles.avatarFallback} style={{ display: game.opponent_avatar ? "none" : "flex" }}>
                    {(game.opponent_name ?? '??').slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>{game.opponent_name}</span>
                    <span className={cpStyles.gameSub}>Round {game.round_current} / {game.round_total}</span>
                  </div>
                  <span className={cpStyles.playBadge}>{t('home.compete_play')}</span>
                </div>
              ))}
            </div>
          )
        )}

        {/* Completed tab */}
        {tab === 'completed' && (
          completedGames.length === 0 ? (
            <div className={cpStyles.emptyStateCenter}>{t('home.compete_no_completed')}</div>
          ) : (
            <div className={cpStyles.gameList}>
              {completedGames.map(game => (
                <div
                  key={game.id}
                  onClick={() => onLobby(game.game_id)}
                  className={cpStyles.gameRow}
                >
                  {game.opponent_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.opponent_avatar} alt="" className={cpStyles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
                  ) : null}
                  <div className={cpStyles.avatarFallback} style={{ display: game.opponent_avatar ? "none" : "flex" }}>
                    {(game.opponent_name ?? '??').slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>{game.opponent_name}</span>
                    <span className={cpStyles.gameSub}>{t('home.compete_round_label', { current: game.round_current, total: game.round_total })}</span>
                  </div>
                  <div className={cpStyles.scoreWrap}>
                    {game.score_you != null && game.score_them != null ? (
                      <>
                        <span className={`${cpStyles.resultBadge} ${
                          game.score_you > game.score_them
                            ? cpStyles.resultWin
                            : game.score_you < game.score_them
                            ? cpStyles.resultLoss
                            : cpStyles.resultDraw
                        }`}>
                          {game.score_you > game.score_them ? 'W' : game.score_you < game.score_them ? 'L' : 'D'}
                        </span>
                        <span
                          className={cpStyles.accuracyValue}
                          style={{ color: getAccuracyColor(game.accuracy_you ?? 0) }}
                        >
                          {game.accuracy_you ?? 0}%
                        </span>
                        <span className={cpStyles.xpValue}>{game.score_you} XP</span>
                      </>
                    ) : (
                      <span className={cpStyles.completedLabel}>{t('home.compete_completed')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Join code input */}
      {showJoinInput && (
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder={t('home.compete_code_placeholder')}
          maxLength={6}
          className={cpStyles.joinCodeInput}
          autoFocus
        />
      )}

      {/* CTA buttons */}
      <div className={cpStyles.cardCtaRow}>
        <button
          onClick={handleJoinClick}
          disabled={loading || (showJoinInput && !code)}
          className={`${cpStyles.cardCtaBtn} ${cpStyles.cardCtaBtnOutline}`}
        >
          {showJoinInput ? <><PeopleIcon /> {t('home.compete_go')}</> : <><PeopleIcon /> {t('home.compete_join_game')}</>}
        </button>
        <button
          onClick={handleCreate}
          disabled={loading}
          className={`${cpStyles.cardCtaBtn} ${cpStyles.cardCtaBtnBlue}`}
        >
          <PlusIcon /> {t('home.compete_create_game')}
        </button>
      </div>

      {error && (
        <div className={cpStyles.errorText}>{error}</div>
      )}
    </>
  );
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
