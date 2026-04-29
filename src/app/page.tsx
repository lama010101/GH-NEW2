'use client';

import { useState } from 'react';
import Navbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import StickyCTA from '@/components/landing/StickyCTA';
import AuthModal from '@/components/landing/AuthModal';

export default function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <main style={{ background: '#000', minHeight: '100vh', color: '#fff' }}>
      <Navbar onOpenModal={openModal} />
      <HeroSection onOpenModal={openModal} />
      <StickyCTA onOpenModal={openModal} />
      <AuthModal isOpen={isModalOpen} onClose={closeModal} />
    </main>
  );
}
