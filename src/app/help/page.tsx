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
    key: 'practice',
    titleKey: 'practice',
    subKey: 'solo_warmup',
    descKey: 'gm_practice_desc',
    featuresKey: 'gm_practice_features',
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
  { id: 'c3', icon: '💡', titleKey: 'cat_hints', descKey: 'cat_hints_desc' },
  { id: 'c4', icon: '🥇', titleKey: 'cat_badges', descKey: 'cat_badges_desc' },
  { id: 'c5', icon: '⚙️', titleKey: 'cat_account', descKey: 'cat_account_desc' },
  { id: 'c6', icon: '🔔', titleKey: 'cat_notifications', descKey: 'cat_notifications_desc' },
  { id: 'c7', icon: '🏆', titleKey: 'cat_rank_progression', descKey: 'cat_rank_progression_desc' },
  { id: 'c8', icon: '🌍', titleKey: 'cat_era_region', descKey: 'cat_era_region_desc' },
  { id: 'c9', icon: '⏱️', titleKey: 'cat_results_auto_advance', descKey: 'cat_results_auto_advance_desc' },
  { id: 'c10', icon: '⏳', titleKey: 'cat_relax_deadlines', descKey: 'cat_relax_deadlines_desc' },
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

const SHORTCUTS: Shortcut[] = [
  { key: 'Esc', actionKey: 'kb_esc_action' },
  { key: 'Enter', actionKey: 'kb_enter_action' },
  { key: 'Tab', actionKey: 'kb_tab_action' },
]

const TROUBLESHOOTING: Trouble[] = [
  { id: 't1', problemKey: 'ts_t1_problem', solutionKey: 'ts_t1_solution' },
  { id: 't2', problemKey: 'ts_t2_problem', solutionKey: 'ts_t2_solution' },
  { id: 't3', problemKey: 'ts_t3_problem', solutionKey: 'ts_t3_solution' },
  { id: 't4', problemKey: 'ts_t4_problem', solutionKey: 'ts_t4_solution' },
  { id: 't5', problemKey: 'ts_t5_problem', solutionKey: 'ts_t5_solution' },
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
