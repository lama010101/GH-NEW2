'use client'

import Image from 'next/image'
import { investorContent } from '@/lib/investorContent'
import StatusBadge from './StatusBadge'

export default function Section03HumanData() {
  const section = investorContent.sections[2]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="relative z-10 grid max-w-6xl gap-8 md:grid-cols-2 md:items-center">
        {section.visual.src && (
          <div className="relative aspect-[3/4] w-full max-w-md overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)]">
            <Image
              src={section.visual.src}
              alt={section.visual.alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-light leading-tight text-[var(--gh-text-primary)] md:text-5xl lg:text-6xl">
              {section.headline}
            </h2>
            {section.subheadline && (
              <h3 className="text-2xl font-medium text-[var(--gh-gold)] md:text-3xl">
                {section.subheadline}
              </h3>
            )}
          </div>

          {section.status && (
            <StatusBadge status={section.status} />
          )}

          <dl className="grid gap-4 border-y border-[var(--gh-border-default)] py-6">
            {section.visual.items?.map((item) => (
              <div key={item.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm uppercase tracking-wide text-[var(--gh-text-muted)]">
                  {item.label}
                </dt>
                <dd className="text-right text-2xl font-medium text-[var(--gh-text-primary)] md:text-3xl">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {section.finalStatement && (
            <p className="text-lg font-medium text-[var(--gh-text-secondary)]">
              {section.finalStatement}
            </p>
          )}

        </div>
      </div>
    </section>
  )
}
