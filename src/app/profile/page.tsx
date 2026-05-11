'use client';

import { Syne, DM_Sans } from 'next/font/google';

const syne = Syne({ subsets: ['latin'], weight: ['400', '700', '800'] });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500'] });

const C = {
  orange: '#fb923c',
  purple: '#c084fc',
  purpleDark: '#7c3aed',
  teal: '#14b8a6',
  gold: '#f0c060',
  silver: '#94a3b8',
  bronze: '#cd7c4a',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.09)',
  muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.7)',
  bg: '#0f0e0c',
  text: '#f5f0e8',
};

const STYLES = {
  root: {
    backgroundColor: C.bg,
    color: C.text,
    minHeight: '100vh',
    paddingBottom: 60,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  heroBg: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  heroGradient: {
    background: 'linear-gradient(135deg, #1a0a2e 0%, #0d1a0a 40%, #1a0d08 100%)',
  },
  radialGlow1: {
    width: '60%',
    height: '60%',
    top: '20%',
    left: '20%',
    background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)',
  },
  radialGlow2: {
    width: '30%',
    height: '30%',
    top: '35%',
    left: '35%',
    background: 'radial-gradient(circle, rgba(124,58,237,0.6) 0%, transparent 70%)',
  },
  radialGlow3: {
    width: '30%',
    height: '30%',
    top: '25%',
    left: '60%',
    background: 'radial-gradient(circle, rgba(194,65,12,0.3) 0%, transparent 70%)',
  },
  mosaicStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    opacity: 0.12,
  },
  fadeOverlay: {
    background: 'linear-gradient(to bottom, transparent, #0f0e0c)',
  },
  contentWrapper: {
    position: 'relative' as const,
    zIndex: 10,
    maxWidth: 820,
    margin: '0 auto',
    padding: '0 20px',
  },
  topBar: {
    marginTop: -280,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: C.muted,
    textDecoration: 'none',
  },
  editButton: {
    padding: '8px 16px',
    borderRadius: 9999,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    fontWeight: 700,
    letterSpacing: '0.05em',
    backgroundColor: C.surface,
    color: C.muted,
    border: `1px solid ${C.border}`,
    cursor: 'pointer',
  },
  heroSection: {
    marginTop: -200,
    padding: '0 24px',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #7c3aed 0%, #c2410c 100%)',
    fontSize: 28,
    fontWeight: 800,
  },
  levelBadge: {
    position: 'absolute' as const,
    bottom: -4,
    right: -4,
    padding: '2px 8px',
    borderRadius: 9999,
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: C.purpleDark,
    color: 'white',
  },
  username: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 4,
  },
  handle: {
    fontSize: 14,
    color: C.muted,
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    lineHeight: 1.5,
    color: C.dim,
  },
  pill: {
    padding: '4px 12px',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
  },
  statStrip: {
    padding: '0 24px',
    marginTop: 24,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    background: C.surface,
    border: '0.5px solid ' + C.border,
    borderRadius: 12,
    padding: '14px 16px',
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 800,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    color: C.muted,
  },
  twoColRow: {
    padding: '0 24px',
    marginTop: 24,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 24,
  },
  panel: {
    background: C.surface,
    border: '0.5px solid ' + C.border,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 16,
  },
  barContainer: {
    height: 4,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  divider: {
    height: 1,
    background: C.border,
    margin: '16px 0',
  },
  badgeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  badgeCell: {
    padding: 12,
    borderRadius: 8,
    textAlign: 'center' as const,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid ' + C.border,
  },
  badgeCount: {
    fontSize: 18,
    fontWeight: 700,
  },
  badgeLabel: {
    fontSize: 10,
    marginTop: 4,
    color: C.muted,
  },
  modeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },
  modeCard: {
    padding: 16,
    borderRadius: 12,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  modeAccent: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  modeStat: {
    fontSize: 12,
    color: C.dim,
  },
  fullPanel: {
    padding: '0 24px',
    marginTop: 24,
    marginBottom: 24,
  },
  leaderboardItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  centuryTile: {
    padding: '12px 12px',
    borderRadius: 8,
    textAlign: 'center' as const,
    background: 'rgba(251,146,60,0.1)',
    border: '1px solid rgba(251,146,60,0.2)',
  },
  centuryLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: C.orange,
  },
  centuryPercent: {
    fontSize: 12,
    marginTop: 2,
    color: C.muted,
  },
};

