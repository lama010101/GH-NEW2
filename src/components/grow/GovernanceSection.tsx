'use client'

import { useTranslations } from 'next-intl'

export default function GovernanceSection() {
  const t = useTranslations('grow.governance')
  const rows = [1, 2, 3, 4, 5]

  return (
    <section
      id="governance"
      className="flex flex-col gap-8 px-4 py-20 md:px-8 lg:px-16"
    >
      <h2 className="text-3xl font-bold text-[var(--gh-text-primary)] md:text-4xl">
        {t('title')}
      </h2>
      <p className="max-w-2xl text-[var(--gh-text-secondary)]">{t('subtitle')}</p>
      <div className="grid max-w-4xl gap-2">
        <div className="grid grid-cols-2 gap-2 font-semibold text-[var(--gh-text-primary)]">
          <div className="rounded-tl-[var(--gh-radius-md)] bg-[var(--gh-bg-elevated)] p-3">{t('left_header')}</div>
          <div className="rounded-tr-[var(--gh-radius-md)] bg-[var(--gh-orange)] p-3 text-[var(--gh-btn-text)]">{t('right_header')}</div>
        </div>
        {rows.map((n) => (
          <div key={n} className="grid grid-cols-2 gap-2">
            <div className="bg-[var(--gh-bg-surface)] p-3 text-[var(--gh-text-secondary)]">{t(`left_${n}`)}</div>
            <div className="bg-[var(--gh-bg-surface)] p-3 text-[var(--gh-text-primary)]">{t(`right_${n}`)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
