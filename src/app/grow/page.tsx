import { getTranslations } from 'next-intl/server'
import { DM_Sans } from 'next/font/google'
import HeroSection from '@/components/grow/HeroSection'
import MissionSection from '@/components/grow/MissionSection'
import ProblemSection from '@/components/grow/ProblemSection'
import VisionSection from '@/components/grow/VisionSection'
import ProductSection from '@/components/grow/ProductSection'
import WhyItWorksSection from '@/components/grow/WhyItWorksSection'
import MarketSection from '@/components/grow/MarketSection'
import BusinessModelSection from '@/components/grow/BusinessModelSection'
import GovernanceSection from '@/components/grow/GovernanceSection'
import FinancialModelSection from '@/components/grow/FinancialModelSection'
import PartnershipsSection from '@/components/grow/PartnershipsSection'
import ContributorsSection from '@/components/grow/ContributorsSection'
import RoadmapSection from '@/components/grow/RoadmapSection'
import RisksSection from '@/components/grow/RisksSection'
import FaqSection from '@/components/grow/FaqSection'
import CtaSection from '@/components/grow/CtaSection'
import FooterSection from '@/components/grow/FooterSection'
import GrowStickyNav from '@/components/grow/GrowStickyNav'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
})

export async function generateMetadata() {
  const t = await getTranslations('grow')
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  }
}

export default function GrowPage() {
  return (
    <main className={`${dmSans.className} min-h-screen bg-[var(--gh-bg-base)] text-[var(--gh-text-primary)]`}>
      <GrowStickyNav />
      <HeroSection />
      <MissionSection />
      <ProblemSection />
      <VisionSection />
      <ProductSection />
      <WhyItWorksSection />
      <MarketSection />
      <BusinessModelSection />
      <GovernanceSection />
      <FinancialModelSection />
      <PartnershipsSection />
      <ContributorsSection />
      <RoadmapSection />
      <RisksSection />
      <FaqSection />
      <CtaSection />
      <FooterSection />
    </main>
  )
}
