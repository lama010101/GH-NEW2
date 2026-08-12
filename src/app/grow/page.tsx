import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { investorContent } from '@/lib/investorContent'
import InvestorFooter from '@/components/grow/InvestorFooter'
import InvestorProgress from '@/components/grow/InvestorProgress'
import GrowNavRail from '@/components/grow/GrowNavRail'
import { GrowSectionProvider } from '@/components/grow/GrowSectionContext'
import Section01Hook from '@/components/grow/Section01Hook'
import Section02Game from '@/components/grow/Section02Game'
import Section03HumanData from '@/components/grow/Section03HumanData'
import Section04HumanVsAI from '@/components/grow/Section04HumanVsAI'
import Section05Evaluation from '@/components/grow/Section05Evaluation'
import Section06DataMoat from '@/components/grow/Section06DataMoat'
import Section07TestModel from '@/components/grow/Section07TestModel'
import Section08RecurringRevenue from '@/components/grow/Section08RecurringRevenue'
import Section09BusinessModel from '@/components/grow/Section09BusinessModel'
import Section10Flywheel from '@/components/grow/Section10Flywheel'
import Section11Platform from '@/components/grow/Section11Platform'
import Section12Investment from '@/components/grow/Section12Investment'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
})

export const metadata: Metadata = {
  title: `${investorContent.title} — Investor Deck`,
  description:
    'A cinematic investor presentation: from a history game to a human-grounded visual AI benchmark.',
  openGraph: {
    images: [
      {
        url: '/home_background.webp',
        alt: 'Guess History investor deck',
      },
    ],
  },
}

export default function GrowPage() {
  return (
    <main
      data-grow-snap
      className={`${dmSans.className} min-h-screen bg-[var(--gh-bg-base)] text-[var(--gh-text-primary)]`}
    >
      <GrowSectionProvider>
        <InvestorProgress />
        <GrowNavRail />
        <Section01Hook />
        <Section02Game />
        <Section03HumanData />
        <Section04HumanVsAI />
        <Section05Evaluation />
        <Section06DataMoat />
        <Section07TestModel />
        <Section08RecurringRevenue />
        <Section09BusinessModel />
        <Section10Flywheel />
        <Section11Platform />
        <Section12Investment />
        <InvestorFooter />
      </GrowSectionProvider>
    </main>
  )
}
