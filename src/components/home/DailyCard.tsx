'use client'

// Home v2 Daily card (MP-UIX-PORT-C-HOME-001) — port of prototype/home-v2
// DailyCard onto real data. Status/result payload comes from
// GET /api/daily/status; the streak badge reads the player's own
// player_daily_streak row (RLS: own-row SELECT); the 7-day week strip and
// "N playing today" read leaderboard_daily (SELECT for any signed-in user).
// Countdown uses getNextDailyRollover (10:00 UTC / UTC+14 midnight).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Play } from 'lucide-react'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { getAccuracyColor } from '@/core/accuracyColor'
import { getDailyChallengeDate, getNextDailyRollover } from '@/core/dailyDate'
import { MAX_ROUNDS } from '@/core/types'
import type { DailySignal } from '@/core/homeCardOrder'
import styles from './DailyCard.module.css'

type DailyStatus = 'not_started' | 'in_progress' | 'completed' | 'expired'

interface DailyPayload {
  status: DailyStatus
  gameId?: string
  currentRoundIndex?: number
  results?: { avgAccuracy?: number; totalXp?: number; rank?: number | null }
}

interface DailyCardProps {
  playerId: string | undefined
  onOrderSignal?: (s: { settled: boolean; status: DailySignal }) => void
}

const STATUS_META: Record<'new' | 'playing' | 'done', { key: string; color: string }> = {
  new: { key: 'home.daily_status_new', color: '#22c55e' },
  playing: { key: 'home.daily_status_in_progress', color: '#f59e0b' },
  done: { key: 'home.daily_status_done', color: '#60a5fa' },
}

function msToParts(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 }
}

function DailyCountdown({ prefix }: { prefix: string }) {
  const t = useTranslations()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  if (now === null) return <span className={styles.countBadge}>—</span>
  const ms = getNextDailyRollover(new Date(now)).getTime() - now
  const { h, m } = msToParts(ms)
  return <span className={styles.countBadge}>{prefix} {t('common.countdown_hm', { h, m })}</span>
}

// The last 7 daily-challenge dates (UTC+14 boundary) ending today, with the
// weekday initial localized via Intl.
function useChallengeWeek(playedDates: Set<string>): { iso: string; initial: string; today: boolean; played: boolean }[] | null {
  const locale = useLocale()
  const [week, setWeek] = useState<{ iso: string; initial: string; today: boolean; played: boolean }[] | null>(null)
  useEffect(() => {
    const todayIso = getDailyChallengeDate()
    const day = new Date(`${todayIso}T00:00:00Z`)
    const fmt = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'narrow' })
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(day)
      d.setUTCDate(d.getUTCDate() - (6 - i))
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      return { iso, initial: fmt.format(d), today: i === 6, played: playedDates.has(iso) }
    })
    setWeek(days)
  }, [locale, playedDates])
  return week
}

