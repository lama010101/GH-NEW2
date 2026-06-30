'use client'

import { useTranslations } from 'next-intl'
import styles from './PracticePanel.module.css'

export function PracticePanel({ onStart }: { onStart: () => void }) {
  const t = useTranslations('home')
  return (
    <button className={styles.startButton} onClick={onStart}>
      {t('practice_start')}
    </button>
  )
}
