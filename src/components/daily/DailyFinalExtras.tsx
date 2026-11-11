'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { PUSH_TITLE } from '@/core/pushBranding'
import type { AllRoundResult } from '@/core/competeTypes'
import { buildDailyShareCard } from '@/core/dailyShareCard'
import DailyShareCard from './DailyShareCard'

interface DailyFinalExtrasProps {
  gameId: string
  playerId: string | null
  allRoundResults: AllRoundResult[] | null
}

export default function DailyFinalExtras({ gameId, playerId, allRoundResults }: DailyFinalExtrasProps) {
  const [streak, setStreak] = useState<number | null>(null)
  const [dateIso, setDateIso] = useState<string | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabaseBrowser
          .from('player_daily_streak')
          .select('daily_streak_current')
          .eq('player_id', playerId)
          .maybeSingle()
        if (!cancelled) {
          setStreak(data?.daily_streak_current != null ? Number(data.daily_streak_current) : null)
        }
      } catch {
        if (!cancelled) setStreak(null)
      }
    })()
    return () => { cancelled = true }
  }, [playerId])

  useEffect(() => {
    if (!playerId || !gameId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from('daily_attempts')
          .select('date')
          .eq('game_id', gameId)
          .eq('player_id', playerId)
          .maybeSingle()
        if (!cancelled && !error) {
          setDateIso(typeof data?.date === 'string' ? data.date : null)
        }
      } catch {
        // leave dateIso null — the card renders without a date
      }
    })()
    return () => { cancelled = true }
  }, [gameId, playerId])

  const cardText = useMemo(() => {
    if (!playerId || !origin) return null
    const rows = (allRoundResults ?? [])
      .filter((r) => r.playerId === playerId && (r.didSubmit || r.absent === true))
      .sort((a, b) => a.roundIndex - b.roundIndex)
    const rounds = rows.map((r) => ({
      locationScore: r.locationScore ?? 0,
      timeScore: r.timeScore ?? 0,
    }))
    const totalAccuracyPct = rows.length === 0
      ? 0
      : rows.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / rows.length
    return buildDailyShareCard({
      rounds,
      totalAccuracyPct,
      streak,
      dateIso,
      brand: PUSH_TITLE,
      origin,
    })
  }, [allRoundResults, playerId, streak, dateIso, origin])

  return <DailyShareCard text={cardText} />
}
