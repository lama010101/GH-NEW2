'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { DM_Sans } from 'next/font/google'
import { useIdentity } from '@/hooks/useIdentity'
import { updateCachedDisplayName, updateCachedAvatarUrl } from '@/core/identity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import { calculateLocationAccuracy, calculateYearAccuracy } from '@/core/rules'
import { TIER_PENALTY_RATE } from '@/core/hintPenalties'
import { formatDistance, getDistanceUnitPreference, type DistanceUnit } from '@/lib/distance'
import TopBar from '@/components/layout/TopBar'
import { NavModal } from '@/components/NavModal'
import styles from './help.module.css'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '700'] })

/* ---------- Static config (no user-facing strings — keys only) ---------- */

type SectionNav = { id: string; headingId: string; titleKey: string }
type Step = { id: string; titleKey: string; blurbKey: string }
type GameMode = {
  key: string
  titleKey: string
  subKey: string
  descKey: string
  featuresKey: string
  gradient: string
}
type FaqItem = { id: string; qKey: string; aKey: string }
type Trouble = { id: string; problemKey: string; solutionKey: string }
type GsStep = { num: string; titleKey: string; descKey: string }
type HintRow = { tier: number; labelKey: string; descKey: string }
type AccountCard = { id: string; titleKey: string; descKey: string }

const SECTIONS: SectionNav[] = [
  { id: 'gs', headingId: 'gs-heading', titleKey: 'getting_started_walkthrough' },
  { id: 'steps', headingId: 'steps-heading', titleKey: 'play_four_steps' },
  { id: 'gm', headingId: 'gm-heading', titleKey: 'game_modes' },
  { id: 'scoring', headingId: 'scoring-heading', titleKey: 'scoring_title' },
  { id: 'hints', headingId: 'hints-heading', titleKey: 'hints_title' },
  { id: 'badges', headingId: 'badges-heading', titleKey: 'badges_title' },
  { id: 'account', headingId: 'account-heading', titleKey: 'account_title' },
  { id: 'faq', headingId: 'faq-heading', titleKey: 'faq_title' },
  { id: 'ts', headingId: 'troubleshooting-heading', titleKey: 'troubleshooting' },
]

const GS_STEPS: GsStep[] = [
  { num: '01', titleKey: 'gs_01_title', descKey: 'gs_01_desc' },
  { num: '02', titleKey: 'gs_02_title', descKey: 'gs_02_desc' },
  { num: '03', titleKey: 'gs_03_title', descKey: 'gs_03_desc' },
  { num: '04', titleKey: 'gs_04_title', descKey: 'gs_04_desc' },
]

const STEPS: Step[] = [
  { id: 's1', titleKey: 'step_observe', blurbKey: 'step_observe_blurb' },
  { id: 's2', titleKey: 'step_locate', blurbKey: 'step_locate_blurb' },
  { id: 's3', titleKey: 'step_date', blurbKey: 'step_date_blurb' },
  { id: 's4', titleKey: 'step_submit', blurbKey: 'step_submit_blurb' },
]

const GAME_MODES: GameMode[] = [
  {
    key: 'daily',
    titleKey: 'gm_daily_title',
    subKey: 'gm_daily_sub',
    descKey: 'gm_daily_desc',
    featuresKey: 'gm_daily_features',
    gradient: 'linear-gradient(135deg, #7a0a0a, #c81818)',
  },
  {
    key: 'journey',
    titleKey: 'gm_journey_title',
    subKey: 'gm_journey_sub',
    descKey: 'gm_journey_desc',
    featuresKey: 'gm_journey_features',
    gradient: 'linear-gradient(135deg, #2d1060, #7c3aed)',
  },
  {
    key: 'practice',
    titleKey: 'gm_practice_title',
    subKey: 'gm_practice_sub',
    descKey: 'gm_practice_desc',
    featuresKey: 'gm_practice_features',
    gradient: 'linear-gradient(135deg, #7c3008, #ea6820)',
  },
  {
    key: 'challenge',
    titleKey: 'gm_challenge_title',
    subKey: 'gm_challenge_sub',
    descKey: 'gm_challenge_desc',
    featuresKey: 'gm_challenge_features',
    gradient: 'linear-gradient(135deg, #0891b2, #155e75)',
  },
]

