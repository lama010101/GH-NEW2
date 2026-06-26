import type { Metadata } from 'next'
import Image from 'next/image'
import { WaitlistForm } from '@/components/landing/WaitlistForm'

export const metadata: Metadata = {
  title: 'Guess-History — Test Your Knowledge of When and Where',
  description:
    'A historical guessing game. See real events from history and guess the exact year and location. Challenge friends, climb the leaderboard, and prove your history skills.',
  openGraph: {
    title: 'Guess-History — Test Your Knowledge of When and Where',
    description:
      'A historical guessing game. See real events from history and guess the exact year and location. Challenge friends, climb the leaderboard, and prove your history skills.',
    type: 'website',
  },
}

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Background image + dark overlay (same as /home) */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'url(/home_background.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(0, 0, 0, 0.8)' }} />

      {/* Logo (same asset as TopBar) */}
      <Image src="/icons/logo.webp" alt="Guess-History" width={180} height={48} priority style={{ position: 'relative', zIndex: 2, marginBottom: '2rem' }} />

      {/* Hero */}
      <section className="flex flex-col items-center text-center max-w-2xl gap-6" style={{ position: 'relative', zIndex: 2 }}>
        <h1
          className="text-5xl sm:text-7xl leading-none tracking-wide"
          style={{
            fontFamily: 'var(--font-bebas), sans-serif',
            background: 'linear-gradient(135deg, #22d3ee 0%, #0369a1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Guess-History
        </h1>

        <p
          className="text-xl sm:text-2xl"
          style={{ fontFamily: 'var(--font-sora), sans-serif', color: 'var(--gh-text-primary)' }}
        >
          Where and when did it happen?
        </p>

        <p
          className="text-base sm:text-lg max-w-xl"
          style={{ color: 'var(--gh-text-secondary)' }}
        >
          Test your knowledge of history. See real events and guess the exact year and location.
          Challenge your friends, climb the leaderboard, and prove you know your history.
        </p>

        {/* Waitlist capture */}
        <div className="flex flex-col items-center gap-2 mt-4 w-full">
          <p className="text-sm" style={{ color: 'var(--gh-text-muted)' }}>
            Join the waitlist to get early access:
          </p>
          <WaitlistForm />
        </div>
      </section>
    </main>
  )
}
