'use client'

import { useTranslations } from 'next-intl'

export default function ContributorsSection() {
  const t = useTranslations('grow.contributors')
  const roles = [1, 2, 3, 4]
  const incentives = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  return (
    <section
      id="contributors"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {roles.map((n) => (
          <div
            key={n}
            className="flex flex-col gap-2 rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4"
          >
            <h3 className="text-lg font-semibold text-[var(--gh-text-primary)]">{t(`role_${n}.name`)}</h3>
            <p className="text-sm text-[var(--gh-text-secondary)]">{t(`role_${n}.why`)}</p>
            <p className="text-sm text-[var(--gh-text-secondary)]">{t(`role_${n}.what`)}</p>
            <p className="text-sm text-[var(--gh-text-secondary)]">{t(`role_${n}.receive`)}</p>
            <button
              type="button"
              data-analytics={`grow-contributor-cta-${n}`}
              className="mt-auto rounded-[var(--gh-radius-md)] bg-[var(--gh-orange)] px-3 py-2 text-sm font-medium text-[var(--gh-btn-text)]"
            >
              {t(`role_${n}.cta`)}
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {incentives.map((n) => (
          <span
            key={n}
            className="rounded-[var(--gh-radius-pill)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)] px-3 py-1 text-sm text-[var(--gh-text-secondary)]"
          >
            {t(`incentive_${n}`)}
          </span>
        ))}
      </div>
    </section>
  )
}
