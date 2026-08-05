import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import LandingV2 from '@/app/prototype/landing/page'

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
    verification: {
      google: '5iOhlzPH0rcqOzd4Lp_PKjsplXIpCSwqFmSw--xby7I',
    },
  }
}

export default function LandingPage() {
  return <LandingV2 />
}
