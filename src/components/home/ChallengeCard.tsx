'use client'

// Home v2 Challenge card (MP-UIX-PORT-C-HOME-001) — CompetePanel's data in a
// collapsible accordion (Invitations / Your turn / Completed + Create pill),
// per prototype/home-v2 ChallengeCard. List data comes from useCompeteLists
// (shared verbatim with CompetePanel); row handlers (accept/decline, lobby
// navigation, PWA interstitial) mirror CompetePanel's; the Create flow keeps
// createAsyncCompeteSession + RelaxPwaInterstitialModal + RelaxPushNudge
// exactly as the old home ModeCard did.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Play, ChevronRight, Trash2, Plus } from 'lucide-react'
import { getAccuracyColor } from '@/core/accuracyColor'
import PlayerAvatar from '@/components/compete/PlayerAvatar'
import { RelaxPwaInterstitialModal } from '@/components/compete/RelaxPwaInterstitialModal'
import { RelaxPushNudge } from '@/components/RelaxPushNudge'
import { shouldShowRelaxPwaInterstitial, markRelaxPwaInterstitialSkipped } from '@/core/relaxPwaInterstitial'
import { createAsyncCompeteSession } from '@/core/competeCreate'
import { useCompeteLists } from './useCompeteLists'
import { acceptInvitation, declineInvitation, timeAgo, timeRemaining } from './CompetePanel'
import { CappedRows } from './CappedRows'
import styles from './ChallengeCard.module.css'

type ChallengeTab = 'invitations' | 'your_turn' | 'completed'

interface ChallengeCardProps {
  playerId: string | undefined
  displayName: string
  onLobby: (gameId: string) => void
}

