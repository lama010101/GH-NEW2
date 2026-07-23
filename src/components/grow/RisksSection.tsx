'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function RisksSection() {
  const t = useTranslations('grow.risks')
  const risks = [1, 2, 3, 4, 5, 6]
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section
      id="risks"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid max-w-4xl gap-4">
        {risks.map((n) => (
          <Expandable
            key={n}
            title={t(`risk_${n}.title`)}
            isOpen={open === n}
            onToggle={() => setOpen(open === n ? null : n)}
            className="border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
            titleClassName="text-[var(--gh-text-primary)]"
          >
            <p className="mt-2 text-sm">{t(`risk_${n}.mitigation`)}</p>
          </Expandable>
        ))}
      </div>
    </section>
  )
}
