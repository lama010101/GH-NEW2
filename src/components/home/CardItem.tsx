// LEGACY COMPONENT - Not used in vertical card layout (MP-UI-HOME-008)
// Kept for reference only
// BUG: "Level 5" is hardcoded — should reflect actual player level dynamically.

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { CARD_GRADIENT, CARD_NAME, CARD_SUB, type Mode } from './types'
import styles from '@/app/home.module.css'

export function CardItem({ mode, selected, onSelect }: { mode: Mode; selected: boolean; onSelect: (m: Mode) => void }) {
  const t = useTranslations('home')
  return (
    <button
      type="button"
      className={`${styles['card-item-btn']} ${selected ? styles['card-item-btn-selected'] : ''}`}
      onClick={() => onSelect(mode)}
    >
      <div className={styles.cardArtZone} style={{ background: CARD_GRADIENT[mode] }}>
        <div className={styles.cardIconWrap}>
          <Image
            src={
              mode === 'daily'    ? '/icons/daily_large.webp'    :
              mode === 'practice' ? '/icons/practice_large.webp' :
              mode === 'levelup'  ? '/icons/levels_large.webp'   :
                                    '/icons/compete_large.webp'
            }
            alt={CARD_NAME[mode]}
            fill
            className={styles.cardIconImg}
            sizes="160px"
          />
        </div>
        {mode === 'levelup' && (
          <div className={styles.cardLevelBadge}>{t('level_badge')}</div>
        )}
      </div>
      <div className={styles.cardLabelBar}>
        <div className={styles['card-label-overlay']} />
        <div className={styles.cardLabelName}>{CARD_NAME[mode]}</div>
        <div className={styles.cardLabelSub}>{CARD_SUB[mode]}</div>
      </div>
    </button>
  )
}
