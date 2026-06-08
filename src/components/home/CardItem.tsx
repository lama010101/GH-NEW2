// LEGACY COMPONENT - Not used in vertical card layout (MP-UI-HOME-008)
// Kept for reference only

import Image from 'next/image'
import { CARD_GRADIENT, CARD_NAME, CARD_SUB, type Mode } from './types'
import styles from '@/app/home.module.css'

export function CardItem({ mode, selected, onSelect }: { mode: Mode; selected: boolean; onSelect: (m: Mode) => void }) {
  return (
    <button
      type="button"
      className={styles['card-item']}
      onClick={() => onSelect(mode)}
      style={{
        display: 'block',
        padding: 0,
        border: 'none',
        borderRadius: 16,
        background: 'transparent',
        overflow: 'hidden',
        cursor: 'pointer',
        outline: selected ? '3px solid rgba(255,255,255,0.7)' : '3px solid transparent',
        textAlign: 'initial',
        touchAction: 'manipulation',
        transform: selected ? 'translateY(-5px)' : 'none',
        transition: 'outline-color 0.18s, transform 0.15s',
      }}
    >
      <div style={{ width: '100%', aspectRatio: '5/4', position: 'relative', background: CARD_GRADIENT[mode], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 214, height: 214 }}>
          <Image
            src={
              mode === 'daily'    ? '/icons/daily_large.webp'    :
              mode === 'practice' ? '/icons/practice_large.webp' :
              mode === 'levelup'  ? '/icons/levels_large.webp'   :
                                    '/icons/compete_large.webp'
            }
            alt={CARD_NAME[mode]}
            fill
            style={{ objectFit: 'contain' }}
            sizes="160px"
          />
        </div>
        {mode === 'levelup' && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '3px 10px', fontSize: 10, color: '#fff', whiteSpace: 'nowrap', fontWeight: 600 }}>Level 5</div>
        )}
      </div>
      <div style={{ background: CARD_GRADIENT[mode], padding: '10px 8px 12px', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(12,12,18,0.8)' }} />
        <div style={{ position: 'relative', zIndex: 1, fontSize: 'var(--font-xs)', fontWeight: 800, letterSpacing: '1.5px', color: '#fff', textTransform: 'uppercase' }}>{CARD_NAME[mode]}</div>
        <div style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 500, letterSpacing: '1px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginTop: 3 }}>{CARD_SUB[mode]}</div>
      </div>
    </button>
  )
}
