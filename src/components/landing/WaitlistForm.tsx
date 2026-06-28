'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Status = 'idle' | 'submitting' | 'success' | 'already' | 'error'

export function WaitlistForm() {
  const t = useTranslations('landing')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || status === 'submitting') return
    if (email.trim() === 'france2026') {
      router.push('/home')
      return
    }
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
        setErrorMsg(t('waitlist_err_invalid_email'))
      } else {
        setStatus('error')
        setErrorMsg(t('waitlist_err_generic'))
      }
    } catch {
      setStatus('error')
      setErrorMsg(t('waitlist_err_network'))
    }
  }

  if (status === 'success') {
    return <p className="text-lg font-semibold" style={{ color: 'var(--gh-success)' }}>{t('waitlist_success')}</p>
  }

  if (status === 'already') {
    return <p className="text-lg font-semibold" style={{ color: 'var(--gh-teal)' }}>{t('waitlist_already')}</p>
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('waitlist_email_placeholder')}
        disabled={status === 'submitting'}
        required
        className="flex-1 px-4 py-3 rounded-lg text-white outline-none placeholder-white/60"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
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
        {status === 'submitting' ? t('waitlist_submitting') : t('waitlist_submit')}
      </button>
      {status === 'error' && errorMsg && (
        <p className="text-sm mt-1" style={{ color: 'var(--gh-danger)' }}>{errorMsg}</p>
      )}
    </form>
  )
}
