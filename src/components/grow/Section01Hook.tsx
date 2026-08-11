'use client'

import Image from 'next/image'
import { investorContent } from '@/lib/investorContent'
import InvestorCTA from './InvestorCTA'

export default function Section01Hook() {
  const section = investorContent.sections[0]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4"
    >
      {section.visual.src && (
        <div className="absolute inset-0 z-0">
          <Image
            src={section.visual.src}
            alt={section.visual.alt ?? ''}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      <div className="relative z-10 flex max-w-4xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-light leading-tight text-[var(--gh-text-primary)] md:text-6xl lg:text-7xl">
          {section.headline}
        </h1>
        {section.body.map((paragraph) => (
          <p key={paragraph} className="max-w-2xl text-lg text-[var(--gh-text-secondary)] md:text-xl">
            {paragraph}
          </p>
        ))}
        {section.statements?.map((statement) => (
          <p key={statement} className="text-2xl font-medium text-[var(--gh-gold)] md:text-3xl">
            {statement}
          </p>
        ))}
        <InvestorCTA actions={['play', 'register']} className="mt-4" />
      </div>
    </section>
  )
}
