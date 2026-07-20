'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DM_Sans } from 'next/font/google'
import { useIdentity } from '@/hooks/useIdentity'
import { supabaseBrowser } from '@/core/supabaseBrowser'
import TopBar from '@/components/layout/TopBar'
import { NavModal } from '@/components/NavModal'
import styles from './help.module.css'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '700'] })

/* ---------- Static config (icons + gradients only — no user-facing strings) ---------- */

type QuickLink = { id: string; icon: string; titleKey: string; blurbKey: string }
type Step = { id: string; titleKey: string; blurbKey: string }
type GameMode = {
  key: string
  titleKey: string
  subKey: string
  descKey: string
  featuresKey: string
  gradient: string
}
type Category = { id: string; icon: string; titleKey: string; descKey: string }
type FaqItem = { id: string; qKey: string; aKey: string }
type Shortcut = { key: string; actionKey: string }
type Trouble = { id: string; problemKey: string; solutionKey: string }
type GsStep = { num: string; titleKey: string; descKey: string }

const QUICK_LINKS: QuickLink[] = [
  { id: 'gs-heading', icon: '🚀', titleKey: 'ql_gs_title', blurbKey: 'ql_gs_blurb' },
  { id: 'steps-heading', icon: '🎯', titleKey: 'ql_steps_title', blurbKey: 'ql_steps_blurb' },
  { id: 'faq-heading', icon: '🏆', titleKey: 'ql_faq_title', blurbKey: 'ql_faq_blurb' },
  { id: 'gm-heading', icon: '👥', titleKey: 'ql_mp_title', blurbKey: 'ql_mp_blurb' },
]

const GS_STEPS: GsStep[] = [
  { num: '01', titleKey: 'gs_01_title', descKey: 'gs_01_desc' },
  { num: '02', titleKey: 'gs_02_title', descKey: 'Start with Practice mode to learn the ropes. The timer is optional (15 s–5 min), and you have unlimited retries—just explore and get comfortable.' },
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
    key: 'practice',
    titleKey: 'practice',
    subKey: 'solo_warmup',
    descKey: 'Hone your skills with unlimited practice games. The timer is optional and filters are fully customizable.',
    featuresKey: 'Optional timer (15 s–5 min), Unlimited retries, Custom era and region filters, Instant feedback',
    gradient: 'linear-gradient(135deg, #7c3008, #ea6820)',
  },
  {
    key: 'daily',
    titleKey: 'daily_challenge',
    subKey: 'same_events',
    descKey: 'gm_daily_desc',
    featuresKey: 'gm_daily_features',
    gradient: 'linear-gradient(135deg, #7a0a0a, #c81818)',
  },
  {
    key: 'compete',
    titleKey: 'compete',
    subKey: 'play_with_friends',
    descKey: 'gm_compete_desc',
    featuresKey: 'gm_compete_features',
    gradient: 'linear-gradient(135deg, #22d3ee, #0891b2)',
  },
]

const CATEGORIES: Category[] = [
  { id: 'c1', icon: '🗺️', titleKey: 'cat_placing', descKey: 'cat_placing_desc' },
  { id: 'c2', icon: '📅', titleKey: 'cat_year', descKey: 'cat_year_desc' },
  { id: 'c3', icon: '💡', titleKey: 'cat_hints', descKey: 'Hints are free, not purchased. Each hint tier reduces the relevant raw accuracy by a percentage: tier 1 = 10%, tier 2 = 20%, tier 3 = 30%, tier 4 = 40%, tier 5 = 50%. Penalties are applied proportionally and capped at 100%, so a hint can never reduce a score below 0%.' },
  { id: 'c4', icon: '🥇', titleKey: 'cat_badges', descKey: 'cat_badges_desc' },
  { id: 'c5', icon: '⚙️', titleKey: 'cat_account', descKey: 'cat_account_desc' },
  { id: 'c6', icon: '🔔', titleKey: 'cat_notifications', descKey: 'cat_notifications_desc' },
  { id: 'c7', icon: '🏆', titleKey: 'Rank & Progression', descKey: 'Your total XP unlocks 10 rank tiers, from Wanderer (0 XP) to Cartographer Royal (2,500,000 XP). Ranks are derived from your stats and are never stored separately.' },
  { id: 'c8', icon: '🌍', titleKey: 'Era & Region Filters', descKey: 'Hosts can filter events by era—Ancient, Medieval, Early Modern, Modern, Contemporary—and by world region: Africa, Antarctica, Asia, Europe, North America, Oceania, South America. Only events matching the selected filters will appear in the game.' },
  { id: 'c9', icon: '⏱️', titleKey: 'Results Auto-Advance', descKey: 'After everyone submits, results are shown and the game automatically moves to the next round. The default wait is 90 seconds; hosts can set it from 0 to 300 seconds.' },
  { id: 'c10', icon: '⏳', titleKey: 'Relax Deadlines', descKey: 'In Relax (turn-based) mode, each player has up to 14 days to take a turn. The host sets the deadline when creating the game.' },
]

