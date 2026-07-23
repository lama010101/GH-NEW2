'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function CtaSection() {
  const t = useTranslations('grow.cta')
  const router = useRouter()

  const actions = [
    { label: t('button_1.label'), action: () => router.push('/home'), analytics: 'grow-cta-play' },
    { label: t('button_2.label'), action: () => { const el = document.getElementById('contributors'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }, analytics: 'grow-cta-contribute' },
    { label: t('button_3.label'), action: () => { const el = document.getElementById('partnerships'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }, analytics: 'grow-cta-partner' },
    { label: t('button_4.label'), action: () => router.push('/help'), analytics: 'grow-cta-register' },
  ]

  return (
    <section
      id="cta"
      className="flex flex-col items-center gap-8 px-4 py-24 text-center"
    >
      <h2 className="max-w-2xl text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('headline')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={a.action}
            data-analytics={a.analytics}
            className="rounded-[var(--gh-radius-md)] bg-[var(--gh-orange)] px-6 py-3 font-semibold text-[var(--gh-btn-text)] transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  )
}
