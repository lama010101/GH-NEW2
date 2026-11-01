'use client'

import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'

export default function Section09BusinessModel() {
  const { content } = useGrowSection()
  const section = content.sections[8]

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      accent="orange"
    >
      {section.body.map((paragraph) => (
        <p key={paragraph} className="max-w-2xl text-base text-[var(--gh-text-secondary)] md:text-lg">
          {paragraph}
        </p>
      ))}

      <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {section.visual.nodes?.map((node) => (
          <div
            key={node.label}
            className="flex flex-col gap-1.5 rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-3 text-left"
          >
            <span className="font-sora text-[0.5625rem] font-bold uppercase tracking-[0.16em] grow-accent">
              {node.label}
            </span>
            <span className="text-xs text-[var(--gh-text-secondary)]">{node.description}</span>
          </div>
        ))}
      </div>

      {section.visual.branches && (
        <div className="flex w-full max-w-2xl flex-col gap-2 rounded-[var(--gh-radius-md)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)] p-3 text-left">
          <span className="text-[0.5625rem] font-semibold uppercase tracking-[0.18em] text-[var(--gh-text-muted)]">
            {section.visual.branches.root}
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {section.visual.branches.children.map((child) => (
              <li
                key={child}
                className="rounded-[var(--gh-radius-pill)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-surface)] px-2.5 py-0.5 text-[0.625rem] text-[var(--gh-text-secondary)]"
              >
                {child}
              </li>
            ))}
          </ul>
        </div>
      )}
    </GrowSlide>
  )
}