const FAQ: FaqItem[] = [
  { id: 'f1', qKey: 'faq_q1', aKey: 'Each round gives up to 200 XP: up to 100 for WHERE and 100 for WHEN. Location accuracy is 100 * exp(-distanceKm / 1500), capped at 20,000 km. Year accuracy is 100 * exp(-effectiveYearDiff / 40), where effectiveYearDiff is your year gap divided by an era scale (sqrt((referenceYear - eventYear) / 50), with a minimum age of 50 years). Hint penalties are then applied proportionally to the raw scores.' },
  { id: 'f2', qKey: 'faq_q2', aKey: 'faq_a2' },
  { id: 'f3', qKey: 'faq_q3', aKey: 'Practice is a solo warm-up with an optional timer and unlimited retries. Daily Challenge offers the same events for everyone every 24 hours with a global leaderboard. Compete lets you face friends in real-time Rush or turn-based Relax matches. Level Up is planned but not yet available.' },
  { id: 'f4', qKey: 'faq_q4', aKey: 'Hints are free. Each hint belongs to one of five tiers and reduces the relevant raw accuracy by a percentage: tier 1 = 10%, tier 2 = 20%, tier 3 = 30%, tier 4 = 40%, tier 5 = 50%. The penalty is applied proportionally, so a hint can never make a score negative. Year hints are additionally age-discounted by era scale, making older events cheaper to hint.' },
  { id: 'f5', qKey: 'faq_q5', aKey: 'faq_a5' },
  { id: 'f6', qKey: 'faq_q6', aKey: 'faq_a6' },
  { id: 'f7', qKey: 'faq_q7', aKey: 'faq_a7' },
  { id: 'f8', qKey: 'faq_q8', aKey: 'faq_a8' },
  { id: 'f9', qKey: 'faq_q9', aKey: 'faq_a9' },
  { id: 'f10', qKey: 'What is the pressure clamp?', aKey: 'In Rush mode, as soon as the first player submits a guess, the round timer drops to 30 seconds for everyone still guessing. This keeps the game moving and prevents long waits.' },
]

const SHORTCUTS: Shortcut[] = [
  { key: 'Esc', actionKey: 'Close modals and the fullscreen image viewer' },
  { key: 'Enter', actionKey: 'Open the full player list in the lobby search' },
  { key: 'Tab', actionKey: 'Move focus between interactive controls' },
]

const TROUBLESHOOTING: Trouble[] = [
  { id: 't1', problemKey: 'ts_t1_problem', solutionKey: 'ts_t1_solution' },
  { id: 't2', problemKey: 'ts_t2_problem', solutionKey: 'ts_t2_solution' },
  { id: 't3', problemKey: 'ts_t3_problem', solutionKey: 'ts_t3_solution' },
  { id: 't4', problemKey: 'ts_t4_problem', solutionKey: 'Hints are free. Tap the hint button, review the accuracy cost shown, and confirm to reveal the clue. The cost is a percentage penalty applied to your raw score.' },
  { id: 't5', problemKey: 'ts_t5_problem', solutionKey: 'Check if you used hints—each tier reduces the relevant raw accuracy by 10%-50% proportionally. Also verify your distance from the actual location and year difference. The max per round is 200 XP (100 location + 100 year).' },
]