const WHEN_HINTS: HintRow[] = [
  { tier: 1, labelKey: 'hint_century', descKey: 'hint_desc_broad_era' },
  { tier: 2, labelKey: 'hint_historical_event', descKey: 'hint_desc_nearby_event' },
  { tier: 3, labelKey: 'hint_decade', descKey: 'hint_desc_decade_window' },
  { tier: 4, labelKey: 'hint_contemporary_event', descKey: 'hint_desc_dated_event' },
  { tier: 5, labelKey: 'hint_visual_clues', descKey: 'hint_desc_era_scene' },
]

const WHERE_HINTS: HintRow[] = [
  { tier: 1, labelKey: 'hint_continent', descKey: 'hint_desc_broad_region' },
  { tier: 2, labelKey: 'hint_remote_landmark', descKey: 'hint_desc_distant_landmark' },
  { tier: 3, labelKey: 'hint_region', descKey: 'hint_desc_admin_region' },
  { tier: 4, labelKey: 'hint_nearby_landmark', descKey: 'hint_desc_nearby_landmark' },
  { tier: 5, labelKey: 'hint_visual_clues', descKey: 'hint_desc_location_scene' },
]

const sortHints = (rows: HintRow[]) =>
  [...rows].sort((a, b) => {
    const diff = TIER_PENALTY_RATE[a.tier] - TIER_PENALTY_RATE[b.tier]
    return diff !== 0 ? diff : a.tier - b.tier
  })

const WHERE_KM_ROWS = [10, 100, 500, 1000, 3000]
const WHEN_YEAR_ROWS = [1, 5, 10, 25, 50]
const WHEN_EVENT_YEARS = [1950, 1500]

const BADGE_TIERS = [
  { key: 'gold', labelKey: 'badges_gold', rangeKey: 'badges_gold_range', className: 'badgeGold' },
  { key: 'silver', labelKey: 'badges_silver', rangeKey: 'badges_silver_range', className: 'badgeSilver' },
  { key: 'bronze', labelKey: 'badges_bronze', rangeKey: 'badges_bronze_range', className: 'badgeBronze' },
] as const

const ACCOUNT_CARDS: AccountCard[] = [
  { id: 'acc-account', titleKey: 'acc_account_title', descKey: 'acc_account_desc' },
  { id: 'acc-settings', titleKey: 'acc_settings_title', descKey: 'acc_settings_desc' },
  { id: 'acc-avatar', titleKey: 'acc_avatar_title', descKey: 'acc_avatar_desc' },
  { id: 'acc-notif', titleKey: 'acc_notif_title', descKey: 'acc_notif_desc' },
]

const FAQ: FaqItem[] = [
  { id: 'f1', qKey: 'faq_q1', aKey: 'faq_a1' },
  { id: 'f2', qKey: 'faq_q2', aKey: 'faq_a2' },
  { id: 'f3', qKey: 'faq_q3', aKey: 'faq_a3' },
  { id: 'f4', qKey: 'faq_q4', aKey: 'faq_a4' },
  { id: 'f5', qKey: 'faq_q5', aKey: 'faq_a5' },
  { id: 'f6', qKey: 'faq_q6', aKey: 'faq_a6' },
  { id: 'f7', qKey: 'faq_q7', aKey: 'faq_a7' },
  { id: 'f8', qKey: 'faq_q8', aKey: 'faq_a8' },
  { id: 'f9', qKey: 'faq_q9', aKey: 'faq_a9' },
  { id: 'f10', qKey: 'faq_q10', aKey: 'faq_a10' },
]

