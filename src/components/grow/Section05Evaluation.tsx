'use client'

import { investorContent } from '@/lib/investorContent'
import StatusBadge from './StatusBadge'

export default function Section05Evaluation() {
  const section = investorContent.sections[4]

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

        {section.status && (
          <StatusBadge status={section.status} />
        )}

        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {section.visual.metrics?.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-5 text-left"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gh-text-muted)]">
                {metric.label}
              </p>
              <p className="mt-2 text-2xl font-medium text-[var(--gh-text-primary)]">
                {metric.value}
              </p>
              {metric.status && (
                <div className="mt-3">
                  <StatusBadge status={metric.status} />
                </div>
              )}
            </div>
          ))}
        </div>

        {section.visual.flow && (
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--gh-text-secondary)]">
            {section.visual.flow.map((node, index) => (
              <span key={node} className="flex items-center gap-3">
                <span className="font-medium text-[var(--gh-gold)]">{node}</span>
                {index < section.visual.flow!.length - 1 && (
                  <span className="text-[var(--gh-text-muted)]">↓</span>
                )}
              </span>
            ))}
          </div>
        )}

        {section.finalStatement && (
          <p className="text-2xl font-medium text-[var(--gh-gold)] md:text-3xl">
            {section.finalStatement}
          </p>
        )}

      </div>
    </section>
  )
}