/* ---------- Search index ---------- */
/* Each entry maps to a translatable string. We search against the resolved
   translation so the search respects the active locale. */

type SearchEntry = {
  id: string
  section: string
  title: string
  body: string
  anchor?: string
}

/* Sections that are open by default (others start collapsed on mobile). */
const DEFAULT_OPEN: string[] = ['quick', 'faq']

export default function HelpPage() {
  const router = useRouter()
  const t = useTranslations('help')
  const { playerId, displayName } = useIdentity()
  const [query, setQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<string | null>(FAQ[0]?.id ?? null)
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(DEFAULT_OPEN),
  )

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
          setXp(Number(stats.total_xp).toLocaleString('fr-FR'))
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
        }
      } catch {}
    })()
  }, [playerId])

  /* Build the search index from resolved translations. */
  const searchIndex = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = []

    GS_STEPS.forEach((s) => {
      entries.push({
        id: s.num,
        section: t('getting_started_walkthrough'),
        title: t(s.titleKey),
        body: t(s.descKey),
        anchor: 'gs-heading',
      })
    })

    STEPS.forEach((s) => {
      entries.push({
        id: s.id,
        section: t('play_four_steps'),
        title: t(s.titleKey),
        body: t(s.blurbKey),
        anchor: 'steps-heading',
      })
    })

    GAME_MODES.forEach((m) => {
      entries.push({
        id: m.key,
        section: t('game_modes'),
        title: t(m.titleKey),
        body: `${t(m.subKey)} — ${t(m.descKey)} ${t(m.featuresKey)}`,
        anchor: 'gm-heading',
      })
    })

    CATEGORIES.forEach((c) => {
      entries.push({
        id: c.id,
        section: t('browse_by_topic'),
        title: t(c.titleKey),
        body: t(c.descKey),
        anchor: 'cat-heading',
      })
    })

    FAQ.forEach((f) => {
      entries.push({
        id: f.id,
        section: t('faq_title'),
        title: t(f.qKey),
        body: t(f.aKey),
        anchor: 'faq-heading',
      })
    })

    TROUBLESHOOTING.forEach((tr) => {
      entries.push({
        id: tr.id,
        section: t('troubleshooting'),
        title: t(tr.problemKey),
        body: t(tr.solutionKey),
        anchor: 'troubleshooting-heading',
      })
    })

    return entries
  }, [t])

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

  const isSearching = results !== null

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
      <header className={styles.hero} style={{ paddingTop: 88 }}>
        <div className={styles.heroInner}>
          <div className={styles.heroHeaderRow}>
            <button
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

      {/* Sticky search bar */}
      <div className={styles.searchBar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_placeholder')}
            className={styles.searchInput}
            aria-label={t('search_label')}
          />
          {query && (
            <button
              className={styles.searchClear}
              onClick={() => setQuery('')}
              aria-label={t('clear_search')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <main className={styles.main}>
        {isSearching ? (
          /* ---------- Unified search results ---------- */
          <section className={styles.section} aria-label={t('results_for', { q: query })}>
            <h2 className={styles.sectionTitle}>
              {t('results_for', { q: query })}
            </h2>
            {results.length === 0 ? (
              <p className={styles.faqEmpty}>{t('no_results')}</p>
            ) : (
              <div className={styles.resultsList}>
                {results.map((r) => (
                  <a
                    key={`${r.id}-${r.anchor}`}
                    href={r.anchor ? `#${r.anchor}` : undefined}
                    className={styles.resultCard}
                    onClick={() => {
                      setQuery('')
                      if (r.anchor) {
                        const el = document.getElementById(r.anchor)
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    }}
                  >
                    <span className={styles.resultSection}>{r.section}</span>
                    <span className={styles.resultTitle}>{r.title}</span>
                    <span className={styles.resultBody}>{r.body}</span>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Quick links */}
            <section className={styles.section} aria-labelledby="quick-heading">
              <h2 id="quick-heading" className={styles.sectionTitle}>
                {t('quick_start')}
              </h2>
              <div className={styles.quickScroll}>
                {QUICK_LINKS.map((link) => (
                  <a key={link.id} href={`#${link.id}`} className={styles.quickCard}>
                    <span className={styles.quickIcon} aria-hidden>{link.icon}</span>
                    <span className={styles.quickTitle}>{t(link.titleKey)}</span>
                    <span className={styles.quickBlurb}>{t(link.blurbKey)}</span>
                  </a>
                ))}
              </div>
            </section>

            {/* Getting Started Walkthrough */}
            <CollapsibleSection
              id="gs"
              headingId="gs-heading"
              title={t('getting_started_walkthrough')}
              open={openSections.has('gs')}
              onToggle={() => toggleSection('gs')}
            >
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

            {/* Step-by-step */}
            <CollapsibleSection
              id="steps"
              headingId="steps-heading"
              title={t('play_four_steps')}
              open={openSections.has('steps')}
              onToggle={() => toggleSection('steps')}
            >
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
            <CollapsibleSection
              id="gm"
              headingId="gm-heading"
              title={t('game_modes')}
              open={openSections.has('gm')}
              onToggle={() => toggleSection('gm')}
            >
              <div className={styles.modeGrid}>
                {GAME_MODES.map((m) => (
                  <div key={m.key} className={styles.modeCard} style={{ background: m.gradient }}>
                    <span className={styles.modeTitle}>{t(m.titleKey)}</span>
                    <span className={styles.modeSub}>{t(m.subKey)}</span>
                    <span className={styles.modeDesc}>{t(m.descKey)}</span>
                    <ul className={styles.modeFeatures}>
                      {t(m.featuresKey).split(',').map((f, i) => (
                        <li key={i}>{f.trim()}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Categories */}
            <CollapsibleSection
              id="cat"
              headingId="cat-heading"
              title={t('browse_by_topic')}
              open={openSections.has('cat')}
              onToggle={() => toggleSection('cat')}
            >
              <div className={styles.catGrid}>
                {CATEGORIES.map((cat) => (
                  <article key={cat.id} id={cat.id} className={styles.catCard}>
                    <span className={styles.catIcon} aria-hidden>{cat.icon}</span>
                    <h3 className={styles.catTitle}>{t(cat.titleKey)}</h3>
                    <p className={styles.catText}>{t(cat.descKey)}</p>
                    <span className={styles.catLink}>{t('cat_read_more')} →</span>
                  </article>
                ))}
              </div>
            </CollapsibleSection>

            {/* FAQ */}
            <section className={styles.section} aria-labelledby="faq-heading">
              <h2 id="faq-heading" className={styles.sectionTitle}>
                {t('faq_title')}
              </h2>
              <div className={styles.faqList}>
                {FAQ.map((item) => {
                  const open = openFaq === item.id
                  return (
                    <div
                      key={item.id}
                      className={`${styles.faqItem} ${open ? styles.faqItemOpen : ''}`}
                    >
                      <button
                        className={styles.faqQuestion}
                        onClick={() => setOpenFaq(open ? null : item.id)}
                        aria-expanded={open}
                      >
                        <span>{t(item.qKey)}</span>
                        <span className={styles.faqChevron} aria-hidden>
                          {open ? '−' : '+'}
                        </span>
                      </button>
                      {open && <p className={styles.faqAnswer}>{t(item.aKey)}</p>}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Keyboard Shortcuts */}
            <CollapsibleSection
              id="kb"
              headingId="shortcuts-heading"
              title={t('keyboard_shortcuts')}
              open={openSections.has('kb')}
              onToggle={() => toggleSection('kb')}
            >
              <div className={styles.shortcutsGrid}>
                {SHORTCUTS.map((shortcut, i) => (
                  <div key={i} className={styles.shortcutItem}>
                    <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
                    <span className={styles.shortcutAction}>{t(shortcut.actionKey)}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Troubleshooting */}
            <CollapsibleSection
              id="ts"
              headingId="troubleshooting-heading"
              title={t('troubleshooting')}
              open={openSections.has('ts')}
              onToggle={() => toggleSection('ts')}
            >
              <div className={styles.troubleList}>
                {TROUBLESHOOTING.map((item) => (
                  <div key={item.id} className={styles.troubleItem}>
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

        {/* Back to Top */}
        <button
          className={styles.backToTop}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
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
