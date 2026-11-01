'use client'

import Link from 'next/link'
import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'

export default function Section12Investment() {
  const { content } = useGrowSection()
  const section = content.sections[11]
  const registerCta = content.ctas.find((cta) => cta.id === 'register')

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      accent="orange"
    >
      <div className="grid w-full max-w-3xl gap-2 sm:grid-cols-2">
        {section.businesses?.map((business) => (
          <div
            key={business.title}
            className="flex flex-col gap-2 rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-4 text-left"
          >
            <span className="font-sora text-[0.625rem] font-bold uppercase tracking-[0.18em] grow-accent">
              {business.title}
            </span>
            <span className="text-xs text-[var(--gh-text-secondary)] md:text-sm">
              {business.description}
            </span>
          </div>
        ))}
      </div>

      {section.statements && (
        <ol className="flex flex-wrap justify-center gap-1.5">
          {section.statements.map((statement) => (
            <li
              key={statement}
              className="rounded-[var(--gh-radius-pill)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)] px-2.5 py-1 font-mono text-[0.5625rem] text-[var(--gh-text-secondary)] md:text-[0.625rem]"
            >
              {statement}
            </li>
          ))}
        </ol>
      )}

      <p className="max-w-2xl text-xl font-medium text-[color:var(--grow-accent)] md:text-2xl">
        {section.finalStatement}
      </p>

      {registerCta && (
        <Link
          href={registerCta.href}
          className="grow-accent inline-flex items-center gap-1.5 border-b border-[var(--grow-accent)] pb-0.5 text-xs font-medium transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--grow-accent)] md:text-sm"
        >
          {registerCta.label}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </GrowSlide>
  )
}
