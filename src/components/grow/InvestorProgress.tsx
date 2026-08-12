'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { investorContent } from '@/lib/investorContent'

export default function InvestorProgress() {
  const router = useRouter()
  const t = useTranslations()
  const [current, setCurrent] = useState(0)
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
  }, [])

  return (
    <header className="fixed top-0 left-0 z-50 w-full border-b border-[var(--gh-border-subtle)] bg-[var(--gh-bg-base)]/80 px-6 py-4 text-sm font-medium text-[var(--gh-text-primary)] backdrop-blur-sm">
      <div className="flex w-full max-w-7xl items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex cursor-pointer items-center border-0 bg-transparent p-0"
            aria-label={t('landing.logo_alt')}
          >
            <Image
              src="/icons/logo.webp"
              alt={t('landing.logo_alt')}
              width={120}
              height={32}
              className="h-8 w-auto object-contain"
              priority
            />
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="rounded-[var(--gh-radius-pill)] px-3 py-1 text-sm text-[var(--gh-text-secondary)] transition-colors hover:bg-[var(--gh-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-orange)]"
          >
            {t('nav.home')}
          </button>
        </div>
        <span className="font-mono text-[var(--gh-text-secondary)]">
          {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>
    </header>
  )
}
