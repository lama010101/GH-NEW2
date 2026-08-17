'use client'

import { investorContent } from '@/lib/investorContent'
import { RevealOnScroll, StaggerGroup, StaggerItem } from './RevealOnScroll'
import InvestorCtaButtons from './InvestorCtaButtons'

export default function Section12Investment() {
  const section = investorContent.sections[11]

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <div className="relative z-10 flex max-w-4xl flex-col items-center gap-8 text-center">
        <RevealOnScroll>
          <h2 className="text-3xl font-light leading-tight text-[var(--gh-text-primary)] md:text-5xl lg:text-6xl">
            {section.headline}
          </h2>
        </RevealOnScroll>

        <StaggerGroup className="flex w-full max-w-2xl flex-col gap-4">
          {section.body.map((paragraph, index) => {
            const [title, ...rest] = paragraph.split(': ')
            return (
              <StaggerItem key={index} className="w-full rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] p-6 text-left">
                <h3 className="text-lg font-semibold uppercase tracking-wide text-[var(--gh-gold)]">
                  {title}
                </h3>
                <p className="mt-2 text-[var(--gh-text-secondary)]">
                  {rest.join(': ')}
                </p>
              </StaggerItem>
            )
          })}
        </StaggerGroup>

        <StaggerGroup className="grid w-full max-w-2xl gap-3">
          {section.statements?.map((statement) => (
            <StaggerItem
              key={statement}
              className="text-xl font-medium text-[var(--gh-text-primary)] md:text-2xl"
            >
              {statement}
            </StaggerItem>
          ))}
        </StaggerGroup>

        {section.finalStatement && (
          <RevealOnScroll delay={0.1}>
            <p className="text-2xl font-medium text-[var(--gh-gold)] md:text-3xl">
              {section.finalStatement}
            </p>
          </RevealOnScroll>
        )}

        {section.ctas && (
          <RevealOnScroll delay={0.2}>
            <InvestorCtaButtons ids={section.ctas} />
          </RevealOnScroll>
        )}
      </div>
    </section>
  )
}
