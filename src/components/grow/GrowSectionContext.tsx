'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { getInvestorContent, type InvestorContent } from '@/lib/investorContent'

type GrowSectionContextValue = {
  current: number
  setCurrent: (index: number) => void
  content: InvestorContent
}

const GrowSectionContext = createContext<GrowSectionContextValue | null>(null)

export function GrowSectionProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState(0)
  const t = useTranslations('grow_deck')
  const content = useMemo(() => getInvestorContent(t), [t])

  return (
    <GrowSectionContext.Provider
      value={{ current, setCurrent, content }}
    >
      {children}
    </GrowSectionContext.Provider>
  )
}

export function useGrowSection() {
  const ctx = useContext(GrowSectionContext)
  if (!ctx) {
    throw new Error('useGrowSection must be used inside GrowSectionProvider')
  }
  return ctx
}
