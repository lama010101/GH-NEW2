'use client'

import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'
import StatusBadge from './StatusBadge'

export default function Section11Platform() {
  const { content } = useGrowSection()
  const section = content.sections[10]

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      accent="teal"
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

      {section.visual.branches && (
        <div className="flex w-full max-w-2xl flex-col items-center">
          <span className="rounded-full grow-accent-soft px-4 py-1 font-sora text-[0.625rem] font-bold uppercase tracking-[0.24em] grow-accent">
            {section.visual.branches.root}
          </span>
          <span className="h-3 w-px bg-[var(--gh-border-default)]" aria-hidden="true" />
          <span className="h-px w-full bg-[var(--gh-border-default)]" aria-hidden="true" />
          <ul className="mt-3 grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4">
            {section.visual.branches.children.map((child) => (
              <li
                key={child}
                className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] px-2 py-1.5 text-center text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--gh-text-secondary)]"
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
