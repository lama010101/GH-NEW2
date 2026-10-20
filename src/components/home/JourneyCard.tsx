'use client'

// Home v2 Journey card (MP-UIX-PORT-C-HOME-001) — port of
// src/app/prototype/home-v2 JourneyCard onto real data. Reads the same two
// tables as /journey (journey_stages + journey_player_progress, both
// authenticated-SELECT per RLS) via supabaseBrowser. nextStage = lowest
// non-completed stage. Tier path uses rank-NN.png icons via journeyRules
// (single source for tier math); badges come from
// journey_player_progress.best_badge. Resume state comes from
// findAnyActivePlaythrough() + GET /api/compete/{gameId}.

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Play, Lock, Medal } from 'lucide-react'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import {
  journeyRoundCount,
  journeyStageEraKey,
  journeyStageIconFile,
  journeyStageTierIndex,
} from '@/core/journeyRules'
import {
  findAnyActivePlaythrough,
  type JourneyProgressRow,
  type JourneyStageRow,
} from '@/app/journey/_components/journeyStorage'
import { startJourneyStage } from '@/app/journey/_components/journeyStart'
import { GuestConversionModal } from '@/app/journey/_components/GuestConversionModal'
import { useIdentity } from '@/hooks/useIdentity'
import styles from './JourneyCard.module.css'

type Badge = 'gold' | 'silver' | 'bronze' | 'completion'

interface JourneyCardProps {
  playerId: string | undefined
}

