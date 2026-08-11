'use client'

import { investorContent } from '@/lib/investorContent'

export default function Section08RecurringRevenue() {
  const section = investorContent.sections[7]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="relative z-10 flex max-w-4xl flex-col items-center gap-8 text-center">
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

        {section.body.map((paragraph) => (
          <p key={paragraph} className="max-w-2xl text-lg text-[var(--gh-text-secondary)] md:text-xl">
            {paragraph}
          </p>
        ))}

        <div className="w-full max-w-2xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-6 text-left">
          {section.visual.steps?.map((step, index) => (
            <div
              key={step}
              className={`py-3 text-[var(--gh-text-secondary)] ${
                index > 0 ? 'border-t border-[var(--gh-border-default)]' : ''
              }`}
            >
              {step}
            </div>
          ))}
        </div>

        <div className="h-32 w-full max-w-2xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-elevated)] p-4">
          <div className="flex h-full items-end gap-2">
            {[40, 55, 48, 70, 65, 82, 78, 90].map((h, i) => (
              <div
                key={i}
                className="w-full rounded-t bg-gradient-to-t from-[var(--gh-blue)] to-[var(--gh-gold)]"
                style={{ height: `${h}%` }}
                aria-hidden="true"
              />
            ))}
          </div>
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
