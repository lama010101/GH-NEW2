'use client'

import { investorContent } from '@/lib/investorContent'
import StatusBadge from './StatusBadge'

export default function Section11Platform() {
  const section = investorContent.sections[10]

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

        {section.visual.branches && (
          <div className="w-full max-w-2xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-6 text-left">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gh-gold)]/20 text-lg font-bold text-[var(--gh-gold)]">
                {section.visual.branches.root.charAt(0)}
              </span>
              <span className="text-xl font-semibold text-[var(--gh-text-primary)]">
                {section.visual.branches.root}
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {section.visual.branches.children.map((child) => (
                <li
                  key={child}
                  className="flex items-center gap-2 text-[var(--gh-text-secondary)]"
                >
                  <span className="text-[var(--gh-gold)]">→</span>
                  <span>{child}</span>
                </li>
              ))}
            </ul>
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
