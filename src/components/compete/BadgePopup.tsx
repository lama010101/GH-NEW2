import React, { useState, useEffect, useRef } from "react";
import styles from './BadgePopup.module.css';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function BadgePopup({ badges, nearMisses: _nearMisses, onDismiss }: BadgePopupProps) {
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

    const colors = ['var(--gh-particle-gold)', 'var(--gh-particle-red)', 'var(--gh-particle-teal)', 'var(--gh-particle-white)'];
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

    return <div className={styles.particleContainer}>{particles}</div>;
  };

  const currentBadge = badges[currentBadgeIndex];

  const getVerdictStyle = (tier: string) => ({ '--tier-color': tierColor[tier] } as React.CSSProperties);
  const getStarStyle = (tier: string, delay: number) => ({ '--tier-color': tierColor[tier], '--star-delay': `${delay}ms` } as React.CSSProperties);

  return (
    <div
      onClick={onDismiss}
      className={styles.overlay}
    >

      {/* Close button */}
      <div
        onClick={onDismiss}
        className={styles.closeBtn}
      >
        <span className={styles.closeBtnText}>×</span>
      </div>

      {/* Badge card */}
      {currentBadge && (
        <div
          ref={badgeCardRef}
          onClick={(e) => e.stopPropagation()}
          className={styles.badgeCard}
        >
          {renderParticles()}

          {/* Verdict text */}
          {currentBadge.accuracy >= 80 && (
            <div
              className={styles.verdictText}
              style={getVerdictStyle(currentBadge.tier)}
            >
              {currentBadge.accuracy === 100 ? 'PERFECT!' : currentBadge.accuracy >= 95 ? 'AMAZING!' : currentBadge.accuracy >= 90 ? 'GREAT!' : 'GOOD'}
            </div>
          )}

          {/* Icon with stars overlaid */}
          <div className={styles.iconWrap}>
            {/* Base image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentBadge.dimension === 'year' ? '/badges/when.webp' : '/badges/where.webp'}
              alt=""
              className={styles.badgeImg}
            />

            {/* Stars overlaid */}
            <div className={styles.starsContainer}>
              {Array.from({ length: starCount[currentBadge.tier] }).map((_, starIndex) => (
                <span
                  key={starIndex}
                  className={styles.star}
                  style={getStarStyle(currentBadge.tier, starIndex * 150)}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          {/* Accuracy + dimension line */}
          <div className={styles.accuracyLine}>
            {currentBadge.accuracy}% {dimLabel[currentBadge.dimension]}
          </div>
        </div>
      )}
    </div>
  );
}