// Proportional progress arc (same technique as JourneyCard's MiniRing44).
function ResultRing({ pct: pctPercent, color }: { pct: number; color: string }) {
  const size = 44
  const sw = 5
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(1, Math.max(0, pctPercent / 100))
  return (
    <span className={styles.pctRingWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - pct * c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className={styles.pctRingVal} style={{ color }}>{pctPercent}%</span>
    </span>
  )
}

export function DailyCard({ playerId, onOrderSignal }: DailyCardProps) {
  const t = useTranslations()
  const router = useRouter()

  const [daily, setDaily] = useState<DailyPayload | null>(null)
  const [streak, setStreak] = useState<number | null>(null)
  const [playedDates, setPlayedDates] = useState<Set<string>>(new Set())
  const [playingToday, setPlayingToday] = useState<number | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/daily/status')
        if (!res.ok) throw new Error('daily status failed')
        const data = (await res.json()) as DailyPayload
        if (!cancelled) setDaily(data)
      } catch {
        if (!cancelled) setLoadFailed(true)
      }
    })()
    return () => { cancelled = true }
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
        if (!cancelled && data) setStreak(Number(data.daily_streak_current) || 0)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [playerId])

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    ;(async () => {
      try {
        const todayIso = getDailyChallengeDate()
        const day = new Date(`${todayIso}T00:00:00Z`)
        day.setUTCDate(day.getUTCDate() - 6)
        const weekAgoIso = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`
        const [weekRes, todayRes] = await Promise.all([
          supabaseBrowser
            .from('leaderboard_daily')
            .select('date')
            .eq('player_id', playerId)
            .gte('date', weekAgoIso),
          supabaseBrowser
            .from('leaderboard_daily')
            .select('player_id', { count: 'exact', head: true })
            .eq('date', todayIso),
        ])
        if (cancelled) return
        if (!weekRes.error) {
          setPlayedDates(new Set(((weekRes.data ?? []) as { date: string }[]).map((r) => r.date)))
        }
        if (!todayRes.error && typeof todayRes.count === 'number') {
          setPlayingToday(todayRes.count)
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [playerId])

  // Order signal for useHomeCardOrder: settled once the /api/daily/status fetch
  // finished (success or failure); a failed load reports status 'unknown'.
  useEffect(() => {
    onOrderSignal?.({
      settled: daily !== null || loadFailed,
      status: loadFailed ? 'unknown' : (daily?.status ?? 'unknown'),
    })
  }, [onOrderSignal, daily, loadFailed])

  const status: DailyStatus | null = loadFailed ? null : (daily?.status ?? null)
  const uiState: 'new' | 'playing' | 'done' =
    status === 'in_progress' ? 'playing' : status === 'completed' || status === 'expired' ? 'done' : 'new'
  const statusMeta = STATUS_META[uiState]
  const week = useChallengeWeek(playedDates)

  const avgAccuracy = daily?.results?.avgAccuracy != null ? Math.round(Number(daily.results.avgAccuracy)) : null
  const totalXp = daily?.results?.totalXp != null ? Math.round(Number(daily.results.totalXp)) : null
  const rank = daily?.results?.rank != null ? Number(daily.results.rank) : null
  const percentile =
    rank !== null && rank > 0 && playingToday !== null && playingToday > 0
      ? Math.max(1, Math.ceil((rank / playingToday) * 100))
      : null
  const roundIndex = typeof daily?.currentRoundIndex === 'number' ? daily.currentRoundIndex : 0

  return (
    <section className={styles.daily} aria-labelledby="hv2d-title">
      <div className={styles.inner}>
        {/* Header */}
        <div className={styles.head}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/daily_large.webp" alt="" width={64} height={64} decoding="async" className={styles.icon} />
          <div className={styles.headTxt}>
            <h2 id="hv2d-title" className={styles.title}>{t('home.daily_name')}</h2>
            <span className={styles.date}>{t('home.daily_tagline')}</span>
          </div>
          <div className={styles.headRight}>
            {uiState !== 'new' && !loadFailed && (
              <span
                className={styles.status}
                style={{ color: '#1a0505', background: statusMeta.color, borderColor: statusMeta.color }}
              >
                {t(statusMeta.key)}
              </span>
            )}
            <DailyCountdown prefix={uiState === 'done' ? t('home.daily_next_in') : t('home.daily_ends_in')} />
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            {loadFailed && (
              <span className={styles.loadError} role="alert">{t('home.daily_load_error')}</span>
            )}

            {uiState === 'new' && (
              <button type="button" className={styles.cta} onClick={() => router.push('/daily')}>
                <Play size={16} strokeWidth={2.5} /> {t('home.daily_play_today')}
              </button>
            )}

            {uiState === 'playing' && (
              <>
                <div className={styles.rounds}>
                  {Array.from({ length: MAX_ROUNDS }, (_, i) => (
                    <span key={i} className={`${styles.dot} ${i < roundIndex ? styles.dotDone : i === roundIndex ? styles.dotCur : ''}`} />
                  ))}
                  <span className={styles.roundTxt}>
                    {t('home.round_of', { current: Math.min(roundIndex + 1, MAX_ROUNDS), total: MAX_ROUNDS })}
                  </span>
                </div>
                <button type="button" className={styles.cta} onClick={() => router.push('/daily')}>
                  <Play size={16} strokeWidth={2.5} /> {t('home.daily_resume')}
                </button>
              </>
            )}

            {uiState === 'done' && (
              <>
                <div className={styles.result}>
                  {avgAccuracy !== null && (
                    <ResultRing pct={avgAccuracy} color={getAccuracyColor(avgAccuracy)} />
                  )}
                  <div className={styles.resTxt}>
                    {totalXp !== null && (
                      <span className={styles.resXp}>{t('home.daily_xp_gained', { xp: totalXp })}</span>
                    )}
                    {rank !== null && (
                      <span className={styles.resRank}>
                        {percentile !== null
                          ? t('home.daily_rank_line', { rank, pct: percentile })
                          : `#${rank}`}
                      </span>
                    )}
                  </div>
                </div>
                {daily?.gameId && (
                  <button type="button" className={styles.ctaOutline} onClick={() => router.push(`/daily/game/${daily.gameId}/results`)}>
                    {t('home.daily_view_results')}
                  </button>
                )}
              </>
            )}

            {/* Streak + week on one line */}
            <div className={styles.streakRow}>
              <div className={styles.streak}>
                {streak !== null && <span className={styles.streakBadge}>🔥 {streak}</span>}
                <span className={styles.streakTxt}>{t('home.daily_streak')}</span>
              </div>
              <div className={styles.week}>
                {week === null
                  ? Array.from({ length: 7 }, (_, i) => <span key={i} className={`${styles.day} ${styles.dayEmpty}`} />)
                  : week.map((d, i) => (
                      <span
                        key={i}
                        className={`${styles.day} ${d.played ? styles.dayDone : d.today ? styles.dayToday : styles.dayEmpty}`}
                        title={d.iso}
                      >
                        {d.initial}
                      </span>
                    ))}
              </div>
              {playingToday !== null && playingToday > 0 && (
                <span className={styles.playingToday}>{t('home.daily_playing_today', { count: playingToday })}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
