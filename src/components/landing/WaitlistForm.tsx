'use client'

import { useState } from 'react'

type Status = 'idle' | 'submitting' | 'success' | 'already' | 'error'

export function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || status === 'submitting') return
    setStatus('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.status === 201) {
        setStatus('success')
      } else if (res.status === 409) {
        setStatus('already')
      } else if (res.status === 400) {
        setStatus('error')
        setErrorMsg('Please enter a valid email address.')
      } else {
        setStatus('error')
        setErrorMsg('Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  if (status === 'success') {
    return <p className="text-lg font-semibold" style={{ color: 'var(--gh-success)' }}>You're on the list!</p>
  }

  if (status === 'already') {
    return <p className="text-lg font-semibold" style={{ color: 'var(--gh-teal)' }}>You're already on the list!</p>
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={status === 'submitting'}
        required
        className="flex-1 px-4 py-3 rounded-lg text-white outline-none"
        style={{
          backgroundColor: 'var(--gh-bg-input)',
          border: '1px solid var(--gh-border-default)',
        }}
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="px-6 py-3 rounded-lg font-semibold text-white transition-opacity disabled:opacity-50"
        style={{
          background: 'linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)',
        }}
      >
        {status === 'submitting' ? 'Joining…' : 'Join Waitlist'}
      </button>
      {status === 'error' && errorMsg && (
        <p className="text-sm mt-1" style={{ color: 'var(--gh-danger)' }}>{errorMsg}</p>
      )}
    </form>
  )
}
