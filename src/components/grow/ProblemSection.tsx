'use client'

import { useTranslations } from 'next-intl'
import Expandable from './Expandable'

export default function ProblemSection() {
  const t = useTranslations('grow.problem')
  const axes = [1, 2, 3, 4]

  return (
    <section
      id="problem"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid max-w-4xl gap-4">
        {axes.map((n) => (
          <Expandable
            key={n}
            title={`${t(`axis_${n}.left_label`)} → ${t(`axis_${n}.right_label`)}`}
            className="border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
            titleClassName="text-[var(--gh-text-primary)]"
          >
            <p className="mt-2 text-sm leading-relaxed">{t(`axis_${n}.detail`)}</p>
          </Expandable>
        ))}
      </div>
    </section>
  )
}
