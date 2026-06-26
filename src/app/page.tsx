import type { Metadata } from 'next'
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
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(8, 47, 73, 0.6) 0%, var(--gh-bg-base) 60%)',
      }}
    >
      {/* Hero */}
      <section className="flex flex-col items-center text-center max-w-2xl gap-6">
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

      {/* Features */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mt-20 w-full">
        <FeatureCard
          title="CHALLENGE FRIENDS"
          desc="Play against your friends in real-time or turn-based matches."
          gradient="linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)"
        />
        <FeatureCard
          title="DAILY COMPETITION"
          desc="A new challenge every day. Same events for everyone. Climb the leaderboard."
          gradient="linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%)"
        />
        <FeatureCard
          title="LEVEL UP"
          desc="Progressive difficulty. Train your intuition across centuries of history."
          gradient="linear-gradient(135deg, #2d1060 0%, #5b21b6 50%, #7c3aed 100%)"
        />
      </section>
    </main>
  )
}

function FeatureCard({ title, desc, gradient }: { title: string; desc: string; gradient: string }) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-3"
      style={{ background: gradient }}
    >
      <h2
        className="text-xl tracking-wide"
        style={{ fontFamily: 'var(--font-bebas), sans-serif' }}
      >
        {title}
      </h2>
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>{desc}</p>
    </div>
  )
}
