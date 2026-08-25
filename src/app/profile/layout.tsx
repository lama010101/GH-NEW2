import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile — Guess History',
  description: 'View your Guess History player profile: rank, stats, and performance by game mode.',
  openGraph: {
    title: 'Profile — Guess History',
    description: 'View your Guess History player profile: rank, stats, and performance by game mode.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Guess History — Find clues. Become a historian.' }],
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