export function ChallengeCard({ playerId, displayName, onLobby }: ChallengeCardProps) {
  const t = useTranslations()
  const router = useRouter()

  const { invites, setInvites, invitesLoading, activeGames } = useCompeteLists(playerId)

  const [openTabs, setOpenTabs] = useState<ChallengeTab[]>([])
  // Desktop only: invitations + your turn expanded by default (mobile stays collapsed)
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) setOpenTabs(['invitations', 'your_turn'])
  }, [])

  const [invitePending, setInvitePending] = useState<Record<string, boolean>>({})
  const [lobbyPending, setLobbyPending] = useState<Record<string, boolean>>({})
  const [competeLoading, setCompeteLoading] = useState(false)
  const [competeError, setCompeteError] = useState<string | null>(null)
  const [pwaInterstitialPending, setPwaInterstitialPending] = useState<null | (() => void)>(null)
  const [relaxNudgePending, setRelaxNudgePending] = useState<null | (() => void)>(null)
  const relaxNudgePendingRef = useRef<null | (() => void)>(null)
  useEffect(() => { relaxNudgePendingRef.current = relaxNudgePending }, [relaxNudgePending])

  // ── Create flow (mirrors the old home ModeCard compete branch) ──────────
  const runCompeteCreate = async () => {
    if (!playerId) return
    setCompeteLoading(true)
    setCompeteError(null)
    try {
      const gameId = await createAsyncCompeteSession(playerId, displayName)
      onLobby(gameId)
    } catch (e) {
      setCompeteError(e instanceof Error ? e.message : t('game.error_creating_game'))
    } finally {
      setCompeteLoading(false)
    }
  }

  const handleCompeteCreate = () => {
    if (!playerId) return
    if (shouldShowRelaxPwaInterstitial()) {
      setPwaInterstitialPending(() => () => setRelaxNudgePending(() => runCompeteCreate))
      return
    }
    setRelaxNudgePending(() => runCompeteCreate)
  }

  const handlePwaInterstitialSkip = () => {
    markRelaxPwaInterstitialSkipped()
    const pending = pwaInterstitialPending
    setPwaInterstitialPending(null)
    if (pending) pending()
  }

  const handleRelaxNudgeComplete = () => {
    const pending = relaxNudgePendingRef.current
    relaxNudgePendingRef.current = null
    setRelaxNudgePending(null)
    if (pending) void pending()
  }

  // ── Invitation accept/decline (mirrors CompetePanel) ─────────────────────
  const runAccept = async (inviteId: string, gameId: string) => {
    setInvitePending(prev => ({ ...prev, [inviteId]: true }))
    try {
      const result = await acceptInvitation(inviteId)
      if (!result.ok) {
        console.error('[ChallengeCard] acceptInvitation failed:', result.error, result.code)
        return
      }
      onLobby(result.game_id ?? gameId)
    } finally {
      setInvitePending(prev => { const next = { ...prev }; delete next[inviteId]; return next })
    }
  }

  const handleAccept = (inviteId: string, gameId: string, mode?: 'sync' | 'async') => {
    if (mode === 'async' && shouldShowRelaxPwaInterstitial()) {
      setPwaInterstitialPending(() => () => { void runAccept(inviteId, gameId) })
      return
    }
    void runAccept(inviteId, gameId)
  }

  const handleDecline = async (inviteId: string) => {
    setInvitePending(prev => ({ ...prev, [inviteId]: true }))
    try {
      const result = await declineInvitation(inviteId)
      if (!result.ok) {
        console.error('[ChallengeCard] declineInvitation failed:', result.error, result.code)
        return
      }
      setInvites(prev => prev.filter(i => i.id !== inviteId))
    } finally {
      setInvitePending(prev => { const next = { ...prev }; delete next[inviteId]; return next })
    }
  }

  const yourTurnGames = activeGames.filter(g => g.status === 'your_turn')
  const completedGames = activeGames.filter(g => g.status === 'completed')

  const tabs: { key: ChallengeTab; title: string; count: number }[] = [
    { key: 'invitations', title: t('home.compete_tab_invitations'), count: invites.length },
    { key: 'your_turn', title: t('home.compete_tab_your_turn'), count: yourTurnGames.length },
    { key: 'completed', title: t('home.compete_tab_completed'), count: completedGames.length },
  ]

  const toggleTab = (key: ChallengeTab) =>
    setOpenTabs((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  return (
    <section className={styles.challenge} aria-labelledby="hv2c-title">
      <div className={styles.head}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/compete_large.webp" alt="" width={64} height={64} decoding="async" className={styles.icon} />
        <div className={styles.headTxt}>
          <h2 id="hv2c-title" className={styles.title}>{t('home.compete_name')}</h2>
          <span className={styles.sub}>{t('home.challenge_sub')}</span>
        </div>
        <button
          type="button"
          className={styles.create}
          onClick={handleCompeteCreate}
          disabled={competeLoading}
        >
          <Plus size={16} strokeWidth={2.5} /> {t('home.compete_create_game')}
        </button>
      </div>

      <div className={styles.tabs}>
        {tabs.map((tab) => {
          const openT = openTabs.includes(tab.key)
          return (
            <div className={styles.tab} key={tab.key}>
              <button
                type="button"
                className={styles.tabHead}
                onClick={() => toggleTab(tab.key)}
                aria-expanded={openT}
              >
                <span className={styles.tabTitle}>{tab.title}</span>
                {tab.count > 0 && <span className={styles.tabCount}>{tab.count}</span>}
                <ChevronRight size={16} className={`${styles.tabChev} ${openT ? styles.tabChevOpen : ''}`} />
              </button>

              {openT && tab.key === 'invitations' && (
                <CappedRows className={styles.tabBody} maxRows={5}>
                  {invitesLoading ? (
                    <div className={styles.emptyState}>{t('home.compete_loading_invites')}</div>
                  ) : invites.length === 0 ? (
                    <div className={styles.emptyState}>{t('home.compete_no_invitations')}</div>
                  ) : (
                    invites.map((invite) => (
                      <div className={styles.row} data-cap-row key={invite.id}>
                        <PlayerAvatar
                          avatarUrl={invite.avatar_url ?? null}
                          displayName={invite.inviter_name ?? t('game.unknown_player')}
                          playerId={invite.inviter_id}
                          size={28}
                          initials={(invite.inviter_name ?? t('game.unknown_player')).slice(0, 2).toUpperCase()}
                        />
                        <div className={styles.info}>
                          <span className={styles.name}>{invite.inviter_name ?? t('game.unknown_player')}</span>
                          <span className={styles.rowSub}>
                            {invite.mode && (
                              <span className={styles.mode}>
                                {invite.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax')}
                              </span>
                            )}{' '}
                            {t('home.compete_invite_sent', { time: timeAgo(invite.created_at, t) })}
                            {invite.mode === 'async' && invite.session_deadline && (
                              <span className={styles.timeRemaining}> · {timeRemaining(invite.session_deadline, t)}</span>
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.go}
                          onClick={() => handleAccept(invite.id, invite.game_id, invite.mode)}
                          aria-label={t('home.compete_play_aria')}
                          disabled={!!invitePending[invite.id]}
                        >
                          {invitePending[invite.id] ? '…' : <Play size={14} strokeWidth={2.5} />}
                        </button>
                        <button
                          type="button"
                          className={styles.del}
                          onClick={(e) => { e.stopPropagation(); handleDecline(invite.id) }}
                          aria-label={t('home.compete_delete_aria')}
                          disabled={!!invitePending[invite.id]}
                        >
                          {invitePending[invite.id] ? '…' : <Trash2 size={13} />}
                        </button>
                      </div>
                    ))
                  )}
                  {invites.length >= 5 && (
                    <button type="button" className={styles.seeAll} onClick={() => router.push('/home/compete/all')}>
                      {t('home.compete_see_all')}
                    </button>
                  )}
                </CappedRows>
              )}

              {openT && tab.key === 'your_turn' && (
                <CappedRows className={styles.tabBody} maxRows={5}>
                  {yourTurnGames.length === 0 ? (
                    <div className={styles.emptyState}>{t('home.compete_no_your_turn')}</div>
                  ) : (
                    yourTurnGames.map((game) => {
                      const pendingHost = game.opponent_pending === true
                      const rowAvatarUrl = pendingHost ? (game.viewer_avatar ?? null) : (game.opponent_avatar ?? null)
                      const rowDisplayName = pendingHost
                        ? (game.viewer_name ?? t('game.unknown_player'))
                        : (game.opponent_name ?? t('game.unknown_player'))
                      const rowPlayerId = pendingHost ? (playerId ?? game.opponent_id) : game.opponent_id
                      return (
                        <div className={styles.row} data-cap-row key={game.id}>
                          <PlayerAvatar
                            avatarUrl={rowAvatarUrl}
                            displayName={rowDisplayName}
                            playerId={rowPlayerId}
                            size={28}
                            initials={rowDisplayName.slice(0, 2).toUpperCase()}
                          />
                          <div className={styles.info}>
                            <span className={styles.name}>{rowDisplayName}</span>
                            <span className={styles.rowSub}>
                              {game.mode && (
                                <span className={styles.mode}>
                                  {game.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax')}
                                </span>
                              )}{' '}
                              {t('home.round_of', { current: game.round_current, total: game.round_total })}
                              {game.mode === 'async' && game.session_deadline && (
                                <span className={styles.timeRemaining}> · {timeRemaining(game.session_deadline, t)}</span>
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={styles.go}
                            onClick={() => { setLobbyPending(prev => ({ ...prev, [game.game_id]: true })); onLobby(game.game_id) }}
                            aria-label={t('home.compete_play_aria')}
                            disabled={!!lobbyPending[game.game_id]}
                          >
                            {lobbyPending[game.game_id] ? '…' : <Play size={14} strokeWidth={2.5} />}
                          </button>
                        </div>
                      )
                    })
                  )}
                  {yourTurnGames.length >= 20 && (
                    <button type="button" className={styles.seeAll} onClick={() => router.push('/home/compete/all')}>
                      {t('home.compete_see_all')}
                    </button>
                  )}
                </CappedRows>
              )}

              {openT && tab.key === 'completed' && (
                <CappedRows className={styles.tabBody} maxRows={5}>
                  {completedGames.length === 0 ? (
                    <div className={styles.emptyState}>{t('home.compete_no_completed')}</div>
                  ) : (
                    completedGames.map((game) => {
                      const pendingHost = game.opponent_pending === true
                      const rowAvatarUrl = pendingHost ? (game.viewer_avatar ?? null) : (game.opponent_avatar ?? null)
                      const rowDisplayName = pendingHost
                        ? (game.viewer_name ?? t('game.unknown_player'))
                        : (game.opponent_name ?? t('game.unknown_player'))
                      const rowPlayerId = pendingHost ? (playerId ?? game.opponent_id) : game.opponent_id
                      return (
                        <div
                          className={styles.row}
                          data-cap-row
                          key={game.id}
                          onClick={() => { setLobbyPending(prev => ({ ...prev, [game.game_id]: true })); onLobby(game.game_id) }}
                          aria-disabled={!!lobbyPending[game.game_id]}
                        >
                          <PlayerAvatar
                            avatarUrl={rowAvatarUrl}
                            displayName={rowDisplayName}
                            playerId={rowPlayerId}
                            size={28}
                            initials={rowDisplayName.slice(0, 2).toUpperCase()}
                          />
                          <div className={styles.info}>
                            <span className={styles.name}>{rowDisplayName}</span>
                            <span className={styles.rowSub}>
                              {game.mode && (
                                <span className={styles.mode}>
                                  {game.mode === 'sync' ? t('home.compete_mode_rush') : t('home.compete_mode_relax')}
                                </span>
                              )}{' '}
                              {game.completed_at ? timeAgo(game.completed_at, t) : ''}
                            </span>
                          </div>
                          <span className={styles.acc} style={{ color: getAccuracyColor(game.accuracy_you ?? 0) }}>
                            {game.accuracy_you ?? 0}%
                          </span>
                          <span className={styles.rank}>
                            {game.leaderboard_rank != null ? `#${game.leaderboard_rank}` : '#—'}
                          </span>
                          <button
                            type="button"
                            className={styles.del}
                            aria-label={t('home.compete_delete_aria')}
                            onClick={(e) => { e.stopPropagation() }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )
                    })
                  )}
                  {completedGames.length >= 20 && (
                    <button type="button" className={styles.seeAll} onClick={() => router.push('/home/compete/all')}>
                      {t('home.compete_see_all')}
                    </button>
                  )}
                </CappedRows>
              )}
            </div>
          )
        })}
      </div>

      {competeError && (
        <div className={styles.errorRow}>{competeError}</div>
      )}
      {pwaInterstitialPending && (
        <RelaxPwaInterstitialModal onClose={handlePwaInterstitialSkip} />
      )}
      {relaxNudgePending && (
        <RelaxPushNudge onComplete={handleRelaxNudgeComplete} />
      )}
    </section>
  )
}
