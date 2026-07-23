'use client'

import { useTranslations } from 'next-intl'

export default function ProductSection() {
  const t = useTranslations('grow.product')
  const features = [1, 2, 3, 4, 5, 6, 7]

  return (
    <section
      id="product"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <p className="max-w-2xl text-[var(--gh-text-secondary)]">{t('demo_label')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((n) => (
          <div
            key={n}
            className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
          >
            <h3 className="font-semibold text-[var(--gh-text-primary)]">{t(`feature_${n}.title`)}</h3>
            <p className="mt-1 text-sm text-[var(--gh-text-secondary)]">{t(`feature_${n}.desc`)}</p>
          </div>
        ))}
      </div>
      <span className="w-fit rounded-[var(--gh-radius-pill)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-elevated)] px-3 py-1 text-xs text-[var(--gh-text-muted)]">
        {t('roadmap_badge')}
      </span>
    </section>
  )
}
