import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..')
const LOCALES = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh', 'ar']

const load = (loc: string) =>
  JSON.parse(readFileSync(resolve(ROOT, 'src/i18n', `${loc}.json`), 'utf8'))

const enHelp: Record<string, string> = load('en').help
const enKeys = Object.keys(enHelp)

/* Keys referenced inside page.tsx via config arrays (key fields, not t('...') literals) */
const CONFIG_KEYS = [
  'getting_started_walkthrough', 'play_four_steps', 'game_modes', 'scoring_title',
  'hints_title', 'badges_title', 'account_title', 'faq_title', 'troubleshooting',
  'gs_01_title', 'gs_01_desc', 'gs_02_title', 'gs_02_desc',
  'gs_03_title', 'gs_03_desc', 'gs_04_title', 'gs_04_desc',
  'step_observe', 'step_observe_blurb', 'step_locate', 'step_locate_blurb',
  'step_date', 'step_date_blurb', 'step_submit', 'step_submit_blurb',
  'gm_daily_title', 'gm_daily_sub', 'gm_daily_desc', 'gm_daily_features',
  'gm_journey_title', 'gm_journey_sub', 'gm_journey_desc', 'gm_journey_features',
  'gm_practice_title', 'gm_practice_sub', 'gm_practice_desc', 'gm_practice_features',
  'gm_challenge_title', 'gm_challenge_sub', 'gm_challenge_desc', 'gm_challenge_features',
  'sc_intro', 'sc_where_title', 'sc_where_desc', 'sc_when_title', 'sc_when_desc',
  'sc_col_distance', 'sc_col_accuracy', 'sc_col_years_off', 'sc_col_event_year',
  'sc_years_off_value', 'sc_xp_title', 'sc_xp_desc', 'sc_missing',
  'hints_intro', 'hints_cost', 'hints_xp', 'hints_col_hint', 'hints_col_cost',
  'badges_intro', 'badges_gold', 'badges_gold_range', 'badges_silver',
  'badges_silver_range', 'badges_bronze', 'badges_bronze_range',
  'badges_near_miss', 'badges_after_hints',
  'acc_account_title', 'acc_account_desc', 'acc_settings_title', 'acc_settings_desc',
  'acc_avatar_title', 'acc_avatar_desc', 'acc_notif_title', 'acc_notif_desc',
  ...Array.from({ length: 10 }, (_, i) => [`faq_q${i + 1}`, `faq_a${i + 1}`]).flat(),
  ...Array.from({ length: 6 }, (_, i) => [
    `ts_t${i + 1}_problem`, `ts_t${i + 1}_solution`,
  ]).flat(),
]

describe('help i18n', () => {
  for (const loc of LOCALES) {
    it(`${loc}: help key set matches en`, () => {
      const keys = Object.keys(load(loc).help).sort()
      expect(keys).toEqual([...enKeys].sort())
    })
  }

  it('every help t() key used in page.tsx exists in en.help', () => {
    const src = readFileSync(resolve(ROOT, 'src/app/help/page.tsx'), 'utf8')
    const used = new Set<string>()
    for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1])
    for (const k of CONFIG_KEYS) used.add(k)
    const missing = [...used].filter((k) => !(k in enHelp))
    expect(missing).toEqual([])
  })

  for (const loc of LOCALES) {
    it(`${loc}: *_features values have same '|' segment count as en`, () => {
      const help = load(loc).help
      for (const k of enKeys.filter((k) => k.endsWith('_features'))) {
        expect(help[k].split('|').length, `${loc}.${k}`).toBe(enHelp[k].split('|').length)
      }
    })
  }
})
