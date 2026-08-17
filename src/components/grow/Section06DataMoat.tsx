'use client'

import Image from 'next/image'
import { investorContent } from '@/lib/investorContent'
import { RevealOnScroll, StaggerGroup, StaggerItem } from './RevealOnScroll'

export default function Section06DataMoat() {
  const section = investorContent.sections[5]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="relative z-10 grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
        {section.visual.src && (
          <RevealOnScroll y={0} className="relative aspect-square w-full max-w-md overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)]">
            <Image
              src={section.visual.src}
              alt={section.visual.alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 500px"
              className="object-cover"
            />
          </RevealOnScroll>
        )}

        <RevealOnScroll delay={0.1} className="flex flex-col gap-6">
          <h2 className="text-3xl font-light leading-tight text-[var(--gh-text-primary)] md:text-5xl lg:text-6xl">
            {section.headline}
          </h2>

          <StaggerGroup as="ul" className="space-y-3 border-y border-[var(--gh-border-default)] py-6 text-lg text-[var(--gh-text-secondary)]">
            {section.visual.stack?.map((layer) => (
              <StaggerItem as="li" key={layer} className="flex items-center gap-3">
                <span className="text-[var(--gh-gold)]">+</span>
                <span>{layer}</span>
              </StaggerItem>
            ))}
          </StaggerGroup>

          {section.body.map((paragraph) => (
            <p key={paragraph} className="text-[var(--gh-text-secondary)]">
              {paragraph}
            </p>
          ))}

          {section.finalStatement && (
            <p className="text-2xl font-medium text-[var(--gh-gold)] md:text-3xl">
              {section.finalStatement}
            </p>
          )}
        </RevealOnScroll>
      </div>
    </section>
  )
}
