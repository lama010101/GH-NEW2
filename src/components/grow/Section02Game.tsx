'use client'

import Image from 'next/image'
import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'

export default function Section02Game() {
  const { content } = useGrowSection()
  const section = content.sections[1]
  const steps = section.visual.steps ?? []

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

      {section.visual.src && (
        <div className="relative mt-1 aspect-video w-full max-w-2xl overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)]">
          <Image
            src={section.visual.src}
            alt={section.visual.alt ?? ''}
            fill
            sizes="(max-width: 768px) 100vw, 800px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080c14]/70 via-transparent to-transparent" />
        </div>
      )}

      <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full grow-accent-soft font-sora text-[0.625rem] font-bold grow-accent">
              {index + 1}
            </span>
            <span className="text-xs text-[var(--gh-text-secondary)] md:text-sm">{step}</span>
            {index < steps.length - 1 && (
              <span className="ml-1 text-[var(--gh-text-muted)]" aria-hidden="true">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </GrowSlide>
  )
}
