'use client'

import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function VisionSection() {
  const t = useTranslations('grow.vision')
  const nodes = [1, 2, 3, 4, 5, 6, 7]

  return (
    <section
      id="vision"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="relative flex max-w-4xl flex-col gap-6 border-l-2 border-[var(--gh-border-default)] pl-6">
        {nodes.map((n) => (
          <div key={n} className="relative">
            <span className="absolute -left-[31px] top-1.5 block h-4 w-4 rounded-full bg-[var(--gh-orange)]" />
            <Expandable
              title={t(`node_${n}.label`)}
              className="border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
              titleClassName="text-[var(--gh-text-primary)]"
            >
              {n === 7 ? (
                <p className="mt-2 text-xs uppercase tracking-wide text-[var(--gh-text-muted)]">
                  {t('vr_disclaimer')}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed">{t(`node_${n}.detail`)}</p>
              )}
            </Expandable>
          </div>
        ))}
      </div>
    </section>
  )
}
