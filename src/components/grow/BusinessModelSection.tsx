'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function BusinessModelSection() {
  const t = useTranslations('grow.business_model')
  const streams = [1, 2, 3, 4, 5, 6, 7]
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section
      id="business-model"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid max-w-4xl gap-4">
        <h3 className="text-xl font-semibold text-[var(--gh-text-primary)]">{t('current_title')}</h3>
        {streams.slice(0, 3).map((n) => (
          <Expandable
            key={n}
            title={t(`stream_${n}.title`)}
            isOpen={open === n}
            onToggle={() => setOpen(open === n ? null : n)}
            className="border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
            titleClassName="text-[var(--gh-text-primary)]"
          >
            <p className="mt-2 text-sm">{t(`stream_${n}.summary`)}</p>
            <p className="mt-2 text-sm">{t(`stream_${n}.detail`)}</p>
          </Expandable>
        ))}
        <h3 className="mt-4 text-xl font-semibold text-[var(--gh-text-primary)]">{t('future_title')}</h3>
        {streams.slice(3).map((n) => (
          <Expandable
            key={n}
            title={`${t(`stream_${n}.title`)} · ${t('badge_future')}`}
            isOpen={open === n}
            onToggle={() => setOpen(open === n ? null : n)}
            className="border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)]/50 p-4 opacity-80"
            titleClassName="text-[var(--gh-text-primary)]"
          >
            <p className="mt-2 text-sm">{t(`stream_${n}.summary`)}</p>
            <p className="mt-2 text-sm">{t(`stream_${n}.detail`)}</p>
          </Expandable>
        ))}
      </div>
    </section>
  )
}
