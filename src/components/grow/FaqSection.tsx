'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function FaqSection() {
  const t = useTranslations('grow.faq')
  const items = [1, 2, 3, 4, 5, 6, 7]
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash.startsWith('faq-')) {
      const index = Number(hash.replace('faq-', ''))
      if (index >= 1 && index <= items.length) setOpen(index)
    }
  }, [items.length])

  return (
    <section
      id="faq"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid max-w-4xl gap-4">
        {items.map((n) => (
          <div key={n} id={`faq-${n}`}>
            <Expandable
              title={t(`q_${n}`)}
              isOpen={open === n}
              onToggle={() => {
                const next = open === n ? null : n
                setOpen(next)
                if (next !== null) {
                  window.history.replaceState(null, '', `#faq-${n}`)
                }
              }}
              className="border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
              titleClassName="text-[var(--gh-text-primary)]"
            >
              <p className="mt-2 text-sm">{t(`a_${n}`)}</p>
            </Expandable>
          </div>
        ))}
      </div>
    </section>
  )
}
