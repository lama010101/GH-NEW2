// Legacy exports - kept for backward compatibility
export const CARD_GRADIENT: Record<string, string> = {
  daily:    'linear-gradient(180deg, #FF0A68 0%, #E1005A 45%, #B80042 100%)',
  practice: 'linear-gradient(180deg, #fcd34d 0%, #f97316 60%, #ea580c 100%)',
  levelup:  'linear-gradient(180deg, #f9a8d4 0%, #e879f9 40%, #7c3aed 100%)',
  compete:  'linear-gradient(180deg, #45fff0 0%, #00adc1 100%)',
}
export const CARD_NAME: Record<string, string> = {
  daily: 'Daily', practice: 'Practice', levelup: 'Level Up', compete: 'Compete'
}
export const CARD_SUB: Record<string, string> = {
  daily: "Today's challenge", practice: 'Solo warm-up', levelup: 'Progressive runs', compete: 'Friends lobby'
}
export const MODES = ['daily', 'practice', 'levelup', 'compete'] as const
export type Mode = typeof MODES[number]

// New vertical card layout exports (MP-UI-HOME-008)
export const MODE_CARD_GRADIENT: Record<string, string> = {
  compete:  'linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)',
  daily:    'linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%)',
  levelup:  'linear-gradient(135deg, #2d1060 0%, #5b21b6 50%, #7c3aed 100%)',
  practice: 'linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)',
}

export const MODE_CARD_TITLE: Record<string, string> = {
  compete:  'CHALLENGE',
  daily:    'DAILY',
  levelup:  'LEVEL UP',
  practice: 'PRACTICE',
}

export const MODE_CARD_SUBTITLE: Record<string, string> = {
  compete:  'Play with your friends.\nReal-time or Turn-based',
  daily:    'Same events.\nRank worldwide',
  levelup:  'Climb levels.\nEarn experience XP.',
  practice: 'Play solo.\nUnlimited',
}

// Card order for vertical layout (top to bottom)
export const VERTICAL_CARD_ORDER: Mode[] = ['compete', 'daily', 'practice', 'levelup']