const TROUBLESHOOTING: Trouble[] = [
  { id: 't1', problemKey: 'ts_t1_problem', solutionKey: 'ts_t1_solution' },
  { id: 't2', problemKey: 'ts_t2_problem', solutionKey: 'ts_t2_solution' },
  { id: 't3', problemKey: 'ts_t3_problem', solutionKey: 'ts_t3_solution' },
  { id: 't4', problemKey: 'ts_t4_problem', solutionKey: 'ts_t4_solution' },
  { id: 't5', problemKey: 'ts_t5_problem', solutionKey: 'ts_t5_solution' },
  { id: 't6', problemKey: 'ts_t6_problem', solutionKey: 'ts_t6_solution' },
]

const SCORING_TEXT_KEYS = [
  'sc_intro', 'sc_where_title', 'sc_where_desc', 'sc_when_title', 'sc_when_desc',
  'sc_xp_title', 'sc_xp_desc', 'sc_missing',
]
const HINTS_TEXT_KEYS = ['hints_intro', 'hints_cost', 'hints_xp']
const BADGES_TEXT_KEYS = ['badges_intro', 'badges_near_miss', 'badges_after_hints']

/* ---------- Search index ---------- */

type SearchEntry = {
  id: string
  section: string
  sectionId: string
  title: string
  body: string
  anchor?: string
}

