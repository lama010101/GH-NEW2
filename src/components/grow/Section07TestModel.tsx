'use client'

import { investorContent } from '@/lib/investorContent'
import InvestorCTA from './InvestorCTA'
import StatusBadge from './StatusBadge'

export default function Section07TestModel() {
  const section = investorContent.sections[6]

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
          <StatusBadge status={section.status} label={section.statusLabel} />
        )}

        <div className="w-full max-w-2xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-6 text-left">
          {section.visual.steps?.map((step, index) => (
            <div
              key={step}
              className={`flex items-center justify-between py-4 ${
                index > 0 ? 'border-t border-[var(--gh-border-default)]' : ''
              }`}
            >
              <span className="text-[var(--gh-text-secondary)]">{step}</span>
              {index === 0 && (
                <span className="rounded bg-[var(--gh-bg-elevated)] px-2 py-1 text-xs text-[var(--gh-text-muted)]">
                  MODEL
                </span>
              )}
            </div>
          ))}

          <button
            type="button"
            disabled
            className="mt-2 w-full rounded-[var(--gh-radius-md)] border border-[var(--gh-blue)]/40 bg-[var(--gh-blue)]/10 py-3 text-sm font-semibold text-[var(--gh-blue)]"
          >
            RUN BENCHMARK
          </button>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {section.visual.metrics?.map((metric) => (
              <div key={metric.label} className="flex items-center justify-between rounded bg-[var(--gh-bg-elevated)] px-3 py-2">
                <span className="text-xs uppercase text-[var(--gh-text-muted)]">{metric.label}</span>
                <span className="font-medium text-[var(--gh-text-primary)]">{metric.value}</span>
              </div>
            ))}
          </div>
        </div>

        <InvestorCTA actions={section.ctas ?? ['test']} />

        {section.finalStatement && (
          <p className="text-lg font-medium text-[var(--gh-text-secondary)]">
            {section.finalStatement}
          </p>
        )}
      </div>
    </section>
  )
}
