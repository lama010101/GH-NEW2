'use client'

// Shared data layer for the Compete lists (MP-UIX-PORT-C-HOME-001).
// Extracted verbatim from CompetePanel.tsx: pending-invitations fetch,
// active-games fetch, the game_invitations postgres_changes subscription,
// the 15s poll, and the window-focus refetch. Consumed by BOTH
// CompetePanel (/home/compete/all) and the home ChallengeCard accordion.

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser, getValidAccessToken } from '@/core/supabaseBrowser'

export type ActiveGame = {
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
  opponent_pending?: boolean
  viewer_name?: string
  viewer_avatar?: string
}

export type CompeteInvite = {
  id: string
  game_id: string
  inviter_id: string
  inviter_name: string
  avatar_url?: string
  created_at: string
  expires_at: string
  mode?: 'sync' | 'async'
  session_deadline?: string
}

export function useCompeteLists(playerId: string | undefined) {
  const [invites, setInvites] = useState<CompeteInvite[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)
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

  const fetchActiveGames = useCallback(async () => {
    if (!playerId) return
    try {
      const res = await fetch('/api/compete/active-games')
      if (!res.ok) return
      const { games } = await res.json()
      setActiveGames(games ?? [])
    } catch {}
  }, [playerId])

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
      fetchActiveGames()
    }, 15000)

    const handleFocus = () => {
      fetchInvites()
      fetchActiveGames()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      supabaseBrowser.removeChannel(channel)
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, fetchInvites, fetchActiveGames])

  return { invites, setInvites, invitesLoading, activeGames }
}
