'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DM_Sans } from 'next/font/google'
import styles from './help.module.css'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '700'] })

type QuickLink = {
  id: string
  icon: string
  title: string
  blurb: string
}

type Category = {
  id: string
  icon: string
  title: string
  description: string
}

type FaqItem = {
  id: string
  question: string
  answer: string
}


const QUICK_LINKS: QuickLink[] = [
  { id: 'gs-heading', icon: '🚀', title: 'Getting Started', blurb: 'Learn the basics and start your first game in under a minute.' },
  { id: 'steps-heading', icon: '🎯', title: 'How to Play', blurb: 'Understand the map, year slider, hints, and submission flow.' },
  { id: 'faq-heading', icon: '🏆', title: 'Scoring & XP', blurb: 'See how location and time accuracy translate into points.' },
  { id: 'gm-heading', icon: '👥', title: 'Multiplayer', blurb: 'Create a lobby, invite friends, and compete in real time.' },
]

const CATEGORIES: Category[] = [
  { id: 'c1', icon: '🗺️', title: 'Placing Your Guess', description: 'Click anywhere on the world map to drop a pin. You can zoom, pan, and search for locations. The closer your pin is to the actual event location, the higher your score. You can move the pin as many times as you want before submitting.' },
  { id: 'c2', icon: '📅', title: 'Choosing the Year', description: 'Use the year slider or type directly to pick when you think the event occurred. The year range is customizable per game (default is from 400 BC to the current year). The smaller the gap between your guess and the actual year, the more points you earn.' },
  { id: 'c3', icon: '💡', title: 'Using Hints', description: 'Each round offers hints organized by tier (Basic, Advanced, Expert). Hints are independently purchasable—no dependencies required. Each hint costs accuracy and XP penalty. Use them wisely to reveal landmarks, distances, centuries, or other clues.' },
  { id: 'c4', icon: '🥇', title: 'Badges & Rewards', description: 'Earn Gold (100%), Silver (95–99%), or Bronze (90–94%) badges for Year accuracy, Location accuracy, or a balanced Combo score. Near-misses (88–89%) are shown when you just miss a badge. Badges are for instant feedback; your stats and XP are what persist.' },
  { id: 'c5', icon: '⚙️', title: 'Account & Settings', description: 'Set your display name and choose a historical figure as your avatar. View your overall accuracy, total XP, member since date, and manage your account details from the Account page.' },
  { id: 'c6', icon: '🔔', title: 'Notifications', description: 'Get notified when a friend invites you to a game, when it is your turn in an async match, or when a daily challenge resets. Tap the bell icon on the top bar to view recent activity.' },
]

const FAQ: FaqItem[] = [
  { id: 'f1', question: 'How is my score calculated?', answer: 'Each round gives you up to 200 XP: 100 for location accuracy and 100 for year accuracy. Location score decays with distance from the actual place (max 20,000 km). Year score decays with the difference from the actual year (max 200 years). Hint penalties are subtracted after the round.' },
  { id: 'f2', question: 'Can I play without an account?', answer: 'You can browse the home page, but you need an account to play games, save progress, earn XP, and compete against friends. Signing up is free and only takes a moment.' },
  { id: 'f3', question: 'What are the different game modes?', answer: 'Practice is a solo warm-up with unlimited retries. Daily Challenge offers the same events for everyone every 24 hours with a global leaderboard. Level Up is a progressive run where you beat levels to unlock harder challenges. Compete lets you face friends in real-time Blitz or turn-based Relax matches.' },
  { id: 'f4', question: 'How do hints work?', answer: 'Hints are purchased per round using accuracy debt. Each hint reveals information like nearby landmarks, country, century clues, or distances. Hints are organized by tier and are independently purchasable—no dependencies. The total hint debt is subtracted from your round score.' },
  { id: 'f5', question: 'How do multiplayer games work?', answer: 'In Compete mode, create a lobby and invite friends via a 6-character room code. You can play synchronous Blitz (timed, all players guess together) or asynchronous Relax (take turns at your own pace). Games support up to 12 players with host-controlled settings.' },
  { id: 'f6', question: 'Can I zoom into the image?', answer: 'No, the historical image cannot be zoomed. Study the photo carefully at its default size—look for architecture, clothing, vegetation, landmarks, and any visible text or flags to help you guess the location and year.' },
  { id: 'f7', question: 'What happens if the timer runs out?', answer: 'In Blitz mode, if you do not submit before the timer expires, your guess is automatically submitted at the current pin location and selected year. In Relax mode, there is no timer—take your time.' },
  { id: 'f8', question: 'Why did not my invite arrive?', answer: 'Make sure your friend has an account and is logged in. Invites appear in the notification bell. If they still do not see it, try refreshing the page or sending the room code directly via chat.' },
  { id: 'f9', question: 'How do I earn badges?', answer: 'Badges are awarded based on accuracy per round: Gold (100%), Silver (95–99%), Bronze (90–94%). You can earn Year badges, Location badges, or Combo badges when both scores are high. Near-misses at 88–89% are also shown.' },
]

