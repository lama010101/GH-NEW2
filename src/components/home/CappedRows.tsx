'use client'

// CappedRows (HOME-FIX-CHALLENGECARD-ROWCAP-1015-001) — accordion section body
// wrapper that caps its visible height at `maxRows` real rendered rows and
// scrolls internally for the rest. Row height is not known statically (avatar
// ring, font tokens, locale text), so the cap is measured after layout from
// descendants marked `data-cap-row`. With <= maxRows marked rows (or the
// empty/loading states, which have none) the container renders uncapped,
// exactly as before. The container must be position:relative + border-box so
// row.offsetTop/offsetHeight measure against its padding box.

import { useLayoutEffect, useRef, type ReactNode } from 'react'

interface CappedRowsProps {
  className: string
  maxRows: number
  children: ReactNode
}

export function CappedRows({ className, maxRows, children }: CappedRowsProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = () => {
      const rows = el.querySelectorAll<HTMLElement>('[data-cap-row]')
      if (rows.length > maxRows) {
        const last = rows[maxRows - 1]
        const paddingBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0
        el.style.maxHeight = `${last.offsetTop + last.offsetHeight + paddingBottom}px`
        el.style.overflowY = 'auto'
      } else {
        el.style.maxHeight = ''
        el.style.overflowY = ''
      }
    }

    apply()

    const ro = new ResizeObserver(apply)
    ro.observe(el)
    const firstRow = el.querySelector<HTMLElement>('[data-cap-row]')
    if (firstRow) ro.observe(firstRow)
    return () => ro.disconnect()
  }, [children, maxRows])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
