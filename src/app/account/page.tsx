'use client'

import { useRouter } from 'next/navigation'

export default function AccountPage() {
  const router = useRouter()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0e0c',
      color: '#f5f0e8',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#0f0e0c',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f5f0e8', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ fontSize: 18 }}>←</span> Back
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Account</span>
        <div style={{ width: 60 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center' }}>
        <span style={{ fontSize: 40 }}>⚙️</span>
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Account — coming soon</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0, maxWidth: 280 }}>
          Profile settings, email, password, and connected accounts will appear here.
        </p>
      </div>
    </div>
  )
}