export default function HelpPage() {
  const router = useRouter()
  const t = useTranslations('help')
  const tGame = useTranslations('game')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const { playerId, displayName } = useIdentity()
  const [query, setQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<string | null>(FAQ[0]?.id ?? null)
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(SECTIONS.map((s) => s.id)),
  )
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id)
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('km')
  const isSearching = query.trim() !== ''

  const [accuracy, setAccuracy] = useState('--')
  const [xp, setXp] = useState('--')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [initials, setInitials] = useState('PL')
  const [showNavModal, setShowNavModal] = useState(false)

  useEffect(() => {
    if (!playerId) {
      setAvatarUrl(null)
      setInitials('PL')
      setAccuracy('--')
      setXp('--')
      return
    }
    (async () => {
      try {
        const { data: stats } = await supabaseBrowser
          .from('player_global_stats')
          .select('avg_accuracy,total_xp')
          .eq('player_id', playerId)
          .single()
        if (stats) {
          setAccuracy(String(Math.round(Number(stats.avg_accuracy))))
          setXp(Number(stats.total_xp).toLocaleString(locale))
        }
      } catch {}
      try {
        const { data: profile } = await supabaseBrowser
          .from('profiles')
          .select('display_name,avatar_url')
          .eq('id', playerId)
          .single()
        if (profile) {
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url)
          if (profile.display_name) setInitials(profile.display_name.slice(0, 2).toUpperCase())
          if (profile.display_name) updateCachedDisplayName(profile.display_name)
          if (profile.avatar_url) updateCachedAvatarUrl(profile.avatar_url)
        }
      } catch {}
    })()
  }, [playerId, locale])

  /* Read the distance-unit preference client-side only (avoids hydration mismatch). */
  useEffect(() => {
    setDistanceUnit(getDistanceUnitPreference())
  }, [])

  const prefersReducedMotion = useCallback(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const scrollToAnchor = useCallback(
    (anchor: string) => {
      const el = document.getElementById(anchor)
      el?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      })
    },
    [prefersReducedMotion],
  )

  const goTo = useCallback(
    (sectionId: string, itemAnchor?: string) => {
      setOpenSections((prev) => {
        if (prev.has(sectionId)) return prev
        const next = new Set(prev)
        next.add(sectionId)
        return next
      })
      if (sectionId === 'faq' && itemAnchor?.startsWith('faq-')) {
        setOpenFaq(itemAnchor.slice(4))
      }
      setQuery('')
      const target = itemAnchor ?? SECTIONS.find((s) => s.id === sectionId)?.headingId
      if (target) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => scrollToAnchor(target))
        })
        history.replaceState(null, '', `#${target}`)
      }
    },
    [scrollToAnchor],
  )

  /* Initial deep-link from location.hash */
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    const section = SECTIONS.find((s) => s.headingId === hash)
    if (section) {
      goTo(section.id)
      return
    }
    const faqItem = FAQ.find((f) => `faq-${f.id}` === hash)
    if (faqItem) {
      goTo('faq', hash)
      return
    }
    const tsItem = TROUBLESHOOTING.find((tr) => `ts-${tr.id}` === hash)
    if (tsItem) goTo('ts', hash)
  }, [goTo])

  /* Scroll-spy on section headings (headings unmount while searching). */
  useEffect(() => {
    if (isSearching) return
    const headings = SECTIONS.map((s) => document.getElementById(s.headingId)).filter(
      (el): el is HTMLElement => !!el,
    )
    if (!headings.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          const section = SECTIONS.find((s) => s.headingId === visible[0].target.id)
          if (section) setActiveSection(section.id)
        }
      },
      { rootMargin: '-150px 0px -45% 0px', threshold: 0 },
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [isSearching])

  /* Build the search index from resolved translations. */
  const searchIndex = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = []

    GS_STEPS.forEach((s) => {
      entries.push({
        id: `gs-${s.num}`,
        section: t('getting_started_walkthrough'),
        sectionId: 'gs',
        title: t(s.titleKey),
        body: t(s.descKey),
      })
    })

    STEPS.forEach((s) => {
      entries.push({
        id: `steps-${s.id}`,
        section: t('play_four_steps'),
        sectionId: 'steps',
        title: t(s.titleKey),
        body: t(s.blurbKey),
      })
    })

    GAME_MODES.forEach((m) => {
      entries.push({
        id: `gm-${m.key}`,
        section: t('game_modes'),
        sectionId: 'gm',
        title: t(m.titleKey),
        body: `${t(m.subKey)} — ${t(m.descKey)} ${t(m.featuresKey).split('|').join(' ')}`,
      })
    })

    SCORING_TEXT_KEYS.forEach((k) => {
      entries.push({
        id: `scoring-${k}`,
        section: t('scoring_title'),
        sectionId: 'scoring',
        title: t(k),
        body: '',
      })
    })

    HINTS_TEXT_KEYS.forEach((k) => {
      entries.push({
        id: `hints-${k}`,
        section: t('hints_title'),
        sectionId: 'hints',
        title: t(k),
        body: '',
      })
    })
    ;[...WHEN_HINTS, ...WHERE_HINTS].forEach((h) => {
      entries.push({
        id: `hints-${h.descKey}`,
        section: t('hints_title'),
        sectionId: 'hints',
        title: tGame(h.labelKey),
        body: tGame(h.descKey),
      })
    })

    BADGES_TEXT_KEYS.forEach((k) => {
      entries.push({
        id: `badges-${k}`,
        section: t('badges_title'),
        sectionId: 'badges',
        title: t(k),
        body: '',
      })
    })
    BADGE_TIERS.forEach((b) => {
      entries.push({
        id: `badges-${b.key}`,
        section: t('badges_title'),
        sectionId: 'badges',
        title: t(b.labelKey),
        body: t(b.rangeKey),
      })
    })

    ACCOUNT_CARDS.forEach((c) => {
      entries.push({
        id: c.id,
        section: t('account_title'),
        sectionId: 'account',
        title: t(c.titleKey),
        body: t(c.descKey),
      })
    })

    FAQ.forEach((f) => {
      entries.push({
        id: f.id,
        section: t('faq_title'),
        sectionId: 'faq',
        title: t(f.qKey),
        body: t(f.aKey),
        anchor: `faq-${f.id}`,
      })
    })

    TROUBLESHOOTING.forEach((tr) => {
      entries.push({
        id: tr.id,
        section: t('troubleshooting'),
        sectionId: 'ts',
        title: t(tr.problemKey),
        body: t(tr.solutionKey),
        anchor: `ts-${tr.id}`,
      })
    })

    return entries
  }, [t, tGame])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return searchIndex.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        e.section.toLowerCase().includes(q),
    )
  }, [query, searchIndex])

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const referenceYear = new Date().getFullYear()

  const openSection = (id: string) => openSections.has(id)
  const sectionProps = (id: string) => {
    const s = SECTIONS.find((x) => x.id === id)!
    return {
      id: s.id,
      headingId: s.headingId,
      title: t(s.titleKey),
      open: openSection(id),
      onToggle: () => toggleSection(id),
    }
  }

  return (
    <div className={`${dmSans.className} ${styles.page}`}>
      <TopBar
        accuracy={accuracy}
        xp={xp}
        avatarUrl={avatarUrl}
        initials={initials}
        onAvatarClick={() => setShowNavModal(true)}
      />

      {/* Hero */}
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroHeaderRow}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => router.back()}
              aria-label={t('go_back')}
            >
              ←
            </button>
            <span className={styles.kicker}>{t('title')}</span>
          </div>
          <h1 className={styles.heroTitle}>{t('hero_title')}</h1>
          <p className={styles.heroSubtitle}>{t('hero_subtitle')}</p>
        </div>
      </header>

      {/* Sticky bar: search + topic chips */}
      <div className={styles.stickyBar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
            }}
            placeholder={t('search_placeholder')}
            className={styles.searchInput}
            aria-label={t('search_label')}
          />
          {query && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setQuery('')}
              aria-label={t('clear_search')}
            >
              ✕
            </button>
          )}
        </div>
        {!isSearching && (
          <nav className={styles.chipNav} aria-label={t('nav_label')}>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.headingId}`}
                className={`${styles.chip} ${activeSection === s.id ? styles.chipActive : ''}`}
                aria-current={activeSection === s.id ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  goTo(s.id)
                }}
              >
                {t(s.titleKey)}
              </a>
            ))}
          </nav>
        )}
      </div>

      <main className={styles.main}>
        {isSearching ? (
          /* ---------- Search results ---------- */
          <section className={styles.section} aria-label={t('results_for', { q: query })}>
            <h2 className={styles.sectionTitle}>
              {t('results_for', { q: query })}
            </h2>
            <p className={styles.resultsCount}>{t('results_count', { count: (results ?? []).length })}</p>
            {(results ?? []).length === 0 ? (
              <p className={styles.faqEmpty}>{t('no_results')}</p>
            ) : (
              <div className={styles.resultsList}>
                {(results ?? []).map((r) => (
                  <a
                    key={r.id}
                    href={`#${r.anchor ?? SECTIONS.find((s) => s.id === r.sectionId)?.headingId}`}
                    className={styles.resultCard}
                    onClick={(e) => {
                      e.preventDefault()
                      goTo(r.sectionId, r.anchor)
                    }}
                  >
                    <span className={styles.resultSection}>{r.section}</span>
                    <span className={styles.resultTitle}>{r.title}</span>
                    {r.body && <span className={styles.resultBody}>{r.body}</span>}
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Getting Started */}
            <CollapsibleSection {...sectionProps('gs')}>
              <div className={styles.gsTimeline}>
                {GS_STEPS.map((step) => (
                  <div key={step.num} className={styles.gsStep}>
                    <span className={styles.gsNum}>{step.num}</span>
                    <div className={styles.gsBody}>
                      <span className={styles.gsTitle}>{t(step.titleKey)}</span>
                      <span className={styles.gsDesc}>{t(step.descKey)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* How to play */}
            <CollapsibleSection {...sectionProps('steps')}>
              <ol className={styles.steps}>
                {STEPS.map((step, i) => (
                  <li key={step.id} className={styles.step}>
                    <span className={styles.stepNumber}>{i + 1}</span>
                    <div className={styles.stepBody}>
                      <span className={styles.stepTitle}>{t(step.titleKey)}</span>
                      <span className={styles.stepBlurb}>{t(step.blurbKey)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </CollapsibleSection>

            {/* Game Modes */}
            <CollapsibleSection {...sectionProps('gm')}>
              <div className={styles.modeGrid}>
                {GAME_MODES.map((m) => (
                  <div key={m.key} className={styles.modeCard} style={{ background: m.gradient }}>
                    <span className={styles.modeTitle}>{t(m.titleKey)}</span>
                    <span className={styles.modeSub}>{t(m.subKey)}</span>
                    <span className={styles.modeDesc}>{t(m.descKey)}</span>
                    <ul className={styles.modeFeatures}>
                      {t(m.featuresKey).split('|').map((f, i) => (
                        <li key={i}>{f.trim()}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Scoring & XP */}
            <CollapsibleSection {...sectionProps('scoring')}>
              <p className={styles.sectionIntro}>{t('sc_intro')}</p>
              <div className={styles.panelsGrid}>
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>{t('sc_where_title')}</h3>
                  <p className={styles.panelDesc}>{t('sc_where_desc')}</p>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>{t('sc_col_distance')}</th>
                        <th>{t('sc_col_accuracy')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WHERE_KM_ROWS.map((km) => (
                        <tr key={km}>
                          <td>{formatDistance(km, distanceUnit)}</td>
                          <td>{`${calculateLocationAccuracy(km)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>{t('sc_when_title')}</h3>
                  <p className={styles.panelDesc}>{t('sc_when_desc')}</p>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>{t('sc_col_years_off')}</th>
                        {WHEN_EVENT_YEARS.map((y) => (
                          <th key={y}>{t('sc_col_event_year', { year: y })}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {WHEN_YEAR_ROWS.map((n) => (
                        <tr key={n}>
                          <td>{t('sc_years_off_value', { n })}</td>
                          {WHEN_EVENT_YEARS.map((y) => (
                            <td key={y}>{`${calculateYearAccuracy(n, y, referenceYear)}%`}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <h3 className={styles.panelTitle}>{t('sc_xp_title')}</h3>
              <p className={styles.sectionIntro}>{t('sc_xp_desc')}</p>
              <p className={styles.note}>{t('sc_missing')}</p>
            </CollapsibleSection>

            {/* Hints */}
            <CollapsibleSection {...sectionProps('hints')}>
              <p className={styles.sectionIntro}>{t('hints_intro')}</p>
              <div className={styles.panelsGrid}>
                {[
                  { caption: tCommon('when'), rows: sortHints(WHEN_HINTS) },
                  { caption: tCommon('where'), rows: sortHints(WHERE_HINTS) },
                ].map(({ caption, rows }) => (
                  <table key={caption} className={styles.dataTable}>
                    <caption className={styles.tableCaption}>{caption}</caption>
                    <thead>
                      <tr>
                        <th>{t('hints_col_hint')}</th>
                        <th>{t('hints_col_cost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((h) => (
                        <tr key={`${caption}-${h.tier}`}>
                          <td>
                            <span className={styles.hintLabel}>{tGame(h.labelKey)}</span>
                            <span className={styles.hintDesc}>{tGame(h.descKey)}</span>
                          </td>
                          <td className={styles.hintCost}>{`−${TIER_PENALTY_RATE[h.tier]}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
              <p className={styles.sectionIntro}>{t('hints_cost')}</p>
              <p className={styles.sectionIntro}>{t('hints_xp')}</p>
            </CollapsibleSection>

            {/* Badges */}
            <CollapsibleSection {...sectionProps('badges')}>
              <p className={styles.sectionIntro}>{t('badges_intro')}</p>
              <div className={styles.badgeRow}>
                {BADGE_TIERS.map((b) => (
                  <span key={b.key} className={`${styles.badgeChip} ${styles[b.className]}`}>
                    <span className={styles.badgeName}>{t(b.labelKey)}</span>
                    <span className={styles.badgeRange}>{t(b.rangeKey)}</span>
                  </span>
                ))}
              </div>
              <p className={styles.sectionIntro}>{t('badges_near_miss')}</p>
              <p className={styles.sectionIntro}>{t('badges_after_hints')}</p>
            </CollapsibleSection>

            {/* Account & notifications */}
            <CollapsibleSection {...sectionProps('account')}>
              <div className={styles.accountGrid}>
                {ACCOUNT_CARDS.map((c) => (
                  <article key={c.id} className={styles.accountCard}>
                    <h3 className={styles.accountTitle}>{t(c.titleKey)}</h3>
                    <p className={styles.accountDesc}>{t(c.descKey)}</p>
                  </article>
                ))}
              </div>
            </CollapsibleSection>

            {/* FAQ */}
            <CollapsibleSection {...sectionProps('faq')}>
              <div className={styles.faqList}>
                {FAQ.map((item) => {
                  const open = openFaq === item.id
                  return (
                    <div
                      key={item.id}
                      id={`faq-${item.id}`}
                      className={`${styles.faqItem} ${open ? styles.faqItemOpen : ''}`}
                    >
                      <button
                        type="button"
                        className={styles.faqQuestion}
                        onClick={() => setOpenFaq(open ? null : item.id)}
                        aria-expanded={open}
                        aria-controls={`faq-${item.id}-answer`}
                      >
                        <span>{t(item.qKey)}</span>
                        <span className={styles.faqChevron} aria-hidden>
                          {open ? '−' : '+'}
                        </span>
                      </button>
                      {open && (
                        <p id={`faq-${item.id}-answer`} className={styles.faqAnswer}>
                          {t(item.aKey)}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </CollapsibleSection>

            {/* Troubleshooting */}
            <CollapsibleSection {...sectionProps('ts')}>
              <div className={styles.troubleList}>
                {TROUBLESHOOTING.map((item) => (
                  <div key={item.id} id={`ts-${item.id}`} className={styles.troubleItem}>
                    <div className={styles.troubleProblem}>{t(item.problemKey)}</div>
                    <div className={styles.troubleSolution}>{t(item.solutionKey)}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* Contact CTA */}
        <section className={styles.contact} aria-labelledby="contact-heading">
          <h2 id="contact-heading" className={styles.contactTitle}>
            {t('still_need_help')}
          </h2>
          <p className={styles.contactText}>{t('contact_text')}</p>
          <div className={styles.contactActions}>
            <a href="mailto:support@guess-history.com" className={styles.contactPrimary}>{t('contact_support')}</a>
            <a href="https://discord.gg/guess-history" target="_blank" rel="noopener noreferrer" className={styles.contactSecondary}>{t('join_community')}</a>
          </div>
        </section>

        {/* Grow CTA */}
        <section className={styles.contact} aria-labelledby="grow-cta-heading">
          <h2 id="grow-cta-heading" className={styles.contactTitle}>
            {t('grow_cta')}
          </h2>
          <div className={styles.contactActions}>
            <button
              type="button"
              onClick={() => router.push('/grow')}
              data-analytics="help-grow-cta"
              className={styles.contactPrimary}
            >
              {t('grow_cta')}
            </button>
          </div>
        </section>

        {/* Back to Top */}
        <button
          type="button"
          className={styles.backToTop}
          onClick={() =>
            window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
          }
          aria-label={t('back_to_top')}
        >
          ↑ {t('back_to_top')}
        </button>
      </main>

      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={avatarUrl}
        initials={initials}
        displayName={displayName ?? initials}
      />
    </div>
  )
}

/* ---------- Collapsible section helper ---------- */

function CollapsibleSection({
  id,
  headingId,
  title,
  open,
  onToggle,
  children,
}: {
  id: string
  headingId: string
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section
      className={`${styles.section} ${styles.collapsible} ${open ? '' : styles.collapsed}`}
      aria-labelledby={headingId}
    >
      <button
        type="button"
        className={styles.sectionToggle}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-content`}
      >
        <h2 id={headingId} className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionChevron} aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      <div id={`${id}-content`} className={styles.sectionContent}>
        {children}
      </div>
    </section>
  )
}
