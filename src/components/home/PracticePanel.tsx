import styles from '@/app/home.module.css'

export function PracticePanel({ onStart }: { onStart: () => void }) {
  return (
    <div className={`${styles['card-sub-panel']} ${styles['card-sub-panel-horizontal']}`}>
      <div className={styles['card-sub-panel-left']}>
        <div className={styles['card-sub-panel-row-stack']}>
          <TargetIcon />
          <span className={styles['card-sub-panel-text']}>Practice makes perfect</span>
        </div>
        <div className={styles['card-sub-panel-muted']}>
          No pressure, just you and history.
        </div>
      </div>
      <button
        onClick={onStart}
        className={`${styles['card-cta-btn']} ${styles['card-cta-btn-white-orange']}`}
      >
        PRACTICE NOW
      </button>
    </div>
  )
}

function TargetIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="6" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="3" fill="rgba(255,255,255,0.7)"/>
      <path d="M12 3V6M12 18V21M3 12H6M18 12H21" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
    </svg>
  )
}
