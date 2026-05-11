import React from "react";

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
  const tierColor: Record<string, string> = {
    gold: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
  };
  const tierGlow: Record<string, string> = {
    gold: '0 0 18px 4px rgba(255,215,0,0.45)',
    silver: '0 0 18px 4px rgba(192,192,192,0.35)',
    bronze: '0 0 18px 4px rgba(205,127,50,0.35)',
  };
  const dimLabel: Record<string, string> = {
    location: 'WHERE',
    year: 'WHEN',
    combo: 'COMBO',
  };
  const dimIcon: Record<string, string> = {
    location: '📍',
    year: '📅',
    combo: '⚡',
  };

  // Dominant badge: combo wins, else highest tier, else no preference
  const tierRank: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };
  let dominantBadge: typeof badges[0] | null = null;
  for (const b of badges) {
    if (!dominantBadge) { dominantBadge = b; continue }
    if (b.dimension === 'combo') { dominantBadge = b; break }
    if (tierRank[b.tier] > tierRank[dominantBadge.tier]) dominantBadge = b;
  }

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        animation: 'badgeFadeIn 0.28s ease',
      }}
    >
      <style>{`
        @keyframes badgeFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes badgePop {
          0%   { opacity: 0; transform: scale(0.7) translateY(12px); }
          65%  { transform: scale(1.08) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes coinRise {
          from { transform: translateY(24px) scale(0.7); opacity: 0; }
          to   { transform: translateY(0)    scale(1);   opacity: 1; }
        }
        @keyframes iconDrop {
          from { transform: translateY(-20px) scale(0.7); opacity: 0; }
          to   { transform: translateY(0)     scale(1);   opacity: 1; }
        }
        @keyframes starsDrop {
          from { transform: translateY(-28px) scale(0.6); opacity: 0; }
          to   { transform: translateY(0)     scale(1);   opacity: 1; }
        }
        @keyframes medalSnap {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.08); }
          70%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1e1e1e',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: '28px 24px 22px',
          maxWidth: 380,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {dominantBadge && (
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: tierColor[dominantBadge.tier],
            marginBottom: 18, letterSpacing: '0.5px',
          }}>
            {dominantBadge.tier.toUpperCase()} · {dimLabel[dominantBadge.dimension]}
          </div>
        )}

        {/* Badge tiles */}
        <div style={{
          display: 'flex', justifyContent: 'center',
          gap: 10, flexWrap: 'wrap', marginBottom: nearMisses.length > 0 ? 16 : 0,
        }}>
          {badges.map((badge, i) => {
            const isDominant = dominantBadge?.dimension === badge.dimension && dominantBadge?.tier === badge.tier;
            return (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4,
                minWidth: 76,
                animation: `badgePop 0.45s ease ${i * 0.12 + 0.1}s both`,
              }}>
                {(() => {
                  const dimIcon = badge.dimension === 'year' ? 'calendar' : badge.dimension === 'location' ? 'map' : 'combo';
                  const starCount = badge.tier === 'gold' ? 3 : badge.tier === 'silver' ? 2 : 1;
                  const baseDelay = i * 0.22;
                  return (
                    <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto' }}>
                      {/* Layer 1: coin ring — fills full tile, enters from below */}
                      <div style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        borderRadius: '50%',
                        boxShadow: isDominant ? tierGlow[badge.tier] : 'none',
                      }}>
                        <img
                          src={`/badges/coin_${badge.tier}.webp`}
                          alt=""
                          style={{
                            width: '100%', height: '100%',
                            objectFit: 'contain',
                            animation: `coinRise 0.28s ease ${baseDelay}s both, medalSnap 0.12s ease ${baseDelay + 0.3}s both`,
                          }}
                        />
                      </div>
                      {/* Layer 2: dimension icon — centered inside coin, 58% size */}
                      <img
                        src={`/badges/${dimIcon}_${badge.tier}.webp`}
                        alt=""
                        style={{
                          position: 'absolute',
                          top: '50%', left: '50%',
                          width: '58%', height: '58%',
                          transform: 'translate(-50%, -50%)',
                          objectFit: 'contain',
                          animation: `iconDrop 0.28s ease ${baseDelay + 0.05}s both, medalSnap 0.12s ease ${baseDelay + 0.3}s both`,
                        }}
                      />
                      {/* Layer 3: stars — at top of coin */}
                      {Array.from({ length: starCount }).map((_, starIndex) => {
                        // Explicit star positions to avoid overlap
                        const starPositions: Record<number, number[]> = {
                          1: [50],
                          2: [35, 65],
                          3: [25, 50, 75],
                        };
                        // Star sizes based on count to prevent overlap
                        const starWidths: Record<number, string> = {
                          1: '42%',
                          2: '30%',
                          3: '24%',
                        };
                        return (
                          <img
                            key={starIndex}
                            src={`/badges/star_${badge.tier}.webp`}
                            alt=""
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: `${starPositions[starCount][starIndex]}%`,
                              width: starWidths[starCount],
                              height: 'auto',
                              transform: 'translateX(-50%)',
                              objectFit: 'contain',
                              animation: `starsDrop 0.28s ease ${baseDelay + 0.1}s both, medalSnap 0.12s ease ${baseDelay + 0.3}s both`,
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Near-miss section */}
        {nearMisses.length > 0 && (
          <>
            <div style={{
              fontSize: 10, color: '#555', textTransform: 'uppercase',
              letterSpacing: '1.5px', marginBottom: 8,
            }}>
              So Close
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {nearMisses.map((nm, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 3,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  minWidth: 64,
                  opacity: 0.75,
                  animation: `badgePop 0.4s ease ${i * 0.1 + (badges.length * 0.12) + 0.2}s both`,
                }}>
                  <span style={{ fontSize: 18 }}>{dimIcon[nm.dimension]}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    CLOSE
                  </span>
                  <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase' }}>
                    {dimLabel[nm.dimension]}
                  </span>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>
                    {nm.accuracy}<span style={{ color: "#ffffff", fontSize: "2.75px" }}>%</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          style={{
            marginTop: 20,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            color: '#aaa',
            fontSize: 12,
            padding: '8px 24px',
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          TAP TO DISMISS
        </button>
      </div>
    </div>
  );
}
