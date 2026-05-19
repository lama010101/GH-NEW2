import React, { useState, useEffect, useRef } from "react";

interface Badge {
  dimension: 'year' | 'location' | 'combo';
  tier: 'gold' | 'silver' | 'bronze';
  accuracy: number;
}

interface NearMiss {
  dimension: 'year' | 'location' | 'combo';
  accuracy: number;
}

interface BadgePopupProps {
  badges: Badge[];
  nearMisses: NearMiss[];
  onDismiss: () => void;
}

export default function BadgePopup({ badges, nearMisses, onDismiss }: BadgePopupProps) {
  const [currentBadgeIndex, setCurrentBadgeIndex] = useState(0);
  const [showNearMisses, setShowNearMisses] = useState(false);
  const [showTapToContinue, setShowTapToContinue] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const badgeCardRef = useRef<HTMLDivElement>(null);

  const tierColor: Record<string, string> = {
    gold: '#ffd700',
    silver: '#c0c0c0',
    bronze: '#cd7f32',
  };

  const dimLabel: Record<string, string> = {
    location: 'WHERE',
    year: 'WHEN',
    combo: 'WHERE',
  };

  const starCount: Record<string, number> = {
    gold: 3,
    silver: 2,
    bronze: 1,
  };

  // Auto-advance badge sequence
  useEffect(() => {
    if (badges.length === 0) {
      setShowNearMisses(true);
      setShowTapToContinue(true);
      return;
    }

    const timer = setTimeout(() => {
      if (currentBadgeIndex < badges.length - 1) {
        setCurrentBadgeIndex(prev => prev + 1);
      } else {
        setShowNearMisses(true);
        setShowTapToContinue(true);
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [currentBadgeIndex, badges.length]);

  // Trigger celebration effect at 400ms after badge appears
  useEffect(() => {
    if (badges.length > 0 && currentBadgeIndex < badges.length) {
      const timer = setTimeout(() => {
        setCelebrate(true);
        // Reset celebration after animation
        setTimeout(() => setCelebrate(false), 600);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [currentBadgeIndex, badges.length]);

  // Generate celebration particles
  const renderParticles = () => {
    if (!celebrate || !badgeCardRef.current) return null;

    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#fff'];
    const particles = [];

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * 360;
      const distance = 60 + Math.random() * 40;
      const dx = Math.cos((angle * Math.PI) / 180) * distance;
      const dy = Math.sin((angle * Math.PI) / 180) * distance;
      const color = colors[Math.floor(Math.random() * colors.length)];

      particles.push(
        <div
          key={i}
          style={{
            position: 'absolute',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: color,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'particleFly 600ms ease-out forwards',
            '--dx': `${dx}px`,
            '--dy': `${dy}px`,
          } as React.CSSProperties & { [key: string]: string }}
        />
      );
    }

    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{particles}</div>;
  };

  const currentBadge = badges[currentBadgeIndex];

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}
    >
      <style>{`
        @keyframes badgeEnter {
          from { transform: scale(0.3); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes starEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes particleFly {
          0% { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
      `}</style>

      {/* Badge card */}
      {currentBadge && (
        <div
          ref={badgeCardRef}
          style={{
            position: 'relative',
            width: '160px',
            height: '200px',
            background: 'rgba(255,255,255,0.07)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {renderParticles()}

          {/* Base image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentBadge.dimension === 'year' ? '/badges/when.webp' : '/badges/where.webp'}
            alt=""
            style={{
              width: '96px',
              height: '96px',
              objectFit: 'contain',
              animation: 'badgeEnter 400ms ease-out 0ms both',
            }}
          />

          {/* Stars row */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '6px' }}>
            {Array.from({ length: starCount[currentBadge.tier] }).map((_, starIndex) => (
              <span
                key={starIndex}
                style={{
                  fontSize: '20px',
                  color: tierColor[currentBadge.tier],
                  animation: `starEnter 250ms ease-out ${420 + starIndex * 140}ms both`,
                }}
              >
                ★
              </span>
            ))}
          </div>

          {/* Tier label */}
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '1.5px',
              color: tierColor[currentBadge.tier],
              opacity: 0.8,
              textTransform: 'uppercase',
            }}
          >
            {currentBadge.tier}
          </div>

          {/* Dimension label */}
          <div
            style={{
              fontSize: '11px',
              color: 'white',
              opacity: 0.55,
              textTransform: 'uppercase',
            }}
          >
            {dimLabel[currentBadge.dimension]}
          </div>
        </div>
      )}

      {/* Near-misses */}
      {showNearMisses && nearMisses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {nearMisses.map((nm, i) => (
            <div
              key={i}
              style={{
                width: '120px',
                height: '60px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'white', opacity: 0.55, textTransform: 'uppercase' }}>
                {dimLabel[nm.dimension]}
              </div>
              <div style={{ fontSize: '12px', color: 'white', opacity: 0.7 }}>
                {nm.accuracy}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tap to continue */}
      {showTapToContinue && (
        <div style={{ fontSize: '12px', color: 'white', opacity: 0.6 }}>
          Tap to continue
        </div>
      )}
    </div>
  );
}
