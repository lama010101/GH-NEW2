'use client'

import Image from 'next/image'
import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'

export default function Section01Hook() {
  const { content } = useGrowSection()
  const section = content.sections[0]

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      layout="hero"
      headingLevel="h1"
      accent="gold"
      media={
        section.visual.src ? (
          <>
            <Image
              src={section.visual.src}
              alt={section.visual.alt ?? ''}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#080c14]/80 via-[#080c14]/35 to-[#080c14]/90" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_52%_at_50%_48%,rgba(8,12,20,0.72)_0%,rgba(8,12,20,0.55)_58%,rgba(8,12,20,0.30)_100%)]" />
          </>
        ) : null
      }
    >
      {section.body.map((paragraph) => (
        <p key={paragraph} className="max-w-2xl text-base text-[var(--gh-text-secondary)] md:text-lg">
          {paragraph}
        </p>
      ))}

      {section.stats && (
        <div className="grid w-full max-w-2xl grid-cols-3 gap-2 border-y border-[var(--gh-border-subtle)] py-4">
          {section.stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse items-center gap-1">
              <span className="text-center text-[0.625rem] uppercase tracking-[0.14em] text-[var(--gh-text-secondary)] md:text-[0.6875rem]">
                {stat.label}
              </span>
              <span className="font-sora text-xl font-bold text-[var(--gh-text-primary)] md:text-2xl">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {section.statements?.map((statement) => (
        <p key={statement} className="max-w-2xl text-xl font-medium text-[color:var(--grow-accent)] md:text-2xl">
          {statement}
        </p>
      ))}

      {section.scrollHint && (
        <div className="mt-2 flex flex-col items-center gap-1.5 text-[var(--gh-text-secondary)]">
          <span className="text-[0.5625rem] uppercase tracking-[0.32em]">{section.scrollHint}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-bounce motion-reduce:animate-none"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      )}
    </GrowSlide>
  )
}
