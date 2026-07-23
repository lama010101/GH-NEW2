'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

export default function HeroSection() {
  const t = useTranslations('grow.hero')
  const router = useRouter()

  const scrollToMission = () => {
    const el = document.getElementById('mission')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      id="hero"
      className="relative flex min-h-[90vh] flex-col items-center justify-center px-4 py-16 text-center md:min-h-screen"
    >
      <div className="absolute inset-0 -z-10">
        <Image
          src="/home_background.webp"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
      </div>

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6">
        <h1 className="text-4xl font-bold text-[var(--gh-text-primary)] md:text-6xl">
          Guess-History
        </h1>
        <p className="text-lg text-[var(--gh-text-secondary)] md:text-xl">
          {t('tagline')}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push('/home')}
            data-analytics="grow-hero-primary-cta"
            className="rounded-[var(--gh-radius-md)] bg-[var(--gh-orange)] px-6 py-3 font-semibold text-[var(--gh-btn-text)] transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {t('primary_cta')}
          </button>
          <button
            type="button"
            onClick={scrollToMission}
            data-analytics="grow-hero-secondary-cta"
            className="rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-white/10 px-6 py-3 font-medium text-[var(--gh-text-primary)] backdrop-blur transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {t('secondary_cta')}
          </button>
        </div>
      </div>
    </section>
  )
}
