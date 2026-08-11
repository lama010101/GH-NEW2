'use client'

import { useRouter } from 'next/navigation'
import { investorContent } from '@/lib/investorContent'

type InvestorCTAProps = {
  actions: ('register' | 'play' | 'test')[]
  className?: string
}

export default function InvestorCTA({ actions, className = '' }: InvestorCTAProps) {
  const router = useRouter()
  const ctaMap = new Map(investorContent.ctas.map((cta) => [cta.id, cta]))

  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      {actions.map((id) => {
        const cta = ctaMap.get(id)
        if (!cta) return null

        const isPrimary = cta.variant === 'primary'

        return (
          <button
            key={id}
            type="button"
            onClick={() => router.push(cta.href)}
            data-analytics={`investor-cta-${id}`}
            className={`rounded-[var(--gh-radius-md)] px-6 py-3 font-semibold transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              isPrimary
                ? 'bg-[var(--gh-orange)] text-[var(--gh-btn-text)]'
                : 'border border-[var(--gh-border-default)] bg-white/10 text-[var(--gh-text-primary)] backdrop-blur hover:bg-white/20'
            }`}
          >
            {cta.label}
          </button>
        )
      })}
    </div>
  )
}
