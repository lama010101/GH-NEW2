// 'levelup' retired from the home card stack (replaced by 'stage',
// HOME-BUILD-STAGECARD-RANKCARD-002). The legacy CARD_* maps were removed with
// it — their only consumer was CardItem.tsx (dead code, zero live imports).
export const MODES = ['daily', 'practice', 'stage', 'compete'] as const
export type Mode = typeof MODES[number]

// New vertical card layout exports (MP-UI-HOME-008)
export const MODE_CARD_GRADIENT: Record<string, string> = {
  stage:    'linear-gradient(135deg, #172554 0%, #1d4ed8 55%, #3b82f6 100%)',
  compete:  'linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)',
  daily:    'linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%)',
  practice: 'linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)',
}

export const MODE_CARD_TITLE: Record<string, string> = {
  compete:  'CHALLENGE',
  daily:    'DAILY',
  practice: 'PRACTICE',
}

export const MODE_CARD_SUBTITLE: Record<string, string> = {
  compete:  'Play with your friends.\nReal-time or Turn-based',
  daily:    'Same events.\nRank worldwide',
  practice: 'Play solo.\nUnlimited',
}

// Card order for vertical layout (top to bottom)
export const VERTICAL_CARD_ORDER: Mode[] = ['stage', 'compete', 'daily', 'practice']
