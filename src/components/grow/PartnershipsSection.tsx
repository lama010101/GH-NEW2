'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function PartnershipsSection() {
  const t = useTranslations('grow.partnerships')
  const opportunities = [1, 2, 3, 4, 5, 6, 7]
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section
      id="partnerships"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid max-w-4xl gap-4">
        <h3 className="text-xl font-semibold text-[var(--gh-text-primary)]">{t('current_title')}</h3>
        {opportunities.slice(0, 2).map((n) => (
          <Expandable
            key={n}
            title={t(`opportunity_${n}.name`)}
            isOpen={open === n}
            onToggle={() => setOpen(open === n ? null : n)}
            className="border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
            titleClassName="text-[var(--gh-text-primary)]"
          >
            <p className="mt-2 text-sm">{t(`opportunity_${n}.description`)}</p>
          </Expandable>
        ))}
        <h3 className="mt-4 text-xl font-semibold text-[var(--gh-text-primary)]">{t('future_title')}</h3>
        {opportunities.slice(2).map((n) => (
          <Expandable
            key={n}
            title={`${t(`opportunity_${n}.name`)} · ${t('badge_future')}`}
            isOpen={open === n}
            onToggle={() => setOpen(open === n ? null : n)}
            className="border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)]/50 p-4 opacity-80"
            titleClassName="text-[var(--gh-text-primary)]"
          >
            <p className="mt-2 text-sm">{t(`opportunity_${n}.description`)}</p>
          </Expandable>
        ))}
      </div>
    </section>
  )
}
