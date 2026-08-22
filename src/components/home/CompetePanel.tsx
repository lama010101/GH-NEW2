'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabaseBrowser, getValidAccessToken } from '@/core/supabaseBrowser'
import { getAccuracyColor } from '@/core/accuracyColor'
import PlayerAvatar from '@/components/compete/PlayerAvatar'
import { RelaxPwaInterstitialModal } from '@/components/compete/RelaxPwaInterstitialModal'
import { shouldShowRelaxPwaInterstitial, markRelaxPwaInterstitialSkipped } from '@/core/relaxPwaInterstitial'
import cpStyles from "./CompetePanel.module.css";

type ActiveGame = {
  id: string
  game_id: string
  opponent_id: string
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
  created_at?: string
  session_deadline?: string
  is_host_opponent?: boolean
  is_host_viewer?: boolean
}

function timeAgo(iso: string, t: (key: string, params?: Record<string, number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return t('notifications.just_now')
  if (diff < 3600000) return t('notifications.m_ago', { n: Math.floor(diff / 60000) })
  if (diff < 86400000) return t('notifications.h_ago', { n: Math.floor(diff / 3600000) })
  return t('notifications.d_ago', { n: Math.floor(diff / 86400000) })
}

function timeRemaining(deadlineIso: string, t: (key: string, params?: Record<string, number>) => string): string {
  const diff = new Date(deadlineIso).getTime() - Date.now()
  if (diff <= 0) return t('home.compete_expires_soon')
  if (diff < 3600000) return t('home.compete_expires_soon')
  if (diff < 86400000) return t('home.compete_time_left_h', { n: Math.floor(diff / 3600000) })
  return t('home.compete_time_left_d', { n: Math.floor(diff / 86400000) })
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

export async function acceptInvitation(invitationId: string): Promise<{ ok: boolean; game_id?: string; error?: string; code?: string }> {
  try {
    const res = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitation_id: invitationId }),
    })
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    if (!res.ok) {
      return { ok: false, error: data.error ?? 'Request failed', code: data.code }
    }
    return { ok: true, game_id: data.game_id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
  }
}

export async function declineInvitation(invitationId: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await fetch('/api/invitations/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitation_id: invitationId }),
    })
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    if (!res.ok) {
      return { ok: false, error: data.error ?? 'Request failed', code: data.code }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
  }
}

export function CompetePanel({ onLobby, playerId }: {
  onLobby: (gameId: string) => void
  playerId: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const [invites, setInvites] = useState<Array<{
    id: string
    game_id: string
    inviter_id: string
    inviter_name: string
    avatar_url?: string
    created_at: string
    expires_at: string
    mode?: 'sync' | 'async'
    session_deadline?: string
  }>>([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [tab, setTab] = useState<'invitations'|'your_turn'|'completed'>('invitations')
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([])
  const [pwaInterstitialPending, setPwaInterstitialPending] = useState<null | (() => void)>(null)

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

  const runAccept = async (inviteId: string, gameId: string) => {
    const result = await acceptInvitation(inviteId)
    if (!result.ok) {
      console.error('[CompetePanel] acceptInvitation failed:', result.error, result.code)
      return
    }
    onLobby(result.game_id ?? gameId)
  }

  const handleAccept = (inviteId: string, gameId: string, mode?: 'sync' | 'async') => {
    if (mode === 'async' && shouldShowRelaxPwaInterstitial()) {
      setPwaInterstitialPending(() => () => { void runAccept(inviteId, gameId) })
      return
    }
    void runAccept(inviteId, gameId)
  }

  const handlePwaInterstitialSkip = () => {
    markRelaxPwaInterstitialSkipped()
    const pending = pwaInterstitialPending
    setPwaInterstitialPending(null)
    if (pending) pending()
  }

  const handleDecline = async (inviteId: string) => {
    const result = await declineInvitation(inviteId)
    if (!result.ok) {
      console.error('[CompetePanel] declineInvitation failed:', result.error, result.code)
      return
    }
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
      {pwaInterstitialPending && (
        <RelaxPwaInterstitialModal onClose={handlePwaInterstitialSkip} />
      )}
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
                  <PlayerAvatar
                    avatarUrl={invite.avatar_url ?? null}
                    displayName={invite.inviter_name ?? t('game.unknown_player')}
                    playerId={invite.inviter_id}
                    size={28}
                    initials={(invite.inviter_name ?? t('game.unknown_player')).slice(0, 2).toUpperCase()}
                  />
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>{invite.inviter_name ?? t('game.unknown_player')}</span>
                    <span className={cpStyles.gameSub}>
                      {invite.mode && (
                        <span className={cpStyles.modeBadgeInline}>
                          {invite.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax')}
                        </span>
                      )}
                      {' '}
                      {t('home.compete_invite_sent', { time: timeAgo(invite.created_at, t) })}
                      {invite.mode === 'async' && invite.session_deadline && (
                        <span className={cpStyles.timeRemaining}> · {timeRemaining(invite.session_deadline, t)}</span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAccept(invite.id, invite.game_id, invite.mode)}
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
                  <PlayerAvatar
                    avatarUrl={game.opponent_avatar ?? null}
                    displayName={game.opponent_name ?? t('game.unknown_player')}
                    playerId={game.opponent_id}
                    size={28}
                    initials={(game.opponent_name ?? t('game.unknown_player')).slice(0, 2).toUpperCase()}
                  />
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>
                      {game.opponent_name}
                    </span>
                    <span className={cpStyles.gameSub}>
                      {game.mode && (
                        <span className={cpStyles.modeBadgeInline}>
                          {game.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax')}
                        </span>
                      )}
                      {' '}
                      {t('home.compete_round_label', { current: game.round_current, total: game.round_total })}
                      {game.mode === 'async' && game.session_deadline && (
                        <span className={cpStyles.timeRemaining}> · {timeRemaining(game.session_deadline, t)}</span>
                      )}
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
                  <PlayerAvatar
                    avatarUrl={game.opponent_avatar ?? null}
                    displayName={game.opponent_name ?? t('game.unknown_player')}
                    playerId={game.opponent_id}
                    size={28}
                    initials={(game.opponent_name ?? t('game.unknown_player')).slice(0, 2).toUpperCase()}
                  />
                  <div className={cpStyles.gameInfo}>
                    <span className={cpStyles.gameName}>
                      {game.opponent_name}
                    </span>
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

      {/* See all link — shown when a tab's row count equals the API LIMIT */}
      {((tab === 'invitations' && invites.length >= 5) ||
        (tab === 'your_turn' && yourTurnGames.length >= 20) ||
        (tab === 'completed' && completedGames.length >= 20)) && (
        <button
          type="button"
          className={cpStyles.seeAllLink}
          onClick={() => router.push('/home/compete/all')}
        >
          {t('home.compete_see_all')}
        </button>
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
