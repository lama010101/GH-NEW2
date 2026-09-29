'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import RankCard from '@/components/RankCard'
import modalStyles from '@/components/AuthModal.module.css'

// Rank detail modal opened from the TopBar rank pill
// (HOME-BUILD-PURPLESTAGE-RANKMODAL-003). Shows the shared RankCard content
// (rank title, total XP, progress to next tier) — rankForXp stays the single
// source of truth, no new fetch. Reuses the modal design tokens via
// AuthModal.module.css (same convention as RelaxPwaInterstitialModal) and
// portals to document.body: TopBar's container has opacity<1, which would
// otherwise trap this position:fixed overlay inside the bar.

interface RankModalProps {
  isOpen: boolean
  onClose: () => void
  totalXp: number | null
}

export default function RankModal({ isOpen, onClose, totalXp }: RankModalProps) {
  const tNav = useTranslations('nav')
  const tRank = useTranslations('rank')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handler)
      previouslyFocused?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      className={modalStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={tRank('rank_label')}
      onClick={onClose}
    >
      <div className={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          type="button"
          className={modalStyles.closeButton}
          onClick={onClose}
          aria-label={tNav('close')}
        >
          ×
        </button>
        <RankCard totalXp={totalXp} open bare />
      </div>
    </div>,
    document.body
  )
}
