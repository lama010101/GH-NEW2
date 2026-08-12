'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useAuthGate } from '@/hooks/useAuthGate'
import { AuthModal } from '@/components/AuthModal'
import { useGrowSection } from './GrowSectionContext'

export default function InvestorProgress() {
  const router = useRouter()
  const t = useTranslations()
  const { setCurrent } = useGrowSection()
  const { requireAuth, isModalOpen, closeModal } = useAuthGate()

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
    <>
      <header className="fixed top-0 left-0 z-50 w-full border-b border-[var(--gh-border-subtle)] bg-[var(--gh-bg-base)]/80 px-6 py-4 text-sm font-medium text-[var(--gh-text-primary)] backdrop-blur-sm">
        <div className="relative mx-auto flex w-full max-w-7xl items-center justify-center">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="absolute left-0 flex cursor-pointer items-center border-0 bg-transparent p-0"
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
            onClick={() => requireAuth('/home')}
            className="absolute right-0 inline-flex min-w-[100px] items-center justify-center rounded-[var(--gh-radius-pill)] bg-gradient-to-br from-[#fb923c] to-[#f97316] px-4 py-1.5 text-xs font-bold text-[#1a0a00] shadow-[0_0_16px_rgba(251,146,60,.45),0_2px_8px_rgba(0,0,0,.35)] transition-all hover:translate-y-[-2px] hover:shadow-[0_0_24px_rgba(251,146,60,.55),0_4px_12px_rgba(0,0,0,.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] sm:min-w-[120px] sm:px-7 sm:py-2 sm:text-sm"
          >
            Play Now
          </button>
        </div>
      </header>
      <AuthModal isOpen={isModalOpen} onClose={closeModal} required={false} />
    </>
  )
}
