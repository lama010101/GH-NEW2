'use client';

import { useEffect, useState } from 'react';

const RAINBOW_GRADIENT =
  'linear-gradient(45deg, #c4b5fd 0%, #f9a8d4 20%, #fdba74 45%, #fde68a 70%, #86efac 100%)';

interface StickyCTAProps {
  onOpenModal: () => void;
}

export default function StickyCTA({ onOpenModal }: StickyCTAProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 768);
    }
    function onScroll() {
      setScrolled(window.scrollY > 100);
    }
    onResize();
    onScroll();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  if (isMobile) {
    return (
      <button
        type="button"
        onClick={onOpenModal}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 500,
          width: '100%',
          background: RAINBOW_GRADIENT,
          color: '#000',
          padding: 16,
          textAlign: 'center',
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          fontFamily: 'inherit',
        }}
      >
        🎮 Start Playing
      </button>
    );
  }

  if (!scrolled) return null;

  return (
    <button
      type="button"
      onClick={onOpenModal}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Start Playing"
      style={{
        position: 'fixed',
        bottom: 32,
        right: 32,
        zIndex: 500,
        width: 64,
        height: 64,
        borderRadius: 9999,
        background: RAINBOW_GRADIENT,
        color: '#000',
        fontSize: '1.5rem',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        transform: hover ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 200ms ease',
        fontFamily: 'inherit',
      }}
    >
      🎯
    </button>
  );
}
