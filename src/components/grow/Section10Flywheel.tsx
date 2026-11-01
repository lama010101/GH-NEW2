'use client'

import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'

/** Clockwise cell order around the 3x3 loop grid: TL, T, TR, R, BR, B, BL. */
const LOOP_CELLS = [
  'col-start-1 row-start-1 justify-self-end text-right',
  'col-start-2 row-start-1 justify-self-center text-center',
  'col-start-3 row-start-1 justify-self-start text-left',
  'col-start-3 row-start-2 justify-self-start text-left',
  'col-start-3 row-start-3 justify-self-start text-left',
  'col-start-2 row-start-3 justify-self-center text-center',
  'col-start-1 row-start-3 justify-self-end text-right',
]

export default function Section10Flywheel() {
  const { content } = useGrowSection()
  const section = content.sections[9]
  const flow = section.visual.flow ?? []
  const stages = flow.length > 1 && flow[0] === flow[flow.length - 1] ? flow.slice(0, -1) : flow

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      accent="gold"
      finalStatement={section.finalStatement}
    >
      {section.body.map((paragraph) => (
        <p key={paragraph} className="max-w-2xl text-base text-[var(--gh-text-secondary)] md:text-lg">
          {paragraph}
        </p>
      ))}

      <div
        aria-hidden="true"
        className="hidden w-full max-w-2xl grid-cols-3 grid-rows-3 items-center gap-x-2 gap-y-2 text-[0.6875rem] uppercase leading-tight tracking-[0.12em] text-[var(--gh-text-secondary)] md:grid"
      >
        {stages.map((stage, index) => (
          <span key={stage} className={LOOP_CELLS[index]}>
            {stage}
          </span>
        ))}

        <span className="col-start-1 row-start-2 flex justify-end text-[var(--gh-text-muted)]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 3.2-6.9" />
            <polyline points="3 3 3 9 9 9" />
          </svg>
        </span>

        <div className="col-start-2 row-start-2 flex justify-center">
          <div className="relative flex h-[clamp(84px,16dvh,132px)] w-[clamp(84px,16dvh,132px)] items-center justify-center rounded-full border border-dashed border-[var(--gh-border-default)] grow-accent-soft">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="grow-accent"
            >
              <path d="M21 12a9 9 0 1 1-3.2-6.9" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </div>
        </div>
      </div>

      <ol aria-hidden="true" className="flex w-full max-w-xs flex-col gap-1 md:hidden">
        {stages.map((stage, index) => (
          <li key={stage} className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full grow-accent-soft font-sora text-[0.5625rem] font-bold grow-accent">
              {index + 1}
            </span>
            <span className="text-[0.625rem] uppercase tracking-[0.1em] text-[var(--gh-text-secondary)]">
              {stage}
            </span>
          </li>
        ))}
      </ol>

      <ol className="sr-only">
        {flow.map((node, index) => (
          <li key={`${node}-${index}`}>{node}</li>
        ))}
      </ol>
    </GrowSlide>
  )
}
