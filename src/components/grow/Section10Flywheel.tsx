'use client'

import { investorContent } from '@/lib/investorContent'

export default function Section10Flywheel() {
  const section = investorContent.sections[9]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="relative z-10 flex max-w-4xl flex-col items-center gap-8 text-center">
        <h2 className="text-3xl font-light leading-tight text-[var(--gh-text-primary)] md:text-5xl lg:text-6xl">
          {section.headline}
        </h2>

        {section.body.map((paragraph) => (
          <p key={paragraph} className="max-w-2xl text-lg text-[var(--gh-text-secondary)] md:text-xl">
            {paragraph}
          </p>
        ))}

        <div className="flex w-full max-w-2xl flex-col gap-4 rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-6 text-left">
          {section.visual.flow?.map((node, index) => (
            <div key={node} className="flex items-center gap-4">
              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--gh-orange)]/20 text-sm font-semibold text-[var(--gh-orange)]">
                {index + 1}
              </span>
              <span className="text-[var(--gh-text-primary)]">{node}</span>
              {index < section.visual.flow!.length - 1 && (
                <span className="ml-auto text-[var(--gh-text-muted)]">↓</span>
              )}
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
