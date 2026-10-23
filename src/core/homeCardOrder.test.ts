import { describe, expect, it } from 'vitest'
import {
  computeHomeCardOrder,
  isValidHomeCardOrder,
  type DailySignal,
  type HomeCardId,
} from './homeCardOrder'

const DAILY_SIGNALS: DailySignal[] = [
  'not_started',
  'in_progress',
  'completed',
  'expired',
  'unknown',
]

describe('computeHomeCardOrder (UIX-HOME-DYNORDER-1022-001)', () => {
  const cases: {
    name: string
    input: { daily: DailySignal; journeyResume: boolean; challengeActionable: boolean }
    expected: HomeCardId[]
  }[] = [
    {
      name: 'unknown / F / F',
      input: { daily: 'unknown', journeyResume: false, challengeActionable: false },
      expected: ['daily', 'journey', 'challenge', 'practice'],
    },
    {
      name: 'not_started / F / F',
      input: { daily: 'not_started', journeyResume: false, challengeActionable: false },
      expected: ['daily', 'journey', 'challenge', 'practice'],
    },
    {
      name: 'completed / F / F',
      input: { daily: 'completed', journeyResume: false, challengeActionable: false },
      expected: ['journey', 'challenge', 'daily', 'practice'],
    },
    {
      name: 'expired / F / F',
      input: { daily: 'expired', journeyResume: false, challengeActionable: false },
      expected: ['journey', 'challenge', 'daily', 'practice'],
    },
    {
      name: 'in_progress / F / F',
      input: { daily: 'in_progress', journeyResume: false, challengeActionable: false },
      expected: ['daily', 'journey', 'challenge', 'practice'],
    },
    {
      name: 'not_started / T / F',
      input: { daily: 'not_started', journeyResume: true, challengeActionable: false },
      expected: ['journey', 'daily', 'challenge', 'practice'],
    },
    {
      name: 'in_progress / T / F',
      input: { daily: 'in_progress', journeyResume: true, challengeActionable: false },
      expected: ['daily', 'journey', 'challenge', 'practice'],
    },
    {
      name: 'completed / T / F',
      input: { daily: 'completed', journeyResume: true, challengeActionable: false },
      expected: ['journey', 'challenge', 'daily', 'practice'],
    },
    {
      name: 'not_started / F / T',
      input: { daily: 'not_started', journeyResume: false, challengeActionable: true },
      expected: ['daily', 'challenge', 'journey', 'practice'],
    },
    {
      name: 'completed / F / T',
      input: { daily: 'completed', journeyResume: false, challengeActionable: true },
      expected: ['challenge', 'journey', 'daily', 'practice'],
    },
    {
      name: 'not_started / T / T',
      input: { daily: 'not_started', journeyResume: true, challengeActionable: true },
      expected: ['journey', 'daily', 'challenge', 'practice'],
    },
    {
      name: 'in_progress / T / T',
      input: { daily: 'in_progress', journeyResume: true, challengeActionable: true },
      expected: ['daily', 'journey', 'challenge', 'practice'],
    },
  ]

  for (const c of cases) {
    it(`${c.name} -> ${c.expected.join(', ')}`, () => {
      expect(computeHomeCardOrder(c.input)).toEqual(c.expected)
    })
  }

  it('returns a valid permutation with practice last for all 5x2x2 input combos', () => {
    for (const daily of DAILY_SIGNALS) {
      for (const journeyResume of [false, true]) {
        for (const challengeActionable of [false, true]) {
          const result = computeHomeCardOrder({ daily, journeyResume, challengeActionable })
          expect(isValidHomeCardOrder(result)).toBe(true)
          expect(result[result.length - 1]).toBe('practice')
        }
      }
    }
  })
})

describe('isValidHomeCardOrder', () => {
  it('accepts any permutation of the four card ids', () => {
    expect(isValidHomeCardOrder(['journey', 'challenge', 'daily', 'practice'])).toBe(true)
    expect(isValidHomeCardOrder(['practice', 'daily', 'challenge', 'journey'])).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidHomeCardOrder(['journey', 'challenge', 'daily'])).toBe(false)
    expect(isValidHomeCardOrder(['journey', 'challenge', 'daily', 'practice', 'daily'])).toBe(false)
  })

  it('rejects duplicates', () => {
    expect(isValidHomeCardOrder(['journey', 'journey', 'daily', 'practice'])).toBe(false)
  })

  it('rejects unknown ids', () => {
    expect(isValidHomeCardOrder(['journey', 'challenge', 'daily', 'bonus'])).toBe(false)
  })

  it('rejects non-arrays', () => {
    expect(isValidHomeCardOrder('journey,challenge,daily,practice')).toBe(false)
    expect(isValidHomeCardOrder(null)).toBe(false)
    expect(isValidHomeCardOrder(undefined)).toBe(false)
    expect(isValidHomeCardOrder(42)).toBe(false)
  })
})
