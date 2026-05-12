import { useState } from 'react'

export function CompetePanel({ onLobby, playerId, displayName, onRequireAuth }: {
  onLobby: (gameId: string) => void
  playerId: string
  displayName: string
  onRequireAuth: () => void
}) {
  const [cmode, setCmode] = useState<'create'|'join'>('create')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [isFocused, setIsFocused] = useState(false)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['create', 'join'] as const).map(m => (
          <button key={m} onClick={() => { setCmode(m); setCode(''); setError(null) }}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
              border: cmode===m ? '2px solid #00adc1' : '1px solid rgba(255,255,255,0.15)',
              background: cmode===m ? 'rgba(0,173,193,0.2)' : 'rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
              {m === 'create' ? 'New Game' : 'Join with code'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {m === 'create' ? 'Create a lobby' : 'Enter room code'}
            </div>
          </button>
        ))}
      </div>

      {cmode === 'join' && (
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="ABCD12"
          maxLength={6}
          style={{ width: '100%', padding: '11px 14px',
            background: isFocused ? 'rgba(0,173,193,0.22)' : 'rgba(0,173,193,0.12)',
            border: isFocused ? '1px solid rgba(0,173,193,0.85)' : '1px solid rgba(0,173,193,0.55)',
            borderRadius: 10, color: '#fff',
            fontSize: 18, fontWeight: 700, letterSpacing: '4px', textAlign: 'center',
            outline: 'none', boxSizing: 'border-box',
            boxShadow: isFocused ? '0 0 0 3px rgba(0,173,193,0.25)' : '0 0 8px rgba(0,173,193,0.15)',
            transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s' }}
        />
      )}

      <button
        onClick={cmode === 'create' ? handleCreate : handleJoin}
        disabled={loading || (cmode === 'join' && code.length === 0)}
        style={{ width: '100%', padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 700,
          border: 'none', letterSpacing: '0.3px',
          cursor: loading || (cmode === 'join' && !code) ? 'not-allowed' : 'pointer',
          background: loading || (cmode === 'join' && !code)
            ? 'rgba(255,255,255,0.08)'
            : 'linear-gradient(135deg,#008b9a,#00adc1)',
          color: loading || (cmode === 'join' && !code)
            ? 'rgba(255,255,255,0.3)'
            : '#fff' }}>
        {loading
          ? (cmode === 'create' ? 'Creating...' : 'Joining...')
          : (cmode === 'create' ? 'Create Game' : 'Go to Lobby')}
      </button>

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center', marginTop: 2 }}>
          {error}
        </div>
      )}
    </div>
  )
}
