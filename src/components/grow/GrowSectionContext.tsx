'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { investorContent, type InvestorSection } from '@/lib/investorContent'

type GrowSectionContextValue = {
  current: number
  setCurrent: (index: number) => void
  sections: readonly InvestorSection[]
}

const GrowSectionContext = createContext<GrowSectionContextValue | null>(null)

export function GrowSectionProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState(0)

  return (
    <GrowSectionContext.Provider
      value={{ current, setCurrent, sections: investorContent.sections }}
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
