'use client'

import Image from 'next/image'
import { investorContent } from '@/lib/investorContent'
import StatusBadge from './StatusBadge'

export default function Section04HumanVsAI() {
  const section = investorContent.sections[3]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="relative z-10 flex max-w-5xl flex-col items-center gap-8 text-center">
        <h2 className="text-3xl font-light leading-tight text-[var(--gh-text-primary)] md:text-5xl lg:text-6xl">
          {section.headline}
        </h2>

        {section.body.map((paragraph) => (
          <p key={paragraph} className="max-w-2xl text-lg text-[var(--gh-text-secondary)] md:text-xl">
            {paragraph}
          </p>
        ))}

        {section.status && (
          <StatusBadge status={section.status} label={section.statusLabel} />
        )}

        {section.visual.src && (
          <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)]">
            <Image
              src={section.visual.src}
              alt={section.visual.alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 1000px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/40" />
          </div>
        )}

        <div className="grid w-full max-w-3xl gap-6 md:grid-cols-2">
          {section.visual.columns?.map((column) => (
            <div
              key={column.title}
              className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-6"
            >
              <h3 className="mb-4 text-xl font-semibold text-[var(--gh-text-primary)]">
                {column.title}
              </h3>
              <ul className="flex flex-col gap-2 text-[var(--gh-text-secondary)]">
                {column.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {section.finalStatement && (
          <p className="text-2xl font-medium text-[var(--gh-gold)] md:text-3xl">
            {section.finalStatement}
          </p>
        )}
      </div>
    </section>
  )
}
