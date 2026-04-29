'use client';

import { useEffect, useState } from 'react';

const RAINBOW_GRADIENT =
  'linear-gradient(45deg, #c4b5fd 0%, #f9a8d4 20%, #fdba74 45%, #fde68a 70%, #86efac 100%)';

const CAROUSEL_IMAGES = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Schlacht_von_Trafalgar.jpg/1280px-Schlacht_von_Trafalgar.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/GoldenGateBridge-001.jpg/1280px-GoldenGateBridge-001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Apollo_17_Cernan_on_moon.jpg/1024px-Apollo_17_Cernan_on_moon.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/24701-nature-natural-beauty.jpg/1280px-24701-nature-natural-beauty.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Empire_State_Building_%28aerial_view%29.jpg/800px-Empire_State_Building_%28aerial_view%29.jpg',
];

interface HeroSectionProps {
  onOpenModal: () => void;
}

export default function HeroSection({ onOpenModal }: HeroSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [ctaHover, setCtaHover] = useState(false);

  useEffect(() => {
    // Preload all images
    CAROUSEL_IMAGES.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % CAROUSEL_IMAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {CAROUSEL_IMAGES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: i === activeIndex ? 1 : 0,
            transition: 'opacity 1.2s ease-in-out',
            zIndex: 0,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 1,
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '0 24px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            color: '#fff',
            textShadow: '2px 2px 8px rgba(0,0,0,0.9)',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
          }}
        >
          When and where did it happen?
        </h1>
        <p
          style={{
            fontSize: 'clamp(1rem, 2vw, 1.3rem)',
            color: 'rgba(255,255,255,0.85)',
            textShadow: '2px 2px 8px rgba(0,0,0,0.9)',
            marginTop: 16,
            marginBottom: 0,
          }}
        >
          Time travel through historical events.
        </p>
        <button
          type="button"
          onClick={onOpenModal}
          onMouseEnter={() => setCtaHover(true)}
          onMouseLeave={() => setCtaHover(false)}
          style={{
            background: RAINBOW_GRADIENT,
            color: '#000',
            fontWeight: 700,
            fontSize: '1.1rem',
            padding: '16px 48px',
            borderRadius: 9999,
            border: 'none',
            cursor: 'pointer',
            marginTop: 32,
            transform: ctaHover ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 200ms ease',
            fontFamily: 'inherit',
          }}
        >
          🎮 Start Playing
        </button>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.6)',
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          No signup needed · Play immediately as a guest
        </p>
      </div>
    </section>
  );
}
