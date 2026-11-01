'use client'

import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'
import StatusBadge from './StatusBadge'

export default function Section08RecurringRevenue() {
  const { content } = useGrowSection()
  const section = content.sections[7]
  const chart = section.chart
  const steps = section.visual.steps ?? []

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      subheadline={section.subheadline}
      accent="violet"
      finalStatement={section.finalStatement}
    >
      {section.body.map((paragraph) => (
        <p key={paragraph} className="max-w-2xl text-base text-[var(--gh-text-secondary)] md:text-lg">
          {paragraph}
        </p>
      ))}

      {chart && (
        <figure className="w-full max-w-2xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-3 text-left">
          <figcaption className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[0.5625rem] uppercase tracking-[0.16em] text-[var(--gh-text-muted)]">
              {chart.caption}
            </span>
            <StatusBadge status="illustrative" />
          </figcaption>

          <div className="relative ml-5 h-24 border-b border-[var(--gh-border-default)]">
            {[0, 50, 100].map((line) => (
              <div
                key={line}
                className="absolute left-0 right-0 border-t border-[var(--gh-border-default)]"
                style={{ bottom: `${line}%` }}
                aria-hidden="true"
              >
                <span className="absolute -left-5 -top-1.5 font-mono text-[0.5rem] text-[var(--gh-text-muted)]">
                  {line}
                </span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end gap-1.5">
              {chart.values.map((value, index) => (
                <div
                  key={`${chart.labels[index]}-${index}`}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${value}%`,
                    background:
                      'linear-gradient(180deg, rgba(var(--grow-accent-rgb), 0.95), rgba(var(--grow-accent-rgb), 0.20))',
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          <div className="mt-1 ml-5 flex gap-1.5">
            {chart.labels.map((label) => (
              <span
                key={label}
                className="flex-1 text-center font-mono text-[0.5rem] text-[var(--gh-text-muted)] md:text-[0.5625rem]"
              >
                {label}
              </span>
            ))}
          </div>
        </figure>
      )}

      <ul className="flex flex-wrap justify-center gap-1.5">
        {steps.map((step) => (
          <li
            key={step}
            className="rounded-full border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)] px-2.5 py-1 font-mono text-[0.5625rem] text-[var(--gh-text-secondary)]"
          >
            {step}
          </li>
        ))}
      </ul>
    </GrowSlide>
  )
}
