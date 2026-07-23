'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function WhyItWorksSection() {
  const t = useTranslations('grow.why_it_works')
  const cards = [1, 2, 3, 4, 5, 6, 7, 8]
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section
      id="why-it-works"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((n) => (
          <Expandable
            key={n}
            title={t(`card_${n}.title`)}
            isOpen={open === n}
            onToggle={() => setOpen(open === n ? null : n)}
            className="border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
            titleClassName="text-[var(--gh-text-primary)]"
          >
            <p className="mt-2 text-sm leading-relaxed">{t(`card_${n}.summary`)}</p>
            <p className="mt-2 text-sm leading-relaxed">{t(`card_${n}.detail`)}</p>
          </Expandable>
        ))}
      </div>
    </section>
  )
}