export function JourneyCard({ playerId }: JourneyCardProps) {
  const t = useTranslations()
  const tGame = useTranslations('game')
  const router = useRouter()

  const [stages, setStages] = useState<JourneyStageRow[] | null>(null)
  const [progressRows, setProgressRows] = useState<JourneyProgressRow[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [resume, setResume] = useState<{
    stageId: string
    gameId: string
    roundIndex: number
    totalRounds: number
  } | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [gateStageNumber, setGateStageNumber] = useState<number | null>(null)
  const [hasConverted, setHasConverted] = useState(false)
  const { state: identityState } = useIdentity()
  const isAnonymous = identityState.status === 'ready' && identityState.isAnonymous

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    ;(async () => {
      try {
        const [stageRes, progressRes] = await Promise.all([
          supabaseBrowser
            .from('journey_stages')
            .select('id,stage_number,title,theme,difficulty_rating,min_accuracy_pct,pool_size,status')
            .order('stage_number', { ascending: true }),
          supabaseBrowser
            .from('journey_player_progress')
            .select('id,player_id,stage_id,status,best_accuracy_pct,best_badge,attempts_count,first_completed_at,last_played_at')
            .eq('player_id', playerId),
        ])
        if (cancelled) return
        if (stageRes.error) throw stageRes.error
        if (progressRes.error) throw progressRes.error
        setStages((stageRes.data ?? []) as JourneyStageRow[])
        setProgressRows((progressRes.data ?? []) as JourneyProgressRow[])
      } catch {
        if (!cancelled) setLoadFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [playerId])

  // Active playthrough marker → live round index for the resume block.
  useEffect(() => {
    if (!playerId) return
    const pending = findAnyActivePlaythrough()
    if (!pending) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/compete/${pending.gameId}?playerId=${playerId}`, { cache: 'no-store' })
        if (!res.ok) return
        const snap = (await res.json()) as {
          status?: string
          currentRoundIndex?: number
          config?: { totalRounds?: number }
        }
        if (cancelled || snap.status === 'SESSION_COMPLETE') return
        const roundIndex = typeof snap.currentRoundIndex === 'number' ? snap.currentRoundIndex : 0
        const totalRounds = typeof snap.config?.totalRounds === 'number' ? snap.config.totalRounds : 0
        setResume({ stageId: pending.stageId, gameId: pending.gameId, roundIndex, totalRounds })
      } catch {
        // Snapshot unreachable — the card renders without the resume block.
      }
    })()
    return () => { cancelled = true }
  }, [playerId])

  const stageList = stages ?? []
  const progressByStageId = new Map<string, JourneyProgressRow>()
  for (const row of progressRows) progressByStageId.set(row.stage_id, row)
  const stageNumberById = new Map<string, number>()
  for (const s of stageList) stageNumberById.set(s.id, s.stage_number)

  const completedByNumber = new Map<number, JourneyProgressRow>()
  for (const row of progressRows) {
    if (row.status !== 'completed') continue
    const n = stageNumberById.get(row.stage_id)
    if (typeof n === 'number') completedByNumber.set(n, row)
  }
  const doneCount = completedByNumber.size

  // Lowest non-completed stage; null when every stage is done.
  const nextStageRow = stageList.find((s) => !completedByNumber.has(s.stage_number)) ?? null
  const isNew = doneCount === 0
  const allDone = stageList.length > 0 && nextStageRow === null

  const tierIdx = nextStageRow ? journeyStageTierIndex(nextStageRow.stage_number) : 0
  const pathStages = nextStageRow
    ? stageList.filter((s) => journeyStageTierIndex(s.stage_number) === tierIdx).map((s) => s.stage_number)
    : []

  const gate = nextStageRow ? Math.round(Number(nextStageRow.min_accuracy_pct)) : null
  const rounds = nextStageRow ? journeyRoundCount(nextStageRow.stage_number) : null
  const difficulty =
    nextStageRow && typeof nextStageRow.difficulty_rating === 'number'
      ? nextStageRow.difficulty_rating
      : null

  const currentYear = new Date().getFullYear()
  const stageTitle = nextStageRow
    ? nextStageRow.title ?? t('journey.stage_default_title', { number: nextStageRow.stage_number })
    : null
  const stageTheme = nextStageRow
    ? nextStageRow.theme ?? tGame(journeyStageEraKey(nextStageRow.stage_number, currentYear))
    : null

  const cta = isNew
    ? t('home.journey_start')
    : resume
      ? t('journey.resume_attempt')
      : nextStageRow
        ? t('journey.result_play_stage', { number: nextStageRow.stage_number })
        : t('home.journey_view')

  // Direct stage start — same flow /journey's handleStart uses:
  // guest gate (anonymous player on stage >= 2 → conversion modal), then
  // startJourneyStage (POST /api/journey/start + sessionStorage marker) →
  // /practice/{gameId}. The server-side gate in startJourneyPlaythrough
  // stays authoritative.
  const handleStart = async () => {
    if (starting || !nextStageRow) return
    setStartError(null)
    if (nextStageRow.stage_number >= 2 && isAnonymous && !hasConverted) {
      setGateStageNumber(nextStageRow.stage_number)
      return
    }
    setStarting(true)
    try {
      const started = await startJourneyStage(nextStageRow.id)
      router.push(`/practice/${started.gameId}`)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t('journey.load_error'))
      setStarting(false)
    }
  }

  const openStage = () => {
    if (!nextStageRow) {
      router.push('/journey')
      return
    }
    if (resume !== null) {
      router.push(`/practice/${resume.gameId}`)
      return
    }
    void handleStart()
  }

  return (
    <section className={styles.journey} aria-labelledby="hv2j-title">
      {/* Header */}
      <div className={styles.head}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/levels_large.webp" alt="" width={64} height={64} decoding="async" className={styles.headIcon} />
        <div className={styles.headTxt}>
          <span className={styles.kicker}>{t('journey.title')}</span>
          <h2 id="hv2j-title" className={styles.sub}>{t('journey.subtitle')}</h2>
        </div>
        <div className={styles.prog}>
          <MiniRing44 done={doneCount} total={stageList.length || 100} />
          <span className={styles.progNum}>{doneCount}/{stageList.length || 100}</span>
        </div>
      </div>

      {loadFailed && (
        <p className={styles.loadError} role="alert">{t('journey.load_error')}</p>
      )}

      {!loadFailed && stages === null && (
        <p className={styles.loading}>{t('common.loading')}</p>
      )}

      {/* Tier path — 5-node route map with per-stage badges */}
      {!loadFailed && pathStages.length > 0 && nextStageRow && (
        <button type="button" className={styles.path} onClick={() => router.push('/journey')} aria-label={t('home.journey_view')}>
          <span className={styles.pathRow}>
            {pathStages.map((s, i) => {
              const row = completedByNumber.get(s)
              const isDone = row !== undefined
              const isCur = s === nextStageRow.stage_number
              const badge: Badge | null = isDone ? row.best_badge ?? 'completion' : null
              const bestAcc = isDone && row.best_accuracy_pct != null ? Math.round(Number(row.best_accuracy_pct)) : null
              return (
                <React.Fragment key={s}>
                  {i > 0 && <span className={`${styles.seg} ${pathStages[i - 1] < nextStageRow.stage_number ? styles.segFill : ''}`} />}
                  <span className={styles.node}>
                    <span className={styles.nodeTop}>
                      {isDone ? (
                        <span className={styles.nodeIcon} data-badge={badge ?? 'completion'}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={journeyStageIconFile(s)} alt="" width={40} height={40} decoding="async" className={styles.nodeIconImg} />
                          <span className={styles.nodeNum}>{s}</span>
                          {badge && badge !== 'completion' && (
                            <Medal size={10} className={styles.nodeMedal} />
                          )}
                        </span>
                      ) : isCur ? (
                        <span className={styles.nodeCur}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={journeyStageIconFile(s)} alt="" width={46} height={46} decoding="async" className={styles.nodeCurIcon} />
                          <span className={styles.nodeNum}>{s}</span>
                        </span>
                      ) : (
                        <span className={`${styles.nodeIcon} ${styles.nodeIconLock}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={journeyStageIconFile(s)} alt="" width={40} height={40} decoding="async" className={styles.nodeIconImg} />
                          <span className={styles.nodeLockOver}><Lock size={14} /></span>
                        </span>
                      )}
                    </span>
                    <span className={`${styles.nodeCap} ${isDone ? styles.nodeAcc : isCur ? styles.nodeCapCur : ''}`}>
                      {isDone ? `${bestAcc ?? 0}%` : isCur ? t('journey.stage_label', { number: s }) : s}
                    </span>
                  </span>
                </React.Fragment>
              )
            })}
            {pathStages[pathStages.length - 1] < 100 && (
              <>
                <span className={styles.seg} />
                <span className={styles.node}>
                  <span className={styles.nodeTop}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={journeyStageIconFile(pathStages[pathStages.length - 1] + 1)} alt="" width={40} height={40} decoding="async" className={styles.ghostIcon} />
                  </span>
                  <span className={`${styles.nodeCap} ${styles.ghostCap}`}>
                    {t('journey.stage_label', { number: pathStages[pathStages.length - 1] + 1 })}
                  </span>
                </span>
              </>
            )}
          </span>
        </button>
      )}

      {/* Up next */}
      {!loadFailed && nextStageRow && (
        <div className={styles.up}>
          <div className={styles.iconWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={journeyStageIconFile(nextStageRow.stage_number)} alt="" width={96} height={96} decoding="async" className={styles.icon} />
          </div>
          <div className={styles.upInfo}>
            <div className={styles.upTop}>
              <span className={styles.upKicker}>{t('home.journey_up_next')}</span>
              <span className={styles.stageLabel}>{t('journey.stage_label', { number: nextStageRow.stage_number })}</span>
            </div>
            <span className={styles.stageTitle}>{stageTitle}</span>
            <span className={styles.theme}>{stageTheme}</span>
            <div className={styles.chips}>
              {rounds !== null && (
                <span className={styles.chip}>{t('journey.rounds', { count: rounds })}</span>
              )}
              {gate !== null && Number.isFinite(gate) && (
                <span className={styles.chip}>{t('home.journey_pass_chip', { pct: gate })}</span>
              )}
              {difficulty !== null && (
                <span className={styles.chip}>{t('home.journey_difficulty_chip', { rating: difficulty })}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {!loadFailed && allDone && (
        <div className={styles.up}>
          <div className={styles.upInfo}>
            <span className={styles.stageTitle}>{t('journey.result_journey_complete_title')}</span>
            <span className={styles.theme}>{t('journey.result_journey_complete_body')}</span>
          </div>
        </div>
      )}

      {resume !== null && (
        <div className={styles.resume}>
          <span className={styles.dots}>
            {Array.from({ length: Math.max(0, resume.totalRounds) }, (_, i) => (
              <span key={i} className={`${styles.dot} ${i < resume.roundIndex ? styles.dotDone : i === resume.roundIndex ? styles.dotCur : ''}`} />
            ))}
          </span>
          <span className={styles.resumeTxt}>
            {t('home.round_of', { current: resume.roundIndex + 1, total: resume.totalRounds })}
          </span>
        </div>
      )}

      {!loadFailed && (nextStageRow || allDone) && (
        <div className={styles.ctaRow}>
          <button type="button" className={styles.cta} onClick={openStage} disabled={starting}>
            {starting ? t('common.loading') : (<><Play size={16} strokeWidth={2.5} /> {cta}</>)}
          </button>
        </div>
      )}

      {startError && (
        <p className={styles.loadError} role="alert">{startError}</p>
      )}

      <GuestConversionModal
        isOpen={gateStageNumber !== null}
        stageNumber={gateStageNumber ?? 2}
        onClose={() => setGateStageNumber(null)}
        onConverted={() => {
          setGateStageNumber(null)
          setHasConverted(true)
          void handleStart()
        }}
      />
    </section>
  )
}

function MiniRing44({ done, total }: { done: number; total: number }) {
  const size = 44
  const sw = 5
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  return (
    <span className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - pct * c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className={styles.ringVal}>{Math.round(pct * 100)}%</span>
    </span>
  )
}
