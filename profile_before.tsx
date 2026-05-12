'use client';

import { Syne, DM_Sans } from 'next/font/google';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';
import { signOut } from '@/core/identity';
import { supabaseBrowser } from '@/core/supabaseBrowser';

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
    overflow: 'visible' as const,
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
    padding: '80px 20px 0 20px',
  },
  topBar: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
    backgroundColor: C.bg,
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
    marginTop: 0,
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
  const router = useRouter();
  const { playerId } = useIdentity();
  const [profileData, setProfileData] = useState<{ displayName: string | null; avatarUrl: string | null; email: string | null; createdAt: string | null; avgAccuracy: number | null; totalXp: number | null; roundsPlayed: number | null }>({
    displayName: null,
    avatarUrl: null,
    email: null,
    createdAt: null,
    avgAccuracy: null,
    totalXp: null,
    roundsPlayed: null,
  });

  useEffect(() => {
    if (!playerId) return;

    const fetchProfileData = async () => {
      try {
        const { data: profileResult } = await supabaseBrowser
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', playerId)
          .limit(1)
          .single();

        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const email = sessionData.session?.user?.email ?? null;
        const createdAt = sessionData.session?.user?.created_at ?? null;

        const { data: statsResult } = await supabaseBrowser
          .from('player_global_stats')
          .select('avg_accuracy, total_xp, rounds_played')
          .eq('player_id', playerId)
          .limit(1)
          .single();

        setProfileData({
          displayName: profileResult?.display_name ?? null,
          avatarUrl: profileResult?.avatar_url ?? null,
          email,
          createdAt,
          avgAccuracy: statsResult?.avg_accuracy ?? null,
          totalXp: statsResult?.total_xp ?? null,
          roundsPlayed: statsResult?.rounds_played ?? null,
        });
      } catch (error) {
        console.error('Error fetching profile data:', error);
      }
    };

    fetchProfileData();
  }, [playerId]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const getInitials = (name: string | null): string => {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    const initials = words.map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 2);
  };

  const formatMemberSince = (dateStr: string | null): string => {
    if (!dateStr) return 'ΓÇö';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div style={STYLES.root} className={dmSans.className}>

      {/* 1. HERO BACKGROUND */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 280, background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0e0c 100%)', zIndex: 0 }} />

      {/* 2. TOP BAR */}
      <div style={STYLES.topBar}>
        <button
          onClick={() => router.back()}
          style={{
            ...STYLES.backLink,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.text,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 18 }}>ΓåÉ</span>
          <span>Back</span>
        </button>
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
          <div style={{ ...STYLES.avatar, ...syne.style, overflow: 'hidden' as const }}>
            {profileData.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileData.avatarUrl}
                alt="Avatar"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 9999,
                }}
              />
            ) : (
              getInitials(profileData.displayName)
            )}
          </div>

          {/* User info */}
          <div style={{ flex: 1, paddingTop: 8 }}>
            <h1 style={{ ...STYLES.username, ...syne.style }}>{profileData.displayName ?? 'ΓÇö'}</h1>
            <p style={STYLES.handle}>
              @{profileData.displayName?.toLowerCase().replace(/\s+/g, '') ?? 'user'} ┬╖ Joined {formatMemberSince(profileData.createdAt)}
            </p>
          </div>
        </div>

        {/* Stat pills row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: 9999,
              padding: '6px 14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>
              {profileData.avgAccuracy === null ? 'ΓÇö' : Math.round(Number(profileData.avgAccuracy)) + '%'}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Accuracy
            </div>
          </div>
          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: 9999,
              padding: '6px 14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>
              {profileData.totalXp === null ? 'ΓÇö' : profileData.totalXp.toLocaleString() + ' XP'}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              XP
            </div>
          </div>
        </div>
      </div>

      {/* 4. STAT STRIP */}
      <div style={STYLES.statStrip}>
        {[
          {
            value: profileData.avgAccuracy === null
              ? '...'
              : profileData.avgAccuracy !== null
                ? Math.round(Number(profileData.avgAccuracy)) + '%'
                : 'ΓÇö',
            label: 'Avg accuracy',
            color: C.orange
          },
          {
            value: profileData.totalXp === null
              ? '...'
              : profileData.totalXp !== null
                ? profileData.totalXp.toLocaleString() + ' XP'
                : 'ΓÇö',
            label: 'Total XP',
            color: C.gold
          },
          {
            value: 'ΓÇö',
            label: 'Games played (coming soon)',
            color: C.purple
          },
          {
            value: profileData.roundsPlayed === null
              ? '...'
              : profileData.roundsPlayed !== null
                ? profileData.roundsPlayed.toLocaleString()
                : 'ΓÇö',
            label: 'Rounds played',
            color: C.teal
          }
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 24 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>ΓÇö</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Coming soon</div>
          </div>
        </div>
        
        {/* Right: Badge collection */}
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Badge collection</h3>
          
          <div style={STYLES.badgeGrid}>
            {[
              { label: 'Gold', count: null, color: C.gold },
              { label: 'Silver', count: null, color: C.silver },
              { label: 'Bronze', count: null, color: C.bronze },
              { label: 'Year', count: null, color: C.gold, sub: 'gold' },
              { label: 'Location', count: null, color: C.gold, sub: 'gold' },
              { label: 'Combo', count: null, color: C.gold, sub: 'gold' }
            ].map((badge, i) => (
              <div 
                key={i}
                style={STYLES.badgeCell}
              >
                <div style={{ ...STYLES.badgeCount, ...syne.style, color: badge.color }}>
                  {badge.count ?? 'ΓÇö'}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', padding: 16 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>ΓÇö</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Coming soon</div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', padding: 16 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>ΓÇö</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Coming soon</div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', padding: 16 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>ΓÇö</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Coming soon</div>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 24 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Coming soon</div>
          </div>
        </div>
        
        {/* Right: Score distribution */}
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Score distribution</h3>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 24 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Coming soon</div>
          </div>
        </div>
      </div>

      {/* 8. FULL-WIDTH PANEL - History collection */}
      <div style={STYLES.fullPanel}>
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>History collection</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Events seen', value: null, color: C.orange },
              { label: 'Rated', value: null, color: C.purple },
              { label: 'Regions', value: null, color: C.teal },
              { label: 'Countries', value: null, color: C.gold }
            ].map((item, i) => (
              <div 
                key={i}
                style={STYLES.badgeCell}
              >
                <div style={{ ...STYLES.badgeCount, ...syne.style, color: item.color, fontSize: 20 }}>
                  {item.value ?? 'ΓÇö'}
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
                { label: 'Contemporary', count: null, percent: 0 },
                { label: 'Modern', count: null, percent: 0 },
                { label: 'Early Modern', count: null, percent: 0 },
                { label: 'Medieval', count: null, percent: 0 },
                { label: 'Ancient', count: null, percent: 0 }
              ].map((era, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.dim }}>{era.label}</span>
                    <span style={{ color: C.muted }}>{era.count ?? 'ΓÇö'} ({era.percent}%)</span>
                  </div>
                  <div style={{ ...STYLES.barContainer, height: 6 }}>
                    <div 
                      style={{ 
                        ...STYLES.barFill,
                        width: `${era.percent}%`, 
                        backgroundColor: 'rgba(255,255,255,0.2)'
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
              { label: '1900s', percent: null, opacity: 1 },
              { label: '1800s', percent: null, opacity: 0.85 },
              { label: '2000s', percent: null, opacity: 0.7 },
              { label: '1700s', percent: null, opacity: 0.55 },
              { label: '1500s', percent: null, opacity: 0.4 },
              { label: 'pre-1500', percent: null, opacity: 0.25 }
            ].map((century, i) => (
              <div 
                key={i}
                style={{ ...STYLES.centuryTile, opacity: century.opacity }}
              >
                <div style={{ ...STYLES.centuryLabel, ...syne.style }}>
                  {century.label}
                </div>
                <div style={STYLES.centuryPercent}>
                  {century.percent ?? 'ΓÇö'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 10. ACCOUNT SECTION */}
      <div style={STYLES.fullPanel}>
        <div style={STYLES.panel}>
          <h3 style={{ ...STYLES.sectionTitle, ...syne.style }}>Account</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: C.dim }}>Email</span>
              <span style={{ fontSize: 14, color: C.muted }}>{profileData.email ?? 'ΓÇö'}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: C.dim }}>Member since</span>
              <span style={{ fontSize: 14, color: C.muted }}>{formatMemberSince(profileData.createdAt)}</span>
            </div>
            
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
