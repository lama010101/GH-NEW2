'use client'

import { useEffect, useState } from 'react'
import { useGrowSection } from './GrowSectionContext'

const formatNumber = (n: number) => String(n).padStart(2, '0')

const ChevronUp = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

const ChevronDown = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const ChevronsUp = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="17 11 12 6 7 11" />
    <polyline points="17 18 12 13 7 18" />
  </svg>
)

const ChevronsDown = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="7 13 12 18 17 13" />
    <polyline points="7 6 12 11 17 6" />
  </svg>
)

const List = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)

export default function GrowNavRail() {
  const { current, sections } = useGrowSection()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [expanded])

  const prevIndex = current > 0 ? current - 1 : null
  const nextIndex = current < sections.length - 1 ? current + 1 : null

  const sectionHref = (index: number | null) =>
    index !== null ? `#${sections[index].id}` : undefined

  const controlBase =
    'flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-[var(--gh-radius-md)] text-[var(--gh-text-secondary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-orange)] motion-reduce:transition-none'

  const activeControlClass = `${controlBase} hover:bg-[var(--gh-bg-surface)] hover:text-[var(--gh-text-primary)]`

  const disabledControlClass = `${controlBase} cursor-not-allowed opacity-30`

  return (
    <nav
      aria-label="Slide chapters"
      className={`fixed right-2 top-1/2 z-40 -translate-y-1/2 transform rounded-[var(--gh-radius-md)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-base)]/70 p-2 backdrop-blur-sm transition-colors motion-reduce:transition-none md:right-4 ${
        expanded ? 'w-44 md:w-64' : 'w-10 md:w-12'
      }`}
    >
      <div className="flex flex-col items-center gap-1">
        {/* Beginning */}
        {current === 0 ? (
          <span className={disabledControlClass} aria-disabled="true" aria-label="Beginning (already on first slide)">
            <ChevronsUp />
          </span>
        ) : (
          <a
            href={`#${sections[0].id}`}
            className={activeControlClass}
            aria-label="Go to beginning"
          >
            <ChevronsUp />
          </a>
        )}

        {/* Previous */}
        {prevIndex === null ? (
          <span className={disabledControlClass} aria-disabled="true" aria-label="Previous slide (unavailable)">
            <ChevronUp />
          </span>
        ) : (
          <a
            href={sectionHref(prevIndex)}
            className={activeControlClass}
            aria-label="Previous slide"
          >
            <ChevronUp />
          </a>
        )}

        {/* Section bullets */}
        <ol className="flex flex-col items-center gap-1" id="grow-toc">
          {sections.map((section, index) => {
            const isActive = current === index
            const label = `${formatNumber(section.number)} · ${section.headline}`
            return (
              <li key={section.id} className="w-full">
                <a
                  href={`#${section.id}`}
                  aria-label={label}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => setExpanded(false)}
                  className={`group relative flex h-8 w-full items-center rounded-[var(--gh-radius-md)] text-[var(--gh-text-secondary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-orange)] motion-reduce:transition-none ${
                    isActive
                      ? 'text-[var(--gh-orange)]'
                      : 'hover:text-[var(--gh-text-primary)]'
                  } ${expanded ? 'justify-start gap-2 px-2' : 'justify-center'}`}
                >
                  <span
                    className={`h-2.5 w-2.5 flex-shrink-0 rounded-full transition-colors ${
                      isActive
                        ? 'bg-[var(--gh-orange)]'
                        : 'border border-current bg-transparent group-hover:bg-[var(--gh-text-secondary)]/30'
                    }`}
                  />

                  {/* Collapsed title tag */}
                  {!expanded && (
                    <span className="pointer-events-none absolute right-full mr-2 top-1/2 z-50 hidden max-w-[12rem] -translate-y-1/2 whitespace-normal rounded-[var(--gh-radius-md)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)] px-2 py-1 text-xs text-[var(--gh-text-primary)] shadow-sm group-hover:block group-focus-visible:block">
                      {label}
                    </span>
                  )}

                  {/* Expanded title */}
                  {expanded && (
                    <span
                      className={`truncate text-xs md:text-sm ${
                        isActive
                          ? 'font-medium text-[var(--gh-text-primary)]'
                          : 'text-[var(--gh-text-secondary)]'
                      }`}
                    >
                      {label}
                    </span>
                  )}
                </a>
              </li>
            )
          })}
        </ol>

        {/* Next */}
        {nextIndex === null ? (
          <span className={disabledControlClass} aria-disabled="true" aria-label="Next slide (unavailable)">
            <ChevronDown />
          </span>
        ) : (
          <a
            href={sectionHref(nextIndex)}
            className={activeControlClass}
            aria-label="Next slide"
          >
            <ChevronDown />
          </a>
        )}

        {/* End */}
        {current === sections.length - 1 ? (
          <span className={disabledControlClass} aria-disabled="true" aria-label="End (already on last slide)">
            <ChevronsDown />
          </span>
        ) : (
          <a
            href={`#${sections[sections.length - 1].id}`}
            className={activeControlClass}
            aria-label="Go to end"
          >
            <ChevronsDown />
          </a>
        )}

        {/* Expand/collapse TOC */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="grow-toc"
          aria-label={expanded ? 'Collapse table of contents' : 'Expand table of contents'}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--gh-radius-md)] text-[var(--gh-text-secondary)] transition-colors hover:bg-[var(--gh-bg-surface)] hover:text-[var(--gh-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-orange)] motion-reduce:transition-none md:h-10 md:w-10"
        >
          <List />
        </button>
      </div>
    </nav>
  )
}
