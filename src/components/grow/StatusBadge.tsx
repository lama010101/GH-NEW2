'use client'

import { useTranslations } from 'next-intl'
import type { SectionStatus } from '@/lib/investorContent'

type StatusBadgeProps = {
  status: SectionStatus
  label?: string
}

const statusStyles: Record<SectionStatus, string> = {
  verified:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  illustrative:
    'border-amber-500/30 bg-amber-500/10 text-amber-300',
  roadmap:
    'border-[var(--gh-blue)]/30 bg-[var(--gh-blue)]/10 text-[var(--gh-blue)]',
  conceptual:
    'border-[var(--gh-gold)]/30 bg-[var(--gh-gold)]/10 text-[var(--gh-gold)]',
}

const statusKeys: Record<SectionStatus, string> = {
  verified: 'status_verified',
  illustrative: 'status_illustrative',
  roadmap: 'status_roadmap',
  conceptual: 'status_conceptual',
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const t = useTranslations('grow_deck')
  return (
    <span
      className={`inline-flex items-center rounded-[var(--gh-radius-pill)] border px-3 py-1 text-xs font-medium uppercase tracking-wide ${statusStyles[status]}`}
    >
      {label ?? t(statusKeys[status])}
    </span>
  )
}
