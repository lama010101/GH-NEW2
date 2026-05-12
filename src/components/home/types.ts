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
