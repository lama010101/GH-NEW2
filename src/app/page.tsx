import type { Metadata } from 'next'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { WaitlistForm } from '@/components/landing/WaitlistForm'
import styles from './page.module.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing')
  const title = t('meta_title')
  const description = t('meta_description')
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
  }
}

export default async function LandingPage() {
  const t = await getTranslations('landing')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Background image + dark overlay (same as /home) */}
      <div aria-hidden="true" className={styles.bgImage} />
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'var(--gh-modal-overlay)' }} />

      {/* Logo (same asset as TopBar) */}
      <Image src="/icons/logo.webp" alt={t('logo_alt')} width={360} height={96} priority style={{ position: 'relative', zIndex: 2, marginBottom: '2rem' }} />

      {/* Hero */}
      <section className="flex flex-col items-center text-center max-w-2xl gap-6" style={{ position: 'relative', zIndex: 2 }}>
        <p
          className="text-xl sm:text-2xl"
          style={{ fontFamily: 'var(--font-sora), sans-serif', color: 'var(--gh-text-primary)' }}
        >
          {t('tagline')}
        </p>

        <p
          className="text-base sm:text-lg max-w-xl"
          style={{ color: 'var(--gh-text-secondary)' }}
        >
          {t('hero_description')}
        </p>

        {/* Waitlist capture */}
        <div className="flex flex-col items-center gap-2 mt-4 w-full">
          <p className="text-sm" style={{ color: 'var(--gh-text-muted)' }}>
            {t('waitlist_prompt')}
          </p>
          <WaitlistForm />
        </div>
      </section>
    </main>
  )
}
