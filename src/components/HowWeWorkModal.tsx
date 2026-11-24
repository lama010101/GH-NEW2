'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import styles from './HowWeWorkModal.module.css'

/**
 * V1-BUILD-AIDISCLAIMER-1123-843 — "How we work" explainer opened from the
 * home-page AI-content notice. Shell follows the repo modal convention
 * (RankModal / EventLearnModal): portal to document.body, role="dialog",
 * aria-modal, Escape to close, focus moved inside on open and restored on
 * close, plus a Tab/Shift+Tab focus trap. {appName} in the copy is filled
 * from the existing brand i18n value landing.logo_alt ("Dig the Past").
 */
interface HowWeWorkModalProps {
  isOpen: boolean
  onClose: () => void
}

export function HowWeWorkModal({ isOpen, onClose }: HowWeWorkModalProps) {
  const t = useTranslations('aiNotice')
  const tLanding = useTranslations('landing')
  const tHow = useTranslations('howWeWork')
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        const inside = active instanceof HTMLElement && dialog.contains(active)
        if (e.shiftKey && (!inside || active === first)) {
          last.focus()
          e.preventDefault()
        } else if (!e.shiftKey && (!inside || active === last)) {
          first.focus()
          e.preventDefault()
        }
      }
    }
    document.addEventListener('keydown', handler)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handler)
      previouslyFocused?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const appName = tLanding('logo_alt')

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className={styles.title}>
          {t('title', { appName })}
        </h2>
        <p className={styles.body}>{t('body1')}</p>
        <p className={styles.body}>{t('body2')}</p>
        <p className={styles.body}>{t('body3', { appName })}</p>
        <Link href="/how-we-work" className={styles.closeButton}>
          {tHow('learn_more')}
        </Link>
        <button
          ref={closeRef}
          type="button"
          className={styles.closeButton}
          onClick={onClose}
        >
          {t('close')}
        </button>
      </div>
    </div>,
    document.body
  )
}
