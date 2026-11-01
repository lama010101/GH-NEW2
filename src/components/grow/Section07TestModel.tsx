'use client'

import { useTranslations } from 'next-intl'
import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'
import StatusBadge from './StatusBadge'

export default function Section07TestModel() {
  const { content } = useGrowSection()
  const tDeck = useTranslations('grow_deck')
  const section = content.sections[6]
  const steps = section.visual.steps ?? []

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      accent="blue"
      finalStatement={section.finalStatement}
    >
      {section.body.map((paragraph) => (
        <p key={paragraph} className="max-w-2xl text-base text-[var(--gh-text-secondary)] md:text-lg">
          {paragraph}
        </p>
      ))}

      {section.status && (
        <StatusBadge status={section.status} label={section.statusLabel} />
      )}

      <div className="w-full max-w-2xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4 text-left">
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li
              key={step}
              className={`flex items-center justify-between gap-3 py-2.5 ${
                index > 0 ? 'border-t border-[var(--gh-border-subtle)]' : ''
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full grow-accent-soft font-sora text-[0.5625rem] font-bold grow-accent">
                  {index + 1}
                </span>
                <span className="text-sm text-[var(--gh-text-primary)]">{step}</span>
              </span>
              {index === 0 && (
                <span className="rounded bg-[var(--gh-bg-elevated)] px-2 py-1 font-mono text-[0.5625rem] text-[var(--gh-text-muted)]">
                  {tDeck('model_tag')}
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {section.visual.metrics?.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between gap-2 rounded bg-[var(--gh-bg-elevated)] px-2.5 py-1.5"
            >
              <span className="text-[0.5625rem] uppercase tracking-[0.12em] text-[var(--gh-text-muted)]">
                {metric.label}
              </span>
              <span className="font-sora text-xs font-bold text-[var(--gh-text-primary)]">
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </GrowSlide>
  )
}
