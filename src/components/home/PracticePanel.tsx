'use client'

import { useState } from 'react'
import { Toggle } from './Toggle'
import styles from '@/app/home.module.css'

export function PracticePanel({ onStart }: { onStart: () => void }) {
  const [timerOn, setTimerOn] = useState(false)
  const [yearsOn, setYearsOn] = useState(false)
  const [timerSec, setTimerSec] = useState(120)
  const [yearMin, setYearMin] = useState(-100)
  const [yearMax, setYearMax] = useState(2025)

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <>
      {/* Middle sub-panel with toggles */}
      <div className={styles['card-sub-panel']}>
        {/* Intro text */}
        <div className={styles['card-sub-panel-row']}>
          <TargetIcon />
          <span className={styles['card-sub-panel-text']}>Practice makes perfect</span>
        </div>
        <div className={styles['card-sub-panel-muted']} style={{ marginBottom: 8 }}>
          No pressure, just you and history.
        </div>

        {/* TIMER ROW */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <Toggle on={timerOn} onClick={() => setTimerOn(v => !v)} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500, flex: 1 }}>Round Timer</span>
          {timerOn && <span style={{ fontSize: 13, fontWeight: 700, color: '#fb923c' }}>{formatTimer(timerSec)}</span>}
        </div>
        {timerOn && (
          <div style={{ paddingLeft: 56, paddingRight: 8, paddingBottom: 8 }}>
            <input
              type="range"
              min={5} max={300} step={5}
              value={timerSec}
              onChange={e => setTimerSec(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fb923c', cursor: 'pointer' }}
            />
          </div>
        )}

        {/* YEARS ROW */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <Toggle on={yearsOn} onClick={() => setYearsOn(v => !v)} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500, flex: 1 }}>Years</span>
          {yearsOn && (
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fb923c' }}>{yearMin}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', margin: '0 6px' }}>—</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fb923c' }}>{yearMax}</span>
            </span>
          )}
        </div>
        {yearsOn && (
          <div style={{ paddingLeft: 56, paddingRight: 8, paddingBottom: 4 }}>
            <div className={styles['range-wrap']}>
              <div className={styles['range-track']} />
              <div className={styles['range-fill']} style={{
                left: `${((yearMin - (-100)) / (2025 - (-100))) * 100}%`,
                right: `${100 - ((yearMax - (-100)) / (2025 - (-100))) * 100}%`,
              }} />
              <input
                type="range"
                min={-100} max={2025} step={1}
                value={yearMin}
                onChange={e => {
                  const v = Number(e.target.value)
                  if (v < yearMax - 1) setYearMin(v)
                }}
                style={{ zIndex: yearMin > 2000 ? 5 : 3 }}
              />
              <input
                type="range"
                min={-100} max={2025} step={1}
                value={yearMax}
                onChange={e => {
                  const v = Number(e.target.value)
                  if (v > yearMin + 1) setYearMax(v)
                }}
                style={{ zIndex: 4 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* CTA button */}
      <button
        onClick={onStart}
        className={`${styles['card-cta-btn']} ${styles['card-cta-btn-white-orange']}`}
      >
        PRACTICE NOW
      </button>
    </>
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
