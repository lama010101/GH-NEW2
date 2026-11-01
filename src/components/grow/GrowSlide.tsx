'use client'

import type { CSSProperties, ReactNode } from 'react'

export type GrowAccent = 'gold' | 'blue' | 'teal' | 'violet' | 'orange'

const accentTokens: Record<GrowAccent, { solid: string; rgb: string }> = {
  gold: { solid: '#f0c060', rgb: '240, 192, 96' },
  blue: { solid: '#3b82f6', rgb: '59, 130, 246' },
  teal: { solid: '#22d3ee', rgb: '34, 211, 238' },
  violet: { solid: '#e879f9', rgb: '232, 121, 249' },
  orange: { solid: '#fb923c', rgb: '251, 146, 60' },
}

const formatNumber = (n: number) => String(n).padStart(2, '0')

type GrowSlideProps = {
  id: string
  index: number
  kicker: string
  headline: string
  subheadline?: string
  accent?: GrowAccent
  layout?: 'stack' | 'split' | 'hero'
  headingLevel?: 'h1' | 'h2'
  media?: ReactNode
  finalStatement?: string
  children?: ReactNode
}

/**
 * Shared shell for the twelve deck slides: section anchor + snap target, accent
 * tokens, kicker/headline hierarchy, final statement and the CSS entrance.
 * Layout variants cover the three compositions used by the deck; slide-specific
 * content stays in the SectionNN components.
 */
export default function GrowSlide({
  id,
  index,
  kicker,
  headline,
  subheadline,
  accent = 'gold',
  layout = 'stack',
  headingLevel = 'h2',
  media,
  finalStatement,
  children,
}: GrowSlideProps) {
  const Heading = headingLevel

  const style = {
    '--grow-accent': accentTokens[accent].solid,
    '--grow-accent-rgb': accentTokens[accent].rgb,
  } as CSSProperties

  const heading = (
    <Heading
      className={`max-w-3xl font-light leading-[1.08] text-[var(--gh-text-primary)] ${
        headingLevel === 'h1'
          ? 'text-4xl md:text-6xl lg:text-7xl'
          : 'text-3xl md:text-5xl lg:text-6xl'
      }`}
    >
      {headline}
    </Heading>
  )

  const kickerLine = (
    <p className="font-sora text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-[color:var(--grow-accent)] md:text-xs">
      {formatNumber(index + 1)} — {kicker}
    </p>
  )

  const subheadlineLine = subheadline ? (
    <p className="max-w-2xl text-xl font-medium text-[color:var(--grow-accent)] md:text-2xl">
      {subheadline}
    </p>
  ) : null

  const finalLine = finalStatement ? (
    <p className="max-w-2xl text-xl font-medium text-[color:var(--grow-accent)] md:text-2xl">
      {finalStatement}
    </p>
  ) : null

  return (
    <section
      id={id}
      data-section-id={id}
      data-section-index={index}
      style={style}
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      {layout === 'hero' ? (
        <>
          <div className="absolute inset-0 z-0">{media}</div>
          <div
            className={`grow-slide-enter relative z-10 flex max-w-4xl flex-col items-center gap-5 text-center`}
          >
            {kickerLine}
            {heading}
            {subheadlineLine}
            {children}
            {finalLine}
          </div>
        </>
      ) : layout === 'split' ? (
        <div
          className={`grow-slide-enter relative z-10 grid w-full max-w-6xl items-center gap-8 md:grid-cols-2`}
        >
          {media}
          <div className="flex flex-col gap-5">
            {kickerLine}
            {heading}
            {subheadlineLine}
            {children}
            {finalLine}
          </div>
        </div>
      ) : (
        <div
          className={`grow-slide-enter relative z-10 flex w-full max-w-4xl flex-col items-center gap-6 text-center`}
        >
          {kickerLine}
          {heading}
          {subheadlineLine}
          {children}
          {finalLine}
        </div>
      )}
    </section>
  )
}
