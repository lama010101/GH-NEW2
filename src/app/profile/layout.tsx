import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile — SUPOZI',
  description: 'View your SUPOZI player profile: rank, stats, and performance by game mode.',
  openGraph: {
    title: 'Profile — SUPOZI',
    description: 'View your SUPOZI player profile: rank, stats, and performance by game mode.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SUPOZI — Find clues. Become a historian.' }],
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
