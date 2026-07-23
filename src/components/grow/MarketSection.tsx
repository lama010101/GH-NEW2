'use client'

import { useTranslations } from 'next-intl'

export default function MarketSection() {
  const t = useTranslations('grow.market')
  const sectors = [1, 2, 3, 4, 5, 6]

  return (
    <section
      id="market"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <p className="max-w-2xl text-[var(--gh-text-secondary)]">{t('intro')}</p>
      <div className="relative grid max-w-3xl gap-4 sm:grid-cols-2">
        {sectors.map((n) => (
          <div
            key={n}
            className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
          >
            <h3 className="font-semibold text-[var(--gh-text-primary)]">{t(`sector_${n}.name`)}</h3>
            <p className="mt-1 text-sm text-[var(--gh-text-secondary)]">{t(`sector_${n}.description`)}</p>
          </div>
        ))}
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--gh-orange)] bg-[var(--gh-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--gh-text-primary)] sm:block">
          {t('center_label')}
        </div>
      </div>
    </section>
  )
}
