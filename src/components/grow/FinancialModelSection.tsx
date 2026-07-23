'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function FinancialModelSection() {
  const t = useTranslations('grow.financial')
  const flows = [1, 2, 3, 4, 5, 6, 7]
  const futureProjects = [1, 2, 3, 4, 5]
  const purposes = [1, 2, 3, 4]
  const principles = [1, 2, 3, 4]
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section
      id="financial-model"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="flex max-w-3xl flex-col gap-0">
        {flows.map((n) => (
          <div key={n} className="relative pl-6">
            <span className="absolute left-0 top-4 block h-2 w-2 rounded-full bg-[var(--gh-orange)]" />
            {n < flows.length && (
              <span className="absolute left-[3px] top-6 block h-full w-0.5 bg-[var(--gh-border-default)]" />
            )}
            <Expandable
              title={t(`flow_${n}.label`)}
              isOpen={open === n}
              onToggle={() => setOpen(open === n ? null : n)}
              className="mb-4 border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
              titleClassName="text-[var(--gh-text-primary)]"
            >
              <p className="mt-2 text-sm">{t(`flow_${n}.detail`)}</p>
              {n === flows.length && (
                <div className="mt-4 rounded-[var(--gh-radius-sm)] bg-[var(--gh-bg-elevated)] p-3">
                  <h4 className="text-sm font-semibold text-[var(--gh-text-primary)]">{t('future_projects_title')}</h4>
                  <ul className="mt-2 list-disc pl-5 text-sm text-[var(--gh-text-secondary)]">
                    {futureProjects.map((p) => (
                      <li key={p}>{t(`future_project_${p}`)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Expandable>
          </div>
        ))}
      </div>
      <div className="max-w-3xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-6">
        <h3 className="text-xl font-semibold text-[var(--gh-text-primary)]">{t('capped.title')}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-[var(--gh-text-secondary)]">Purpose</h4>
            <ul className="mt-2 list-disc pl-5 text-sm text-[var(--gh-text-secondary)]">
              {purposes.map((p) => (
                <li key={p}>{t(`capped.purpose_${p}`)}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--gh-text-secondary)]">Principles</h4>
            <ul className="mt-2 list-disc pl-5 text-sm text-[var(--gh-text-secondary)]">
              {principles.map((p) => (
                <li key={p}>{t(`capped.principle_${p}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
