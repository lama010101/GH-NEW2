'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function FooterSection() {
  const t = useTranslations('grow.footer')
  const router = useRouter()

  return (
    <footer
      id="footer"
      className="border-t border-[var(--gh-border-subtle)] px-4 py-12 text-sm text-[var(--gh-text-muted)]"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:justify-between">
        <div className="flex flex-col gap-1">
          <span>{t('sources')}</span>
          <span>{t('references')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span>{t('legal')}</span>
          <button
            type="button"
            onClick={() => router.push('/privacy')}
            className="text-left underline hover:text-[var(--gh-text-primary)]"
          >
            {t('privacy')}
          </button>
        </div>
      </div>
    </footer>
  )
}
