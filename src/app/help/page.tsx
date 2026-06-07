'use client'

import { useMemo, useState } from 'react'
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

const LOREM_SHORT =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.'

const LOREM_LONG =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'

const QUICK_LINKS: QuickLink[] = [
  { id: 'q1', icon: '🚀', title: 'Getting Started', blurb: LOREM_SHORT },
  { id: 'q2', icon: '🎯', title: 'How to Play', blurb: LOREM_SHORT },
  { id: 'q3', icon: '🏆', title: 'Scoring & XP', blurb: LOREM_SHORT },
  { id: 'q4', icon: '👥', title: 'Multiplayer', blurb: LOREM_SHORT },
]

const CATEGORIES: Category[] = [
  { id: 'c1', icon: '🗺️', title: 'Placing Your Guess', description: LOREM_LONG },
  { id: 'c2', icon: '📅', title: 'Choosing the Year', description: LOREM_LONG },
  { id: 'c3', icon: '💡', title: 'Using Hints', description: LOREM_LONG },
  { id: 'c4', icon: '🥇', title: 'Badges & Rewards', description: LOREM_LONG },
  { id: 'c5', icon: '⚙️', title: 'Account & Settings', description: LOREM_LONG },
  { id: 'c6', icon: '🔔', title: 'Notifications', description: LOREM_LONG },
]

const FAQ: FaqItem[] = [
  { id: 'f1', question: 'Lorem ipsum dolor sit amet?', answer: LOREM_LONG },
  { id: 'f2', question: 'Consectetur adipiscing elit?', answer: LOREM_LONG },
  { id: 'f3', question: 'Sed do eiusmod tempor incididunt?', answer: LOREM_LONG },
  { id: 'f4', question: 'Ut enim ad minim veniam?', answer: LOREM_LONG },
  { id: 'f5', question: 'Quis nostrud exercitation ullamco?', answer: LOREM_LONG },
]

const STEPS = [
  { id: 's1', title: 'Observe', blurb: LOREM_SHORT },
  { id: 's2', title: 'Locate', blurb: LOREM_SHORT },
  { id: 's3', title: 'Date It', blurb: LOREM_SHORT },
  { id: 's4', title: 'Submit', blurb: LOREM_SHORT },
]

export default function HelpPage() {
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
          <span className={styles.kicker}>Help Center</span>
          <h1 className={styles.heroTitle}>How can we help?</h1>
          <p className={styles.heroSubtitle}>{LOREM_SHORT}</p>

          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden>🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the help center…"
              className={styles.searchInput}
              aria-label="Search the help center"
            />
            {query && (
              <button
                className={styles.searchClear}
                onClick={() => setQuery('')}
                aria-label="Clear search"
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

        {/* Contact CTA */}
        <section className={styles.contact} aria-labelledby="contact-heading">
          <h2 id="contact-heading" className={styles.contactTitle}>
            Still need help?
          </h2>
          <p className={styles.contactText}>{LOREM_SHORT}</p>
          <div className={styles.contactActions}>
            <button className={styles.contactPrimary}>Contact Support</button>
            <button className={styles.contactSecondary}>Join Community</button>
          </div>
        </section>
      </main>
    </div>
  )
}
