'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import styles from './DailyShareCard.module.css'

interface DailyShareCardProps {
  text: string | null
}

export default function DailyShareCard({ text }: DailyShareCardProps) {
  const t = useTranslations('daily')
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  if (!text) return null

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text })
      } catch (err) {
        if ((err as { name?: string } | null)?.name !== 'AbortError') {
          // Non-cancellation share failure — nothing actionable client-side.
        }
      }
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <div className={styles.card}>
      <pre className={styles.cardText} dir="ltr">{text}</pre>
      <button
        type="button"
        className={styles.shareButton}
        onClick={handleShare}
        aria-label={t('share_aria')}
      >
        {copied ? t('share_copied') : t('share_button')}
      </button>
    </div>
  )
}
