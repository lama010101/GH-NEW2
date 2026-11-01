'use client'

import Image from 'next/image'
import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'

export default function Section06DataMoat() {
  const { content } = useGrowSection()
  const section = content.sections[5]
  const stack = section.visual.stack ?? []

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      layout="split"
      accent="gold"
      finalStatement={section.finalStatement}
      media={
        section.visual.src ? (
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)]">
            <Image
              src={section.visual.src}
              alt={section.visual.alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 500px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080c14]/85 via-transparent to-transparent" />
          </div>
        ) : null
      }
    >
      {section.body.map((paragraph) => (
        <p key={paragraph} className="text-sm text-[var(--gh-text-secondary)] md:text-base">
          {paragraph}
        </p>
      ))}

      <ol className="flex flex-col gap-1">
        {stack.map((layer, index) => (
          <li key={layer} className="flex items-center gap-2">
            <span className="w-4 shrink-0 font-mono text-[0.5625rem] text-[var(--gh-text-muted)]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span
              className="h-6 flex-1 rounded-[6px] border border-[var(--gh-border-subtle)] px-2 text-[0.625rem] leading-6 text-[var(--gh-text-secondary)]"
              style={{
                background: `linear-gradient(90deg, rgba(var(--grow-accent-rgb), ${
                  0.06 + index * 0.04
                }), rgba(var(--grow-accent-rgb), 0.02))`,
              }}
            >
              {layer}
            </span>
          </li>
        ))}
      </ol>
    </GrowSlide>
  )
}
