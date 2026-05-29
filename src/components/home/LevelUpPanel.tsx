'use client'

import styles from '@/app/home.module.css'

export function LevelUpPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className={`${styles['card-sub-panel']} ${styles['card-sub-panel-horizontal']}`}>
      <div className={styles['card-sub-panel-left']}>
        <div className={styles['card-sub-panel-row-stack']}>
          <ChartIcon />
          <span className={styles['card-sub-panel-text']}>Start your journey</span>
        </div>
        <div className={styles['card-sub-panel-muted']}>
          Climb the ranks and grow your history knowledge.
        </div>
      </div>
      <button
        onClick={onStart}
        className={`${styles['card-cta-btn']} ${styles['card-cta-btn-white-purple']}`}
      >
        PLAY NOW
      </button>
    </div>
  )
}

function ChartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="12" width="4" height="9" rx="1" fill="rgba(255,255,255,0.7)"/>
      <rect x="10" y="7" width="4" height="14" rx="1" fill="rgba(255,255,255,0.7)"/>
      <rect x="17" y="3" width="4" height="18" rx="1" fill="rgba(255,255,255,0.7)"/>
    </svg>
  )
}
