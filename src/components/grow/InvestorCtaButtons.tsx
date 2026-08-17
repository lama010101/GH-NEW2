'use client'

import Link from 'next/link'
import { investorContent } from '@/lib/investorContent'
import type { InvestorCTA } from '@/lib/investorContent'

type InvestorCtaButtonsProps = {
  ids: InvestorCTA['id'][]
  className?: string
}

const variantClass: Record<InvestorCTA['variant'], string> = {
  primary:
    'bg-gradient-to-br from-[#fb923c] to-[#f97316] text-[#1a0a00] shadow-[0_0_16px_rgba(251,146,60,.35),0_2px_8px_rgba(0,0,0,.3)] hover:translate-y-[-2px] hover:shadow-[0_0_24px_rgba(251,146,60,.45),0_4px_12px_rgba(0,0,0,.35)]',
  secondary:
    'border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] text-[var(--gh-text-primary)] hover:bg-[var(--gh-bg-elevated)]',
}

export default function InvestorCtaButtons({ ids, className }: InvestorCtaButtonsProps) {
  const ctas = ids
    .map((id) => investorContent.ctas.find((cta) => cta.id === id))
    .filter((cta): cta is InvestorCTA => Boolean(cta))

  if (ctas.length === 0) return null

  return (
    <div className={className ?? 'flex flex-wrap items-center justify-center gap-3'}>
      {ctas.map((cta) => (
        <Link
          key={cta.id}
          href={cta.href}
          className={`inline-flex items-center justify-center rounded-[var(--gh-radius-pill)] px-6 py-3 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-orange)] ${variantClass[cta.variant]}`}
        >
          {cta.label}
        </Link>
      ))}
    </div>
  )
}
