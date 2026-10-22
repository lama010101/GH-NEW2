'use client'

// Home card order hook (UIX-HOME-DYNORDER-1022-001) — collects the three card
// order signals (daily status, journey resume, challenge actionable) reported
// by the cards, settles the single-column order once all signals settle or
// HOME_ORDER_SETTLE_TIMEOUT_MS elapses since the first signal, then freezes it
// for the mounted page's lifetime. The settled order is persisted per player
// as the next visit's pre-settle hint.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HOME_CARD_DEFAULT_ORDER,
  HOME_ORDER_SETTLE_TIMEOUT_MS,
  computeHomeCardOrder,
  isValidHomeCardOrder,
  type DailySignal,
  type HomeCardId,
} from '@/core/homeCardOrder'

export interface DailyOrderSignal {
  settled: boolean
  status: DailySignal
}

export interface JourneyOrderSignal {
  settled: boolean
  resume: boolean
}

export interface ChallengeOrderSignal {
  settled: boolean
  actionable: boolean
}

interface OrderSignals {
  daily: DailyOrderSignal | null
  journey: JourneyOrderSignal | null
  challenge: ChallengeOrderSignal | null
}

const EMPTY_SIGNALS: OrderSignals = { daily: null, journey: null, challenge: null }

const HINT_KEY_PREFIX = 'gh_home_card_order_v1:'

function readOrderHint(playerId: string | undefined): HomeCardId[] {
  if (!playerId || typeof window === 'undefined') return [...HOME_CARD_DEFAULT_ORDER]
  try {
    const raw = window.localStorage.getItem(`${HINT_KEY_PREFIX}${playerId}`)
    if (!raw) return [...HOME_CARD_DEFAULT_ORDER]
    const parsed: unknown = JSON.parse(raw)
    return isValidHomeCardOrder(parsed) ? parsed : [...HOME_CARD_DEFAULT_ORDER]
  } catch {
    return [...HOME_CARD_DEFAULT_ORDER]
  }
}

function writeOrderHint(playerId: string | undefined, order: HomeCardId[]) {
  if (!playerId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${HINT_KEY_PREFIX}${playerId}`, JSON.stringify(order))
  } catch {}
}

export function useHomeCardOrder(playerId: string | undefined) {
  const [order, setOrder] = useState<HomeCardId[]>(() => readOrderHint(playerId))
  const [signals, setSignals] = useState<OrderSignals>(EMPTY_SIGNALS)

  const frozenRef = useRef(false)
  const firstSignalAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const signalsRef = useRef<OrderSignals>(signals)
  const playerIdRef = useRef(playerId)
  playerIdRef.current = playerId

  const freeze = useCallback(() => {
    if (frozenRef.current) return
    frozenRef.current = true
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const s = signalsRef.current
    const computed = computeHomeCardOrder({
      daily: s.daily?.settled ? s.daily.status : 'unknown',
      journeyResume: s.journey?.settled ? s.journey.resume : false,
      challengeActionable: s.challenge?.settled ? s.challenge.actionable : false,
    })
    writeOrderHint(playerIdRef.current, computed)
    setOrder(computed)
  }, [])

  // Account switch in the same browser: reset signals, freeze and timer, and
  // reload the pre-settle hint for the new player.
  useEffect(() => {
    signalsRef.current = EMPTY_SIGNALS
    setSignals(EMPTY_SIGNALS)
    frozenRef.current = false
    firstSignalAtRef.current = null
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setOrder(readOrderHint(playerId))
  }, [playerId])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  // Settle evaluation: runs whenever a card reports. The settle clock starts
  // on the FIRST signal (cards mount only after identity is ready and after
  // any welcome-loading screen — never at hook mount).
  useEffect(() => {
    signalsRef.current = signals
    if (frozenRef.current) return
    const anySignal = signals.daily !== null || signals.journey !== null || signals.challenge !== null
    if (!anySignal) return
    if (firstSignalAtRef.current === null) {
      firstSignalAtRef.current = Date.now()
      timerRef.current = setTimeout(freeze, HOME_ORDER_SETTLE_TIMEOUT_MS)
    }
    const allSettled =
      signals.daily?.settled === true &&
      signals.journey?.settled === true &&
      signals.challenge?.settled === true
    if (allSettled) freeze()
  }, [signals, freeze])

  const reportDaily = useCallback((s: DailyOrderSignal) => {
    setSignals((prev) => ({ ...prev, daily: s }))
  }, [])

  const reportJourney = useCallback((s: JourneyOrderSignal) => {
    setSignals((prev) => ({ ...prev, journey: s }))
  }, [])

  const reportChallenge = useCallback((s: ChallengeOrderSignal) => {
    setSignals((prev) => ({ ...prev, challenge: s }))
  }, [])

  return { order, reportDaily, reportJourney, reportChallenge }
}

// True when the viewport is narrower than the desktop grid breakpoint
// (< 1024px). SSR-safe: false until mounted; no matchMedia guard needed beyond
// the window check (matchMedia is universal in supported browsers, but guard
// anyway for test environments).
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMobile
}
