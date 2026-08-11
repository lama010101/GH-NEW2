'use client'

import Image from 'next/image'
import { investorContent } from '@/lib/investorContent'

export default function Section02Game() {
  const section = investorContent.sections[1]

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

        {section.visual.src && (
          <div className="relative mt-6 aspect-video w-full max-w-2xl overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)]">
            <Image
              src={section.visual.src}
              alt={section.visual.alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 800px"
              className="object-cover"
            />
          </div>
        )}

        <ol className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--gh-text-secondary)] md:gap-6">
          {section.visual.steps?.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--gh-border-default)] text-xs font-semibold text-[var(--gh-gold)]">
                {index + 1}
              </span>
              <span>{step}</span>
              {index < (section.visual.steps?.length ?? 0) - 1 && (
                <span className="hidden text-[var(--gh-text-muted)] md:inline">↓</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
