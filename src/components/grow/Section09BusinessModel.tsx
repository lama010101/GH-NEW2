'use client'

import { investorContent } from '@/lib/investorContent'
import { RevealOnScroll, StaggerGroup, StaggerItem } from './RevealOnScroll'

export default function Section09BusinessModel() {
  const section = investorContent.sections[8]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="relative z-10 flex max-w-5xl flex-col items-center gap-8 text-center">
        <RevealOnScroll className="flex flex-col items-center gap-8">
          <h2 className="text-3xl font-light leading-tight text-[var(--gh-text-primary)] md:text-5xl lg:text-6xl">
            {section.headline}
          </h2>

          {section.body.map((paragraph) => (
            <p key={paragraph} className="max-w-2xl text-lg text-[var(--gh-text-secondary)] md:text-xl">
              {paragraph}
            </p>
          ))}
        </RevealOnScroll>

        <StaggerGroup className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {section.visual.nodes?.map((node) => (
            <StaggerItem
              key={node.label}
              className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-5 text-left"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gh-gold)]">
                {node.label}
              </p>
              <p className="mt-2 text-[var(--gh-text-secondary)]">
                {node.description}
              </p>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {section.visual.branches && (
          <RevealOnScroll delay={0.1} className="w-full max-w-2xl rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-elevated)] p-6 text-left">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gh-text-muted)]">
              {section.visual.branches.root}
            </p>
            <ul className="flex flex-wrap gap-2">
              {section.visual.branches.children.map((child) => (
                <li
                  key={child}
                  className="rounded-[var(--gh-radius-pill)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] px-3 py-1 text-sm text-[var(--gh-text-secondary)]"
                >
                  {child}
                </li>
              ))}
            </ul>
          </RevealOnScroll>
        )}
      </div>
    </section>
  )
}
