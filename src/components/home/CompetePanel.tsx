'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { supabaseBrowser, getValidAccessToken } from '@/core/supabaseBrowser'
import { getAccuracyColor } from '@/core/accuracyColor'
import cpStyles from "./CompetePanel.module.css";

type ActiveGame = {
  id: string
  game_id: string
  opponent_name: string
  opponent_avatar?: string
  round_current: number
  round_total: number
  status: 'your_turn' | 'waiting' | 'completed'
  mode?: 'sync' | 'async'
  score_you?: number
  score_them?: number
  accuracy_you?: number
  completed_at?: string
  leaderboard_rank?: number
}

function timeAgo(iso: string, t: (key: string, params?: Record<string, number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return t('notifications.just_now')
  if (diff < 3600000) return t('notifications.m_ago', { n: Math.floor(diff / 60000) })
  if (diff < 86400000) return t('notifications.h_ago', { n: Math.floor(diff / 3600000) })
  return t('notifications.d_ago', { n: Math.floor(diff / 86400000) })
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

export function CompetePanel({ onLobby, playerId }: {
  onLobby: (gameId: string) => void
  playerId: string
}) {
  const t = useTranslations()
  const [invites, setInvites] = useState<Array<{
    id: string
    game_id: string
    inviter_id: string
    inviter_name: string
    avatar_url?: string
    created_at: string
    expires_at: string
    mode?: 'sync' | 'async'
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

    const handleFocus = () => {
      fetchInvites()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      supabaseBrowser.removeChannel(channel)
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, fetchInvites])

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
                  className={cpStyles.gameRow}
                >
                  {invite.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={invite.avatar_url} alt="" className={cpStyles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
                  ) : null}
                  <div className={cpStyles.avatarFallback} style={{ display: invite.avatar_url ? "none" : "flex" }}>
                    {(invite.inviter_name ?? t('game.unknown_player')).slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>{invite.inviter_name ?? t('game.unknown_player')}</span>
                    <span className={cpStyles.gameSub}>
                      {invite.mode
                        ? t('home.compete_invite_meta', {
                            mode: invite.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax'),
                            time: timeAgo(invite.created_at, t),
                          })
                        : t('home.compete_invite_sent', { time: timeAgo(invite.created_at, t) })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAccept(invite.id, invite.game_id)}
                    className={cpStyles.goBtn}
                    aria-label={t('home.compete_play_aria')}
                  >
                    <PlayIcon />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDecline(invite.id) }}
                    className={cpStyles.deleteBtn}
                    aria-label={t('home.compete_delete_aria')}
                  >
                    <TrashIcon />
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
                  className={cpStyles.gameRow}
                >
                  {game.opponent_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.opponent_avatar} alt="" className={cpStyles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
                  ) : null}
                  <div className={cpStyles.avatarFallback} style={{ display: game.opponent_avatar ? "none" : "flex" }}>
                    {(game.opponent_name ?? t('game.unknown_player')).slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>{game.opponent_name}</span>
                    <span className={cpStyles.gameSub}>
                      {game.mode && (
                        <span className={cpStyles.modeBadgeInline}>
                          {game.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax')}
                        </span>
                      )}
                      {' '}
                      {t('home.compete_round_label', { current: game.round_current, total: game.round_total })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLobby(game.game_id)}
                    className={cpStyles.goBtn}
                    aria-label={t('home.compete_play_aria')}
                  >
                    <PlayIcon />
                  </button>
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
                  className={cpStyles.gameRow}
                  onClick={() => onLobby(game.game_id)}
                >
                  {game.opponent_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.opponent_avatar} alt="" className={cpStyles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
                  ) : null}
                  <div className={cpStyles.avatarFallback} style={{ display: game.opponent_avatar ? "none" : "flex" }}>
                    {(game.opponent_name ?? t('game.unknown_player')).slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>{game.opponent_name}</span>
                    <span className={cpStyles.gameSub}>
                      {game.mode && (
                        <span className={cpStyles.modeBadgeInline}>
                          {game.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax')}
                        </span>
                      )}
                      {' '}
                      {game.completed_at ? timeAgo(game.completed_at, t) : ''}
                    </span>
                  </div>
                  <div className={cpStyles.scoreWrap}>
                    <span
                      className={cpStyles.accuracyValue}
                      style={{ color: getAccuracyColor(game.accuracy_you ?? 0) }}
                    >
                      {game.accuracy_you ?? 0}<span style={{ fontSize: '0.75em', opacity: 0.7, marginLeft: 1 }}>%</span>
                    </span>
                  </div>
                  <span className={cpStyles.rankBadge}>{game.leaderboard_rank != null ? `#${game.leaderboard_rank}` : '#—'}</span>
                  <button
                    type="button"
                    className={cpStyles.deleteBtn}
                    aria-label={t('home.compete_delete_aria')}
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  );
}

function InviteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="8" r="4" stroke="var(--gh-text-secondary)" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M2 20c0-4 3.6-7 8-7" stroke="var(--gh-text-secondary)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="19" y1="13" x2="19" y2="21" stroke="var(--gh-text-secondary)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="17" x2="23" y2="17" stroke="var(--gh-text-secondary)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}
