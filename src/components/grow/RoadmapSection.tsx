'use client'

import { useTranslations } from 'next-intl'

export default function RoadmapSection() {
  const t = useTranslations('grow.roadmap')
  const lanes = [1, 2, 3, 4]
  const items = [1, 2, 3, 4]

  return (
    <section
      id="roadmap"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid max-w-4xl gap-4 md:grid-cols-4">
        {lanes.map((n) => (
          <div key={n} className="rounded-t-[var(--gh-radius-md)] bg-[var(--gh-bg-elevated)] p-3 text-center font-semibold text-[var(--gh-text-primary)]">
            {t(`lane_${n}`)}
          </div>
        ))}
        {items.map((n) => (
          <div
            key={n}
            className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
          >
            <h3 className="font-semibold text-[var(--gh-text-primary)]">{t(`item_${n}.title`)}</h3>
            <p className="text-xs text-[var(--gh-text-muted)]">{t(`item_${n}.date`)}</p>
            <p className="mt-1 text-sm text-[var(--gh-text-secondary)]">{t(`item_${n}.description`)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
