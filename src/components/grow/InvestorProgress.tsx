'use client'

import { useEffect } from 'react'
import { investorContent } from '@/lib/investorContent'
import { useGrowSection } from './GrowSectionContext'

export default function InvestorProgress() {
  const { current, setCurrent } = useGrowSection()
  const total = investorContent.sections.length

  useEffect(() => {
    if (typeof window === 'undefined') return

    const sections = document.querySelectorAll('[data-section-id]')
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = entry.target.getAttribute('data-section-index')
            if (index) {
              setCurrent(parseInt(index, 10))
            }
          }
        })
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [setCurrent])

  return (
    <header className="fixed top-0 left-0 z-50 w-full border-b border-[var(--gh-border-subtle)] bg-[var(--gh-bg-base)]/80 px-6 py-4 text-sm font-medium text-[var(--gh-text-primary)] backdrop-blur-sm">
      <div className="flex w-full max-w-7xl items-center justify-between">
        <span className="tracking-wider">{investorContent.progressLabel}</span>
        <span className="font-mono text-[var(--gh-text-secondary)]">
          {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>
    </header>
  )
}
