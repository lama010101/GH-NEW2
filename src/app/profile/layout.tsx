import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile — Guess History',
  description: 'View your Guess History player profile: rank, stats, and performance by game mode.',
  openGraph: {
    title: 'Profile — Guess History',
    description: 'View your Guess History player profile: rank, stats, and performance by game mode.',
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
