'use client'

import Image from 'next/image'
import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'
import StatusBadge from './StatusBadge'

export default function Section03HumanData() {
  const { content } = useGrowSection()
  const section = content.sections[2]

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      subheadline={section.subheadline}
      layout="split"
      accent="teal"
      finalStatement={section.finalStatement}
      media={
        section.visual.src ? (
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)]">
            <Image
              src={section.visual.src}
              alt={section.visual.alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080c14]/80 via-transparent to-transparent" />
          </div>
        ) : null
      }
    >
      {section.status && (
        <div className="self-start">
          <StatusBadge status={section.status} />
        </div>
      )}

      {section.body.map((paragraph) => (
        <p key={paragraph} className="text-sm text-[var(--gh-text-secondary)] md:text-base">
          {paragraph}
        </p>
      ))}

      <dl className="divide-y divide-[var(--gh-border-subtle)] border-y border-[var(--gh-border-subtle)]">
        {section.visual.items?.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[var(--gh-text-muted)]">
              {item.label}
            </dt>
            <dd className="font-sora text-lg font-bold text-[var(--gh-text-primary)] md:text-xl">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </GrowSlide>
  )
}
