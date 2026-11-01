import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..', '..')
const LOCALES = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh', 'ar']

const load = (loc: string) =>
  JSON.parse(readFileSync(resolve(ROOT, 'src/i18n', `${loc}.json`), 'utf8'))

const enLanding: Record<string, string> = load('en').landing

/* All lp_* keys used by the landing page (must equal the lp_* set in en.landing) */
const LP_KEYS = [
  'lp_nav_aria', 'lp_nav_how', 'lp_nav_modes', 'lp_nav_explore', 'lp_nav_ai',
  'lp_nav_faq', 'lp_nav_back_top', 'lp_menu_open', 'lp_menu_close', 'lp_play_now',
  'lp_hero_aria', 'lp_hero_eyebrow', 'lp_hero_headline', 'lp_hero_tagline',
  'lp_trust_free', 'lp_trust_no_download', 'lp_trust_ai', 'lp_hero_how',
  'lp_slide_aria', 'lp_scroll',
  'lp_how_eyebrow', 'lp_how_title', 'lp_how_sub',
  'lp_step1_title', 'lp_step1_desc', 'lp_step2_title', 'lp_step2_desc',
  'lp_step3_title', 'lp_step3_desc',
  'lp_demo_scene_alt', 'lp_demo_where_guess', 'lp_demo_when_alt',
  'lp_demo_when_guess', 'lp_demo_reveal_title', 'lp_demo_badge_alt',
  'lp_demo_fact', 'lp_demo_phase_aria',
  'lp_phase1_title', 'lp_phase1_body', 'lp_phase2_title', 'lp_phase2_body',
  'lp_phase3_title', 'lp_phase3_body', 'lp_phase4_title', 'lp_phase4_body',
  'lp_modes_eyebrow', 'lp_modes_title', 'lp_modes_sub',
  'lp_cards_eyebrow', 'lp_cards_title', 'lp_cards_sub', 'lp_example_round',
  'lp_step_where', 'lp_step_when', 'lp_step_why', 'lp_why_title', 'lp_why_body',
  'lp_explore_eyebrow', 'lp_explore_title', 'lp_explore_sub',
  'lp_eras_label', 'lp_regions_label',
  'lp_era_ancient', 'lp_era_medieval', 'lp_era_earlymodern', 'lp_era_modern',
  'lp_era_contemporary',
  'lp_region_africa', 'lp_region_asia', 'lp_region_europe',
  'lp_region_north_america', 'lp_region_south_america',
  'lp_region_oceania_antarctica',
  'lp_fun_eyebrow', 'lp_fun_title_a', 'lp_fun_title_b', 'lp_fun_title_c',
  'lp_fun_sub', 'lp_badges_title', 'lp_badge_year', 'lp_badge_location',
  'lp_badge_combo', 'lp_tiers_title',
  'lp_tier_expert', 'lp_tier_skilled', 'lp_tier_apprentice', 'lp_tier_beginner',
  'lp_ranks_title', 'lp_rank_wanderer', 'lp_rank_pathfinder',
  'lp_rank_trailblazer', 'lp_rank_cartographer', 'lp_rank_explorer',
  'lp_xp_title', 'lp_xp_hint', 'lp_example',
  'lp_avatars_title', 'lp_avatars_desc', 'lp_born', 'lp_died',
  'lp_avatar_show_aria',
  'lp_avatar_einstein_desc', 'lp_avatar_curie_desc', 'lp_avatar_mandela_desc',
  'lp_avatar_lovelace_desc', 'lp_avatar_darwin_desc',
  'lp_ai_eyebrow', 'lp_ai_title_a', 'lp_ai_title_b', 'lp_ai_sub',
  'lp_pipe1_label', 'lp_pipe1_desc', 'lp_pipe2_label', 'lp_pipe2_desc',
  'lp_pipe3_label', 'lp_pipe3_desc', 'lp_pipe4_label', 'lp_pipe4_desc',
  'lp_ai_note',
  'lp_lb_eyebrow', 'lp_lb_title', 'lp_lb_sub', 'lp_example_preview',
  'lp_lb_overall', 'lp_lb_daily', 'lp_lb_levelup', 'lp_lb_today',
  'lp_lb_alltime', 'lp_lb_humans', 'lp_lb_ai', 'lp_lb_friends',
  'lp_lb_you_rank', 'lp_lb_empty', 'lp_lb_player', 'lp_lb_accuracy',
  'lp_lb_games', 'lp_lb_level', 'lp_lb_rounds_won', 'lp_lb_games_played',
  'lp_lb_level_n', 'lp_lb_lvl',
  'lp_faq_eyebrow', 'lp_faq_title', 'lp_faq_sub',
  'lp_faq_ai_q', 'lp_faq_ai_a', 'lp_faq_free_q', 'lp_faq_free_a',
  'lp_final_eyebrow', 'lp_final_title', 'lp_final_sub',
  'lp_footer_disc', 'lp_footer_help', 'lp_footer_privacy', 'lp_footer_terms',
  'lp_footer_copy',
]

/* Legacy landing keys still consumed by TopBar.tsx, WaitlistForm.tsx, page.tsx metadata */
const LEGACY_KEYS = [
  'meta_title', 'meta_description', 'logo_alt', 'rank_label', 'tagline',
  'hero_description', 'waitlist_prompt', 'waitlist_email_placeholder',
  'waitlist_submit', 'waitlist_submitting', 'waitlist_success',
  'waitlist_already', 'waitlist_err_invalid_email', 'waitlist_err_generic',
  'waitlist_err_network',
]

/* ICU placeholder names: {name} and {name, ...} (plural/select bodies use bare #) */
const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]).sort()

describe('landing i18n', () => {
  it('LP_KEYS matches the lp_* key set in en.landing', () => {
    const lpKeys = Object.keys(enLanding).filter((k) => k.startsWith('lp_')).sort()
    expect([...LP_KEYS].sort()).toEqual(lpKeys)
  })

  for (const loc of LOCALES) {
    it(`${loc}: every lp_* key exists, is non-empty, != key, placeholders match en`, () => {
      const landing = load(loc).landing
      for (const k of LP_KEYS) {
        const v = landing[k]
        expect(typeof v, `${loc}.${k}`).toBe('string')
        expect(v.trim().length, `${loc}.${k}`).toBeGreaterThan(0)
        expect(v, `${loc}.${k}`).not.toBe(k)
        expect(placeholders(v), `${loc}.${k}`).toEqual(placeholders(enLanding[k]))
      }
    })

    it(`${loc}: legacy landing keys still exist`, () => {
      const landing = load(loc).landing
      for (const k of LEGACY_KEYS) {
        expect(landing[k], `${loc}.${k}`).toBeDefined()
      }
    })
  }
})
