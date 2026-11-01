'use client'

import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'
import StatusBadge from './StatusBadge'

export default function Section05Evaluation() {
  const { content } = useGrowSection()
  const section = content.sections[4]
  const flow = section.visual.flow ?? []

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

      {section.status && <StatusBadge status={section.status} />}

      <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {section.visual.metrics?.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-3 text-left"
          >
            <p className="text-[0.5625rem] font-semibold uppercase tracking-[0.16em] text-[var(--gh-text-muted)]">
              {metric.label}
            </p>
            <p className="mt-1.5 font-sora text-base font-bold text-[var(--gh-text-primary)] md:text-lg">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {section.baseline && (
        <p className="rounded-full grow-accent-soft px-3 py-1 text-[0.625rem] text-[var(--gh-text-secondary)] md:text-xs">
          {section.baseline}
        </p>
      )}

      {flow.length > 0 && (
        <ol className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[0.625rem] uppercase tracking-[0.14em] text-[var(--gh-text-secondary)] md:text-[0.6875rem]">
          {flow.map((node, index) => (
            <li key={node} className="flex items-center gap-2.5">
              <span
                className={
                  index === 0
                    ? 'font-semibold text-[color:var(--grow-accent)]'
                    : 'font-semibold text-[var(--gh-text-primary)]'
                }
              >
                {node}
              </span>
              {index < flow.length - 1 && (
                <span className="text-[var(--gh-text-muted)]" aria-hidden="true">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </GrowSlide>
  )
}