const STEPS = [
  { id: 's1', title: 'Observe', blurb: 'Study the historical image and any visible clues in the photo.' },
  { id: 's2', title: 'Locate', blurb: 'Drop a pin on the map where you believe the event took place.' },
  { id: 's3', title: 'Date It', blurb: 'Set the year using the slider or by typing directly.' },
  { id: 's4', title: 'Submit', blurb: 'Lock in your guess before the timer runs out (if enabled).' },
]

const GAME_MODES = [
  {
    key: 'practice',
    title: 'Practice',
    subtitle: 'Solo warm-up',
    desc: 'Hone your skills with unlimited practice games. No pressure, no timer required.',
    features: ['Unlimited retries', 'No timer', 'Custom era filters', 'Instant feedback'],
    gradient: 'linear-gradient(135deg, #7c3008, #ea6820)',
  },
  {
    key: 'daily',
    title: 'Daily Challenge',
    subtitle: 'Same events for everyone',
    desc: 'A new challenge every day. Same events for everyone. Climb the global leaderboard.',
    features: ['24-hour window', 'Global leaderboard', 'One attempt per day', 'XP multiplier'],
    gradient: 'linear-gradient(135deg, #7a0a0a, #c81818)',
  },
  {
    key: 'levelup',
    title: 'Level Up',
    subtitle: 'Progressive runs',
    desc: 'Beat levels and earn XP to unlock harder challenges. A true test of skill.',
    features: ['Progressive difficulty', 'Unlockable content', 'Streak bonuses', 'Level-specific eras'],
    gradient: 'linear-gradient(135deg, #2d1060, #7c3aed)',
  },
  {
    key: 'compete',
    title: 'Compete',
    subtitle: 'Play with friends',
    desc: 'Real-time Blitz or turn-based Relax. Create a lobby, invite friends, compete.',
    features: ['Blitz (timed)', 'Relax (async)', 'Up to 12 players', 'Room codes'],
    gradient: 'linear-gradient(135deg, #22d3ee, #0891b2)',
  },
]

const KEYBOARD_SHORTCUTS = [
  { key: 'Space', action: 'Submit guess' },
  { key: 'H', action: 'Open hints panel' },
  { key: 'M', action: 'Toggle map zoom' },
  { key: 'Esc', action: 'Close modals / Cancel' },
  { key: '↑ / ↓', action: 'Adjust year (when focused)' },
  { key: 'Tab', action: 'Navigate between inputs' },
]

const TROUBLESHOOTING = [
  {
    id: 't1',
    problem: 'Game is not loading or stuck on black screen',
    solution: 'Try refreshing the page. If the issue persists, clear your browser cache and cookies, then reload. Ensure you are using a modern browser (Chrome, Firefox, Safari, Edge).',
  },
  {
    id: 't2',
    problem: 'My friend did not receive the invite',
    solution: 'Make sure your friend is logged in. Invites appear in the notification bell at the top right. As a fallback, copy the 6-character room code and share it directly via any messaging app.',
  },
  {
    id: 't3',
    problem: 'Timer ran out before I could submit',
    solution: 'In Blitz mode, guesses are auto-submitted when time expires. If you need more time, ask the host to disable the timer or switch to Relax mode which has no time limit.',
  },
  {
    id: 't4',
    problem: 'Hints are not showing any information',
    solution: 'Hints must be purchased before they reveal content. Click the hint button, confirm the purchase, and the information will appear. Each hint reduces your final score.',
  },
  {
    id: 't5',
    problem: 'Score seems lower than expected',
    solution: 'Check if you used hints—they apply penalties to both accuracy and XP. Also verify your distance from the actual location and year difference. The max per round is 200 XP (100 location + 100 year).',
  },
]

const GETTING_STARTED_STEPS = [
  { num: '01', title: 'Create your account', desc: 'Sign up with email or use a social login. Choose a display name and pick a historical figure as your avatar.' },
  { num: '02', title: 'Play a Practice round', desc: 'Start with Practice mode to learn the ropes. No timer, unlimited retries—just explore and get comfortable.' },
  { num: '03', title: 'Try the Daily Challenge', desc: 'Once ready, tackle the Daily Challenge. Same events as everyone else—see how you rank on the global leaderboard.' },
  { num: '04', title: 'Invite friends', desc: 'Create a Compete lobby, copy the room code, and invite friends. Choose Blitz for real-time action or Relax for turn-based play.' },
]

