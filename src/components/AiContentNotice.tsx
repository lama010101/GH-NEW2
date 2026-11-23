'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { HowWeWorkModal } from './HowWeWorkModal'
import styles from './AiContentNotice.module.css'

/**
 * V1-BUILD-AIDISCLAIMER-1123-843 — slim, always-visible AI-content notice on
 * the home page. The "How we work" link opens HowWeWorkModal. Placed below
 * the mode cards so it never pushes them off narrow viewports.
 */
export function AiContentNotice() {
  const t = useTranslations('aiNotice')
  const [howWeWorkOpen, setHowWeWorkOpen] = useState(false)

  return (
    <>
      <p className={styles.note}>
        <span className={styles.short}>{t('short')}</span>
        <button
          type="button"
          className={styles.link}
          onClick={() => setHowWeWorkOpen(true)}
        >
          {t('link')}
        </button>
      </p>
      <HowWeWorkModal isOpen={howWeWorkOpen} onClose={() => setHowWeWorkOpen(false)} />
    </>
  )
}
