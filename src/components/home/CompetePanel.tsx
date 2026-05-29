'use client'

import { useState } from 'react'
import styles from '@/app/home.module.css'

export function CompetePanel({ onLobby, playerId, displayName, onRequireAuth }: {
  onLobby: (gameId: string) => void
  playerId: string
  displayName: string
  onRequireAuth: () => void
}) {
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)

  const handleCreate = async () => {
    if (!playerId) { onRequireAuth(); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compete/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          displayName,
          mode: 'sync',
          roundTimerSec: 120,
          totalRounds: 5,
          yearMin: -100,
          yearMax: 2025,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      onLobby(data.gameId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating game')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!playerId) { onRequireAuth(); return }
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compete/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Room not found')
      onLobby(data.gameId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Room not found')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinClick = () => {
    if (!showJoinInput) {
      setShowJoinInput(true)
      return
    }
    handleJoin()
  }

  return (
    <>
      {/* Middle sub-panel */}
      <div className={styles['card-sub-panel']}>
        <div className={styles['card-sub-panel-row']}>
          <CrossedSwordsIcon />
          <span className={styles['card-sub-panel-text']}>Challenge others or join a game to get started!</span>
        </div>
      </div>

      {/* Join code input (shown when JOIN GAME clicked) */}
      {showJoinInput && (
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABCD12"
          maxLength={6}
          className={styles['join-code-input']}
          autoFocus
        />
      )}

      {/* CTA buttons */}
      <div className={styles['card-cta-row']}>
        <button
          onClick={handleCreate}
          disabled={loading}
          className={`${styles['card-cta-btn']} ${styles['card-cta-btn-blue']}`}
        >
          <PlusIcon /> CREATE GAME
        </button>
        <button
          onClick={handleJoinClick}
          disabled={loading || (showJoinInput && !code)}
          className={`${styles['card-cta-btn']} ${styles['card-cta-btn-outline']}`}
        >
          {showJoinInput ? 'GO TO LOBBY' : 'JOIN GAME'}
        </button>
      </div>

      {error && (
        <div className={styles['error-text']}>
          {error}
        </div>
      )}
    </>
  )
}

function CrossedSwordsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 19l6-6" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 16l4 4" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 21l2-2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.5 6.5L21 18v3h-3L6.5 9.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 9L3 12" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 9l3 3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
