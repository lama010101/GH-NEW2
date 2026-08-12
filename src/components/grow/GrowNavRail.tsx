'use client'

import { useEffect, useRef, useState } from 'react'
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

const ChevronLeft = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const ChevronRight = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="9 18 15 12 9 6" />
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

const ChevronsLeft = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="13 17 8 12 13 7" />
    <polyline points="20 17 15 12 20 7" />
  </svg>
)

const ChevronsRight = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="11 17 16 12 11 7" />
    <polyline points="4 17 9 12 4 7" />
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

const Close = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const StartIcon = () => (
  <>
    <ChevronsLeft className="md:hidden" />
    <ChevronsUp className="hidden md:block" />
  </>
)

const PrevIcon = () => (
  <>
    <ChevronLeft className="md:hidden" />
    <ChevronUp className="hidden md:block" />
  </>
)

const NextIcon = () => (
  <>
    <ChevronRight className="md:hidden" />
    <ChevronDown className="hidden md:block" />
  </>
)

const EndIcon = () => (
  <>
    <ChevronsRight className="md:hidden" />
    <ChevronsDown className="hidden md:block" />
  </>
)

export default function GrowNavRail() {
  const { current, sections } = useGrowSection()
  const [expanded, setExpanded] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!expanded) return
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
      }
    }
    const clickHandler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('keydown', keyHandler)
    document.addEventListener('mousedown', clickHandler)
    return () => {
      document.removeEventListener('keydown', keyHandler)
      document.removeEventListener('mousedown', clickHandler)
    }
  }, [expanded])

  const prevIndex = current > 0 ? current - 1 : null
  const nextIndex = current < sections.length - 1 ? current + 1 : null

  const sectionHref = (index: number | null) =>
    index !== null ? `#${sections[index].id}` : undefined

  const controlBase =
    'flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-[var(--gh-radius-md)] text-[var(--gh-text-secondary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] motion-reduce:transition-none'

  const activeControlClass = `${controlBase} hover:bg-[var(--gh-bg-surface)] hover:text-[var(--gh-text-primary)]`

  const disabledControlClass = `${controlBase} cursor-not-allowed opacity-30`

  const activeDotClass = 'h-2.5 w-2.5 flex-shrink-0 rounded-full bg-gradient-to-br from-[#fb923c] to-[#f97316]'

  const inactiveDotClass =
    'h-2.5 w-2.5 flex-shrink-0 rounded-full border border-current bg-transparent group-hover:bg-[var(--gh-text-secondary)]/30'

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Slide chapters"
        className={`fixed left-0 right-0 top-16 z-40 flex h-12 items-center justify-center gap-1 border-b border-[var(--gh-border-subtle)] bg-[var(--gh-bg-base)]/80 px-3 backdrop-blur-sm md:left-auto md:right-4 md:top-1/2 md:h-auto md:w-12 md:-translate-y-1/2 md:flex-col md:items-center md:justify-center md:rounded-[var(--gh-radius-md)] md:border md:p-2 md:px-0 md:py-2 ${
          expanded ? 'md:w-64' : ''
        }`}
      >
        <div className="flex items-center gap-1 md:flex-col md:gap-1">
          {/* Beginning */}
          {current === 0 ? (
            <span className={disabledControlClass} aria-disabled="true" aria-label="Beginning (already on first slide)">
              <StartIcon />
            </span>
          ) : (
            <a
              href={`#${sections[0].id}`}
              className={activeControlClass}
              aria-label="Go to beginning"
            >
              <StartIcon />
            </a>
          )}

          {/* Previous */}
          {prevIndex === null ? (
            <span className={disabledControlClass} aria-disabled="true" aria-label="Previous slide (unavailable)">
              <PrevIcon />
            </span>
          ) : (
            <a
              href={sectionHref(prevIndex)}
              className={activeControlClass}
              aria-label="Previous slide"
            >
              <PrevIcon />
            </a>
          )}

          {/* Section bullets */}
          <ol className="flex items-center gap-1.5 md:flex-col md:items-center md:gap-1.5" id="grow-toc">
            {sections.map((section, index) => {
              const isActive = current === index
              const label = `${formatNumber(section.number)} · ${section.headline}`
              return (
                <li key={section.id} className="md:w-full">
                  <a
                    href={`#${section.id}`}
                    aria-label={label}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => setExpanded(false)}
                    className={`group relative flex h-8 w-8 items-center justify-center rounded-[var(--gh-radius-md)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] motion-reduce:transition-none md:h-8 md:w-full ${
                      isActive
                        ? 'text-[#f97316]'
                        : 'text-[var(--gh-text-secondary)] hover:text-[var(--gh-text-primary)]'
                    } ${expanded ? 'md:justify-start md:gap-2 md:px-2' : 'md:justify-center'}`}
                  >
                    <span className={isActive ? activeDotClass : inactiveDotClass} />

                    {/* Collapsed title tag - desktop / tablet */}
                    {!expanded && (
                      <span className="pointer-events-none absolute right-full mr-2 top-1/2 z-50 hidden max-h-[2.3em] max-w-[12rem] -translate-y-1/2 overflow-hidden whitespace-normal rounded-[var(--gh-radius-md)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-elevated)] px-2 py-1 text-xs text-[var(--gh-text-primary)] shadow-sm group-hover:block group-focus-visible:block md:max-w-[16rem] lg:max-w-none lg:overflow-visible lg:whitespace-nowrap">
                        {label}
                      </span>
                    )}

                    {/* Expanded title */}
                    {expanded && (
                      <span
                        className={`hidden text-xs break-words md:block md:whitespace-normal ${
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
              <NextIcon />
            </span>
          ) : (
            <a
              href={sectionHref(nextIndex)}
              className={activeControlClass}
              aria-label="Next slide"
            >
              <NextIcon />
            </a>
          )}

          {/* End */}
          {current === sections.length - 1 ? (
            <span className={disabledControlClass} aria-disabled="true" aria-label="End (already on last slide)">
              <EndIcon />
            </span>
          ) : (
            <a
              href={`#${sections[sections.length - 1].id}`}
              className={activeControlClass}
              aria-label="Go to end"
            >
              <EndIcon />
            </a>
          )}

          {/* Expand/collapse TOC */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="grow-toc"
            aria-label={expanded ? 'Collapse table of contents' : 'Expand table of contents'}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--gh-radius-md)] text-[var(--gh-text-secondary)] transition-colors hover:bg-[var(--gh-bg-surface)] hover:text-[var(--gh-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] motion-reduce:transition-none md:h-10 md:w-10"
          >
            <List />
          </button>
        </div>
      </nav>

      {/* Mobile TOC modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:hidden"
          onClick={() => setExpanded(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-[var(--gh-radius-lg)] border border-[var(--gh-border-subtle)] bg-[var(--gh-bg-base)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Table of contents"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--gh-text-primary)]">Chapters</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close table of contents"
                className="flex h-8 w-8 items-center justify-center rounded-[var(--gh-radius-md)] text-[var(--gh-text-secondary)] transition-colors hover:bg-[var(--gh-bg-surface)] hover:text-[var(--gh-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]"
              >
                <Close />
              </button>
            </div>
            <ol className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
              {sections.map((section, index) => {
                const isActive = current === index
                const label = `${formatNumber(section.number)} · ${section.headline}`
                return (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      onClick={() => setExpanded(false)}
                      className={`flex items-center gap-2 rounded-[var(--gh-radius-md)] px-2 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] ${
                        isActive
                          ? 'bg-[var(--gh-bg-elevated)] font-medium text-[#f97316]'
                          : 'text-[var(--gh-text-secondary)] hover:bg-[var(--gh-bg-surface)] hover:text-[var(--gh-text-primary)]'
                      }`}
                    >
                      <span className={isActive ? activeDotClass : inactiveDotClass} />
                      <span className="break-words">{label}</span>
                    </a>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
