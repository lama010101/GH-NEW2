// Home card ordering (UIX-HOME-DYNORDER-1022-001) — single source of truth for
// the render order of the four home cards. Pure module (no React): the desktop
// order (>= 1024px) is fixed; the mobile order (< 1024px) is computed from the
// player-state signals reported by the cards via useHomeCardOrder.

export type HomeCardId = 'journey' | 'challenge' | 'daily' | 'practice'

export type DailySignal =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'unknown'

export interface HomeOrderInput {
  daily: DailySignal
  journeyResume: boolean
  challengeActionable: boolean
}

// Fixed render order at viewports >= 1024px.
export const HOME_CARD_DESKTOP_ORDER: readonly HomeCardId[] = [
  'journey',
  'challenge',
  'daily',
  'practice',
]

// Render order before the card signals settle (also the fallback when no
// valid stored hint exists).
export const HOME_CARD_DEFAULT_ORDER: readonly HomeCardId[] = [
  'daily',
  'journey',
  'challenge',
  'practice',
]

// Max wait for card signals before the order settles anyway. The clock starts
// when the FIRST signal arrives, not at hook mount.
export const HOME_ORDER_SETTLE_TIMEOUT_MS = 2000

// True only when x is a permutation of the four card ids.
export function isValidHomeCardOrder(x: unknown): x is HomeCardId[] {
  if (!Array.isArray(x) || x.length !== HOME_CARD_DESKTOP_ORDER.length) return false
  const seen = new Set<unknown>(x)
  if (seen.size !== HOME_CARD_DESKTOP_ORDER.length) return false
  return HOME_CARD_DESKTOP_ORDER.every((id) => seen.has(id))
}

export function computeHomeCardOrder(input: HomeOrderInput): HomeCardId[] {
  const doneBase = input.daily === 'completed' || input.daily === 'expired'
  let base: HomeCardId[] = doneBase
    ? [...HOME_CARD_DESKTOP_ORDER]
    : [...HOME_CARD_DEFAULT_ORDER]
  if (input.challengeActionable) {
    base = base.filter((id) => id !== 'challenge')
    base.splice(base.indexOf('journey'), 0, 'challenge')
  }
  const promoted: HomeCardId[] = []
  if (input.daily === 'in_progress') promoted.push('daily')
  if (input.journeyResume) promoted.push('journey')
  const rest = base.filter((id) => !promoted.includes(id))
  // 'practice' is never promoted and never moved — it always stays last.
  return [...promoted, ...rest]
}
