'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

const SECTIONS = [
  { id: 'mission', labelKey: 'mission' },
  { id: 'vision', labelKey: 'vision' },
  { id: 'product', labelKey: 'product' },
  { id: 'market', labelKey: 'market' },
  { id: 'business-model', labelKey: 'business' },
  { id: 'governance', labelKey: 'governance' },
  { id: 'contributors', labelKey: 'join' },
  { id: 'roadmap', labelKey: 'roadmap' },
  { id: 'faq', labelKey: 'join' },
]

export default function GrowStickyNav() {
  const t = useTranslations('grow')
  const [active, setActive] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.5)
      const sections = SECTIONS.map((s) => ({
        id: s.id,
        el: document.getElementById(s.id),
      })).filter((s): s is { id: string; el: HTMLElement } => !!s.el)
      const scrollPos = window.scrollY + 100
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        if (sections[i].el.offsetTop <= scrollPos) {
          setActive(sections[i].id)
          break
        }
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav
      aria-label="Grow page sections"
      className={`sticky top-0 z-50 w-full border-b border-[var(--gh-border-subtle)] bg-[var(--gh-bg-base)]/90 backdrop-blur transition-transform ${visible ? 'translate-y-0' : '-translate-y-full'}`}
    >
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            data-analytics={`grow-nav-${s.id}`}
            className={`whitespace-nowrap rounded-[var(--gh-radius-pill)] px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-orange)] ${
              active === s.id
                ? 'bg-[var(--gh-orange)] text-[var(--gh-btn-text)]'
                : 'text-[var(--gh-text-secondary)] hover:bg-[var(--gh-bg-surface)]'
            }`}
          >
            {t(s.labelKey === 'mission' ? 'mission.title' : s.labelKey === 'vision' ? 'vision.title' : s.labelKey === 'product' ? 'product.title' : s.labelKey === 'market' ? 'market.title' : s.labelKey === 'business' ? 'business_model.title' : s.labelKey === 'governance' ? 'governance.title' : s.labelKey === 'join' ? 'contributors.title' : 'roadmap.title')}
          </button>
        ))}
      </div>
    </nav>
  )
}
