'use client';

import { useEffect, useState } from 'react';

const RAINBOW_GRADIENT =
  'linear-gradient(45deg, #c4b5fd 0%, #f9a8d4 20%, #fdba74 45%, #fde68a 70%, #86efac 100%)';

interface NavbarProps {
  onOpenModal: () => void;
}

export default function Navbar({ onOpenModal }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 0);
    }
    function onResize() {
      setIsMobile(window.innerWidth < 768);
    }
    onScroll();
    onResize();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  if (isMobile) {
    return (
      <nav
        style={{
          position: 'static',
          width: '100%',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.95)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
        }}
      >
        <Logo />
      </nav>
    );
  }

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 32px',
        background: scrolled ? 'rgba(0,0,0,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(8px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(8px)' : 'none',
        transition: 'background 200ms ease, backdrop-filter 200ms ease',
      }}
    >
      <Logo />
      <button
        type="button"
        onClick={onOpenModal}
        onMouseEnter={() => setCtaHover(true)}
        onMouseLeave={() => setCtaHover(false)}
        style={{
          background: RAINBOW_GRADIENT,
          color: '#000',
          fontWeight: 700,
          fontSize: '0.95rem',
          border: 'none',
          borderRadius: 9999,
          padding: '10px 24px',
          cursor: 'pointer',
          transform: ctaHover ? 'scale(1.05)' : 'scale(1)',
          transition: 'transform 200ms ease',
          fontFamily: 'inherit',
        }}
      >
        Start Playing
      </button>
    </nav>
  );
}

function Logo() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'Georgia, serif',
        fontWeight: 700,
        fontSize: '1.25rem',
        letterSpacing: '0.04em',
      }}
    >
      <span style={{ fontSize: '1.4rem' }} aria-hidden="true">
        🌐
      </span>
      <span style={{ color: '#fff' }}>GUESS-</span>
      <span
        style={{
          background: RAINBOW_GRADIENT,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        HISTORY
      </span>
    </div>
  );
}