export default function HelpPage() {
  const router = useRouter()
  const t = useTranslations('help')
  const [query, setQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<string | null>(FAQ[0]?.id ?? null)

  const filteredFaq = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FAQ
    return FAQ.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className={`${dmSans.className} ${styles.page}`}>
      {/* Hero */}
      <header className={styles.hero}>
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
      </header>

      <main className={styles.main}>
        {/* Quick links */}
        <section className={styles.section} aria-labelledby="quick-heading">
          <h2 id="quick-heading" className={styles.sectionTitle}>
            Quick Start
          </h2>
          <div className={styles.quickGrid}>
            {QUICK_LINKS.map((link) => (
              <a key={link.id} href={`#${link.id}`} className={styles.quickCard}>
                <span className={styles.quickIcon} aria-hidden>{link.icon}</span>
                <span className={styles.quickTitle}>{link.title}</span>
                <span className={styles.quickBlurb}>{link.blurb}</span>
              </a>
            ))}
          </div>
        </section>

        {/* Getting Started Walkthrough */}
        <section className={styles.section} aria-labelledby="gs-heading">
          <h2 id="gs-heading" className={styles.sectionTitle}>
            Getting Started Walkthrough
          </h2>
          <div className={styles.gsTimeline}>
            {GETTING_STARTED_STEPS.map((step) => (
              <div key={step.num} className={styles.gsStep}>
                <span className={styles.gsNum}>{step.num}</span>
                <div className={styles.gsBody}>
                  <span className={styles.gsTitle}>{step.title}</span>
                  <span className={styles.gsDesc}>{step.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Step-by-step */}
        <section className={styles.section} aria-labelledby="steps-heading">
          <h2 id="steps-heading" className={styles.sectionTitle}>
            Play in Four Steps
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, i) => (
              <li key={step.id} className={styles.step}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <div className={styles.stepBody}>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepBlurb}>{step.blurb}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Game Modes */}
        <section className={styles.section} aria-labelledby="gm-heading">
          <h2 id="gm-heading" className={styles.sectionTitle}>
            Game Modes
          </h2>
          <div className={styles.modeGrid}>
            {GAME_MODES.map((m) => (
              <div key={m.key} className={styles.modeCard} style={{ background: m.gradient }}>
                <span className={styles.modeTitle}>{m.title}</span>
                <span className={styles.modeSub}>{m.subtitle}</span>
                <span className={styles.modeDesc}>{m.desc}</span>
                <ul className={styles.modeFeatures}>
                  {m.features.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Categories */}
        <section className={styles.section} aria-labelledby="cat-heading">
          <h2 id="cat-heading" className={styles.sectionTitle}>
            Browse by Topic
          </h2>
          <div className={styles.catGrid}>
            {CATEGORIES.map((cat) => (
              <article key={cat.id} id={cat.id} className={styles.catCard}>
                <span className={styles.catIcon} aria-hidden>{cat.icon}</span>
                <h3 className={styles.catTitle}>{cat.title}</h3>
                <p className={styles.catText}>{cat.description}</p>
                <span className={styles.catLink}>Read more →</span>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className={styles.section} aria-labelledby="faq-heading">
          <h2 id="faq-heading" className={styles.sectionTitle}>
            Frequently Asked Questions
          </h2>
          <div className={styles.faqList}>
            {filteredFaq.length === 0 && (
              <p className={styles.faqEmpty}>No results. Try another search.</p>
            )}
            {filteredFaq.map((item) => {
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
                    <span>{item.question}</span>
                    <span className={styles.faqChevron} aria-hidden>
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  {open && <p className={styles.faqAnswer}>{item.answer}</p>}
                </div>
              )
            })}
          </div>
        </section>

        {/* Keyboard Shortcuts */}
        <section className={styles.section} aria-labelledby="shortcuts-heading">
          <h2 id="shortcuts-heading" className={styles.sectionTitle}>
            Keyboard Shortcuts
          </h2>
          <div className={styles.shortcutsGrid}>
            {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
              <div key={i} className={styles.shortcutItem}>
                <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
                <span className={styles.shortcutAction}>{shortcut.action}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Troubleshooting */}
        <section className={styles.section} aria-labelledby="troubleshooting-heading">
          <h2 id="troubleshooting-heading" className={styles.sectionTitle}>
            Troubleshooting
          </h2>
          <div className={styles.troubleList}>
            {TROUBLESHOOTING.map((item) => (
              <div key={item.id} className={styles.troubleItem}>
                <div className={styles.troubleProblem}>{item.problem}</div>
                <div className={styles.troubleSolution}>{item.solution}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact CTA */}
        <section className={styles.contact} aria-labelledby="contact-heading">
          <h2 id="contact-heading" className={styles.contactTitle}>
            Still need help?
          </h2>
          <p className={styles.contactText}>Cannot find what you are looking for? Reach out and we will get back to you shortly.</p>
          <div className={styles.contactActions}>
            <a href="mailto:support@guess-history.com" className={styles.contactPrimary}>Contact Support</a>
            <a href="https://discord.gg/guess-history" target="_blank" rel="noopener noreferrer" className={styles.contactSecondary}>Join Community</a>
          </div>
        </section>

        {/* Back to Top */}
        <button
          className={styles.backToTop}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          ↑ Back to top
        </button>
      </main>
    </div>
  )
}
