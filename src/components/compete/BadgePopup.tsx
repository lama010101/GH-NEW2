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
      onDismiss();
      return;
    }

    const timer = setTimeout(() => {
      if (currentBadgeIndex < badges.length - 1) {
        setCurrentBadgeIndex(prev => prev + 1);
      } else {
        onDismiss();
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [currentBadgeIndex, badges.length, onDismiss]);

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
        gap: '16px',
      }}
    >
      <style>{`
        @keyframes badgeEnter {
          from { transform: scale(0.3); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes starEnter {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes verdictEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes particleFly {
          0% { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
      `}</style>

      {/* Close button */}
      <div
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '36px',
          height: '36px',
          background: 'rgba(255,255,255,0.12)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: '20px', color: 'white' }}>×</span>
      </div>

      {/* Badge card */}
      {currentBadge && (
        <div
          ref={badgeCardRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {renderParticles()}

          {/* Verdict text */}
          {currentBadge.accuracy >= 80 && (
            <div
              style={{
                fontSize: '28px',
                fontWeight: 800,
                letterSpacing: '1px',
                color: tierColor[currentBadge.tier],
                animation: 'verdictEnter 250ms ease-out',
              }}
            >
              {currentBadge.accuracy === 100 ? 'PERFECT!' : currentBadge.accuracy >= 95 ? 'AMAZING!' : currentBadge.accuracy >= 90 ? 'GREAT!' : 'GOOD'}
            </div>
          )}

          {/* Icon with stars overlaid */}
          <div
            style={{
              position: 'relative',
              width: '180px',
              height: '180px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Base image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentBadge.dimension === 'year' ? '/badges/when.webp' : '/badges/where.webp'}
              alt=""
              style={{
                width: '180px',
                height: '180px',
                objectFit: 'contain',
                animation: 'badgeEnter 400ms ease-out 0ms both',
              }}
            />

            {/* Stars overlaid */}
            <div
              style={{
                position: 'absolute',
                bottom: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'row',
                gap: '6px',
              }}
            >
              {Array.from({ length: starCount[currentBadge.tier] }).map((_, starIndex) => (
                <span
                  key={starIndex}
                  style={{
                    fontSize: '24px',
                    color: tierColor[currentBadge.tier],
                    animation: `starEnter 300ms ease-out ${starIndex * 150}ms both`,
                  }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          {/* Accuracy + dimension line */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'white',
              marginTop: '16px',
            }}
          >
            {currentBadge.accuracy}% {dimLabel[currentBadge.dimension]}
          </div>
        </div>
      )}
    </div>
  );
}