export default function ProfilePage() {
  return (
    <div style={STYLES.root} className={dmSans.className}>

      {/* 1. HERO BACKGROUND */}
      <div style={{ ...STYLES.heroBg, position: 'absolute' as const }}>
        <div 
          style={{ ...STYLES.heroGradient, position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {/* Radial glow overlays */}
          <div 
            style={{ ...STYLES.radialGlow1, position: 'absolute' as const }}
          />
          <div 
            style={{ ...STYLES.radialGlow2, position: 'absolute' as const }}
          />
          <div 
            style={{ ...STYLES.radialGlow3, position: 'absolute' as const }}
          />
          
          {/* Mosaic strip */}
          <div style={{ ...STYLES.mosaicStrip, position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div 
                key={i}
                style={{
                  backgroundColor: i % 2 === 0 ? '#7c3aed' : '#c2410c'
                }}
              />
            ))}
          </div>
          
          {/* Fade overlay */}
          <div 
            style={{ ...STYLES.fadeOverlay, position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: 96 }}
          />
        </div>
      </div>

      {/* 2. TOP BAR */}
      <div style={STYLES.topBar}>
        <a 
          href="/"
          style={STYLES.backLink}
        >
          <span style={{ fontSize: 18 }}>←</span>
          <span>Home</span>
        </a>
        <button 
          style={{ ...STYLES.editButton, ...syne.style }}
        >
          Edit Profile
        </button>
      </div>

      {/* 3. HERO SECTION */}
      <div style={STYLES.heroSection}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          {/* Avatar */}
          <div style={{ position: 'relative' as const }}>
            <div 
              style={{ ...STYLES.avatar, ...syne.style }}
            >
              LB
            </div>
            {/* Level badge */}
            <div 
              style={{ ...STYLES.levelBadge, ...syne.style }}
            >
              Lvl 23
            </div>
          </div>
          
          {/* User info */}
          <div style={{ flex: 1, paddingTop: 8 }}>
            <h1 style={{ ...STYLES.username, ...syne.style }}>LoloBlaze</h1>
            <p style={STYLES.handle}>
              @loloblaze · Joined March 2024
            </p>
            <p style={STYLES.bio}>
              History addict. Strong on medieval Europe, weak on Pacific prehistory.
            </p>
          </div>
        </div>
        
        {/* Pills row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <span 
            style={{
              ...STYLES.pill,
              backgroundColor: 'rgba(251,146,60,0.15)',
              color: C.orange,
              border: '1px solid rgba(251,146,60,0.3)'
            }}
          >
            Top 4% Daily
          </span>
          <span 
            style={{
              ...STYLES.pill,
              backgroundColor: 'rgba(192,132,252,0.15)',
              color: C.purple,
              border: '1px solid rgba(192,132,252,0.3)'
            }}
          >
            Level 23
          </span>
          <span 
            style={{
              ...STYLES.pill,
              backgroundColor: 'rgba(20,184,166,0.15)',
              color: C.teal,
              border: '1px solid rgba(20,184,166,0.3)'
            }}
          >
            42-day streak
          </span>
          <div 
            style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: C.purpleDark }}
            title="Prestige I"
          />
        </div>
      </div>

      {/* 4. STAT STRIP */}
      <div style={STYLES.statStrip}>
        {[
          { value: '37%', label: 'Avg accuracy', color: C.orange },
          { value: '59,325', label: 'Total XP', color: C.gold },
          { value: '847', label: 'Games played', color: C.purple },
          { value: '4,235', label: 'Rounds played', color: C.teal }
        ].map((stat, i) => (
          <div 
            key={i}
            style={STYLES.statCard}
          >
            <div style={{ ...STYLES.statValue, ...syne.style, color: stat.color }}>
              {stat.value}
            </div>
            <div style={STYLES.statLabel}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* 5. TWO-COLUMN ROW */}
      <div style={STYLES.twoColRow}>
        {/* Left: Accuracy breakdown */}
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Accuracy breakdown</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: C.dim }}>Year (when)</span>
                <span style={{ color: C.orange }}>42%</span>
              </div>
              <div style={{ ...STYLES.barContainer, height: 8 }}>
                <div 
                  style={{ ...STYLES.barFill, width: '42%', backgroundColor: C.orange }}
                />
              </div>
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: C.dim }}>Location (where)</span>
                <span style={{ color: C.purple }}>31%</span>
              </div>
              <div style={{ ...STYLES.barContainer, height: 8 }}>
                <div 
                  style={{ ...STYLES.barFill, width: '31%', backgroundColor: C.purple }}
                />
              </div>
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: C.dim }}>Combo mastery</span>
                <span style={{ color: C.teal }}>18%</span>
              </div>
              <div style={{ ...STYLES.barContainer, height: 8 }}>
                <div 
                  style={{ ...STYLES.barFill, width: '18%', backgroundColor: C.teal }}
                />
              </div>
            </div>
          </div>
          
          <div style={STYLES.divider} />
          
          <p style={{ fontSize: 12, color: C.muted }}>
            Gold rate 3.2% · Combo mastery rate 1.1%
          </p>
        </div>
        
        {/* Right: Badge collection */}
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Badge collection</h3>
          
          <div style={STYLES.badgeGrid}>
            {[
              { label: 'Gold', count: 136, color: C.gold },
              { label: 'Silver', count: 284, color: C.silver },
              { label: 'Bronze', count: 521, color: C.bronze },
              { label: 'Year', count: 68, color: C.gold, sub: 'gold' },
              { label: 'Location', count: 41, color: C.gold, sub: 'gold' },
              { label: 'Combo', count: 27, color: C.gold, sub: 'gold' }
            ].map((badge, i) => (
              <div 
                key={i}
                style={STYLES.badgeCell}
              >
                <div style={{ ...STYLES.badgeCount, ...syne.style, color: badge.color }}>
                  {badge.count}
                </div>
                <div style={STYLES.badgeLabel}>
                  {badge.label}
                  {badge.sub && <span style={{ marginLeft: 2, opacity: 0.7 }}>({badge.sub})</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. FULL-WIDTH PANEL - Performance by mode */}
      <div style={STYLES.fullPanel}>
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Performance by mode</h3>
          
          <div style={STYLES.modeRow}>
            {/* Daily */}
            <div 
              style={{ ...STYLES.modeCard, backgroundColor: 'rgba(30,58,138,0.4)', border: '1px solid rgba(59,130,246,0.3)' }}
            >
              <div 
                style={{ ...STYLES.modeAccent, backgroundColor: '#3b82f6' }}
              />
              <div style={{ ...STYLES.modeTitle, ...syne.style }}>Daily</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={STYLES.modeStat}>
                  <span style={{ fontWeight: 700, color: C.orange }}>41%</span> avg accuracy
                </div>
                <div style={STYLES.modeStat}>
                  Best <span style={{ fontWeight: 700, color: C.gold }}>84%</span>
                </div>
                <div style={STYLES.modeStat}>
                  Rank <span style={{ fontWeight: 700 }}>#142</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  42-day streak
                </div>
              </div>
            </div>
            
            {/* Level Up */}
            <div 
              style={{ ...STYLES.modeCard, backgroundColor: 'rgba(124,58,237,0.3)', border: '1px solid rgba(192,132,252,0.3)' }}
            >
              <div 
                style={{ ...STYLES.modeAccent, backgroundColor: C.purple }}
              />
              <div style={{ ...STYLES.modeTitle, ...syne.style }}>Level Up</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={STYLES.modeStat}>
                  Level <span style={{ fontWeight: 700, color: C.purple }}>23</span>
                </div>
                <div style={STYLES.modeStat}>
                  Pass threshold <span style={{ fontWeight: 700 }}>56.9%</span>
                </div>
                <div style={STYLES.modeStat}>
                  <span style={{ fontWeight: 700, color: C.purpleDark }}>Prestige I</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  234 attempts
                </div>
              </div>
            </div>
            
            {/* Compete */}
            <div 
              style={{ ...STYLES.modeCard, backgroundColor: 'rgba(20,184,166,0.25)', border: '1px solid rgba(20,184,166,0.3)' }}
            >
              <div 
                style={{ ...STYLES.modeAccent, backgroundColor: C.teal }}
              />
              <div style={{ ...STYLES.modeTitle, ...syne.style }}>Compete</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={STYLES.modeStat}>
                  <span style={{ fontWeight: 700, color: C.orange }}>34%</span> avg accuracy
                </div>
                <div style={STYLES.modeStat}>
                  Sessions <span style={{ fontWeight: 700 }}>89</span>
                </div>
                <div style={STYLES.modeStat}>
                  Win rate <span style={{ fontWeight: 700 }}>31%</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  Rush 52 / Relax 37
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. TWO-COLUMN ROW */}
      <div style={STYLES.twoColRow}>
        {/* Left: Leaderboard positions */}
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Leaderboard positions</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={STYLES.leaderboardItem}>
              <div>
                <div style={{ ...syne.style, fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>
                  #142 / Daily
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  today · Apr 28, 2026
                </div>
              </div>
              <div style={{ ...syne.style, fontSize: 14, fontWeight: 700, color: C.orange }}>
                73%
              </div>
            </div>
            
            <div style={STYLES.leaderboardItem}>
              <div>
                <div style={{ ...syne.style, fontSize: 14, fontWeight: 700, color: C.purple }}>
                  #889 / Level Up
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  all time · Level 23, 58% accuracy
                </div>
              </div>
              <div style={{ ...syne.style, fontSize: 14, fontWeight: 700, color: C.purple }}>
                Lvl 23
              </div>
            </div>
          </div>
          
          <div style={STYLES.divider} />
          
          <p style={{ fontSize: 12, fontStyle: 'italic', color: C.muted }}>
            No global Compete leaderboard — in-session only.
          </p>
        </div>
        
        {/* Right: Score distribution */}
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Score distribution</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: '81–100', percent: 8, opacity: 1 },
              { label: '61–80', percent: 22, opacity: 0.8 },
              { label: '41–60', percent: 38, opacity: 0.6 },
              { label: '21–40', percent: 24, opacity: 0.4 },
              { label: '0–20', percent: 8, opacity: 0.2 }
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, width: 64, color: C.dim }}>
                  {item.label}
                </span>
                <div style={{ flex: 1, ...STYLES.barContainer, height: 8 }}>
                  <div 
                    style={{ 
                      ...STYLES.barFill,
                      width: `${item.percent}%`, 
                      backgroundColor: C.orange,
                      opacity: item.opacity
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, width: 32, textAlign: 'right', color: C.muted }}>
                  {item.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 8. FULL-WIDTH PANEL - History collection */}
      <div style={STYLES.fullPanel}>
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>History collection</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Events seen', value: 342, color: C.orange },
              { label: 'Rated', value: 28, color: C.purple },
              { label: 'Regions', value: 5, color: C.teal },
              { label: 'Countries', value: 12, color: C.gold }
            ].map((item, i) => (
              <div 
                key={i}
                style={STYLES.badgeCell}
              >
                <div style={{ ...STYLES.badgeCount, ...syne.style, color: item.color, fontSize: 20 }}>
                  {item.value}
                </div>
                <div style={STYLES.badgeLabel}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: 24 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: C.dim }}>By era</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Contemporary', count: 222, percent: 65 },
                { label: 'Modern', count: 103, percent: 30 },
                { label: 'Early Modern', count: 11, percent: 7 },
                { label: 'Medieval', count: 6, percent: 4 },
                { label: 'Ancient', count: 0, percent: 1 }
              ].map((era, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.dim }}>{era.label}</span>
                    <span style={{ color: C.muted }}>{era.count} ({era.percent}%)</span>
                  </div>
                  <div style={{ ...STYLES.barContainer, height: 6 }}>
                    <div 
                      style={{ 
                        ...STYLES.barFill,
                        width: `${era.percent}%`, 
                        backgroundColor: era.count > 0 ? C.orange : 'rgba(255,255,255,0.2)'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 9. FULL-WIDTH PANEL - Accuracy by century */}
      <div style={{ ...STYLES.fullPanel, paddingBottom: 32 }}>
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Accuracy by century</h3>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: '1900s', percent: 51, opacity: 1 },
              { label: '1800s', percent: 44, opacity: 0.85 },
              { label: '2000s', percent: 38, opacity: 0.7 },
              { label: '1700s', percent: 27, opacity: 0.55 },
              { label: '1500s', percent: 19, opacity: 0.4 },
              { label: 'pre-1500', percent: 0, opacity: 0.25 }
            ].map((century, i) => (
              <div 
                key={i}
                style={{ ...STYLES.centuryTile, opacity: century.opacity }}
              >
                <div style={{ ...STYLES.centuryLabel, ...syne.style }}>
                  {century.label}
                </div>
                <div style={STYLES.centuryPercent}>
                  {century.percent > 0 ? `${century.percent}%` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
