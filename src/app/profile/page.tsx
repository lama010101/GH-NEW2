'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';
import { signOut } from '@/core/identity';
import { supabaseBrowser } from '@/core/supabaseBrowser';
import styles from './profile.module.css';
import TopBar from '@/components/layout/TopBar';


type ProfileHistoricalAvatar = {
  avatarName: string;
  avatarDescription: string;
  bornLabel: string;
  diedLabel: string;
  avatarImageUrl: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const { playerId } = useIdentity();
  const [accuracy, setAccuracy] = useState('--');
  const [xp, setXp] = useState('--');
  const [progressData, setProgressData] = useState<{
    byCentury: Array<{ century: string; avgAccuracy: number; roundCount: number }>
    byContinent: Array<{ continent: string; avgAccuracy: number; roundCount: number }>
    eventsSeenCount: number
  } | null>(null);

  const [profileData, setProfileData] = useState<{
    displayName: string | null;
    avatarUrl: string | null;
    email: string | null;
    createdAt: string | null;
    avgAccuracy: number | null;
    totalXp: number | null;
    roundsPlayed: number | null;
    gamesPlayed: number | null;
    dailyAvgAccuracy: number | null;
    dailyGamesPlayed: number | null;
    levelUpCurrentLevel: number | null;
    levelUpBestAccuracy: number | null;
    historicalAvatar: ProfileHistoricalAvatar | null;
  }>({
    displayName: null,
    avatarUrl: null,
    email: null,
    createdAt: null,
    avgAccuracy: null,
    totalXp: null,
    roundsPlayed: null,
    gamesPlayed: null,
    dailyAvgAccuracy: null,
    dailyGamesPlayed: null,
    levelUpCurrentLevel: null,
    levelUpBestAccuracy: null,
    historicalAvatar: null,
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
          .select('avg_accuracy, total_xp, rounds_played, games_played')
          .eq('player_id', playerId)
          .limit(1)
          .single();

        if (statsResult) {
          setAccuracy(String(Math.round(Number(statsResult.avg_accuracy))));
          setXp(Number(statsResult.total_xp).toLocaleString('fr-FR'));
        }

        // Leaderboard positions
        const { data: dailyAlltimeResult } = await supabaseBrowser
          .from('leaderboard_daily_alltime')
          .select('avg_accuracy, games_played, total_xp')
          .eq('player_id', playerId)
          .limit(1)
          .single();

        const { data: levelupResult } = await supabaseBrowser
          .from('leaderboard_levelup')
          .select('current_level, best_accuracy')
          .eq('player_id', playerId)
          .limit(1)
          .single();

        let historicalAvatar: ProfileHistoricalAvatar | null = null;
        if (profileResult?.avatar_url) {
          let { data: avatarResult } = await supabaseBrowser
            .from('avatars')
            .select('first_name, last_name, description, birth_day, death_day, birth_city, birth_country, death_city, death_country')
            .eq('image_url', profileResult.avatar_url)
            .limit(1)
            .single();

          if (!avatarResult) {
            ({ data: avatarResult } = await supabaseBrowser
              .from('avatars')
              .select('first_name, last_name, description, birth_day, death_day, birth_city, birth_country, death_city, death_country')
              .eq('firebase_url', profileResult.avatar_url)
              .limit(1)
              .single());
          }

          if (avatarResult) {
            const nameParts: string[] = [];
            if (avatarResult.first_name) nameParts.push(avatarResult.first_name);
            if (avatarResult.last_name) nameParts.push(avatarResult.last_name);
            const avatarName = nameParts.join(' ').trim();

            const bornParts: string[] = [];
            if (avatarResult.birth_day) bornParts.push(avatarResult.birth_day);
            if (avatarResult.birth_city) bornParts.push(avatarResult.birth_city);
            if (avatarResult.birth_country) bornParts.push(avatarResult.birth_country);
            const bornLabel = bornParts.length > 0 ? `Born: ${bornParts.join(', ')}` : '';

            const diedParts: string[] = [];
            if (avatarResult.death_day) diedParts.push(avatarResult.death_day);
            if (avatarResult.death_city) diedParts.push(avatarResult.death_city);
            if (avatarResult.death_country) diedParts.push(avatarResult.death_country);
            const diedLabel = diedParts.length > 0 ? `Died: ${diedParts.join(', ')}` : '';

            historicalAvatar = {
              avatarName,
              avatarDescription: avatarResult.description ?? '',
              bornLabel,
              diedLabel,
              avatarImageUrl: profileResult.avatar_url,
            };
          }
        }

        setProfileData({
          displayName: profileResult?.display_name ?? null,
          avatarUrl: profileResult?.avatar_url ?? null,
          email,
          createdAt,
          avgAccuracy: statsResult?.avg_accuracy ?? null,
          totalXp: statsResult?.total_xp ?? null,
          roundsPlayed: statsResult?.rounds_played ?? null,
          gamesPlayed: statsResult?.games_played ?? null,
          dailyAvgAccuracy: dailyAlltimeResult?.avg_accuracy ?? null,
          dailyGamesPlayed: dailyAlltimeResult?.games_played ?? null,
          levelUpCurrentLevel: levelupResult?.current_level ?? null,
          levelUpBestAccuracy: levelupResult?.best_accuracy ?? null,
          historicalAvatar,
        });

        const progressRes = await fetch('/api/progress')
        if (progressRes.ok) {
          const json = await progressRes.json()
          setProgressData(json)
        }
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
    if (!name) return '??';
    const words = name.trim().split(/\s+/);
    const initials = words.map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 2);
  };

  const formatMemberSince = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`min-h-screen pb-[60px] relative ${styles.page}`}>

      {/* 1. HERO BACKGROUND */}
      <div className={`absolute top-0 left-0 right-0 h-[280px] bg-gradient-to-b z-0 ${styles.heroBg}`} />

      {/* 2. TOP BAR */}
      <TopBar
        accuracy={accuracy}
        xp={xp}
        avatarUrl={profileData.avatarUrl}
        initials={getInitials(profileData.displayName)}
        onAvatarClick={() => router.push('/account')}
      />

      {/* 3. HERO SECTION */}
      <div className="relative z-10 max-w-[820px] mx-auto pt-20 px-6 flex flex-col items-center text-center">
        {/* Avatar with gradient border */}
        <div className="relative mb-4">
          <div className="w-[110px] h-[110px] rounded-full p-[3px] bg-gradient-to-br from-pink-300 to-yellow-300 flex items-center justify-center">
            {profileData.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileData.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover rounded-full"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className={`font-bebas text-4xl font-extrabold text-white`}>
                {getInitials(profileData.displayName)}
              </span>
            )}
          </div>
        </div>

        {/* Username */}
        <h2 className={`font-bebas text-xl font-bold mb-1 bg-gradient-to-r from-pink-300 to-yellow-300 bg-clip-text text-transparent`}>
          {profileData.displayName ?? ''}
        </h2>

        {/* Member since */}
        <p className="text-sm text-white/45 mb-6">
          Member since {formatMemberSince(profileData.createdAt)}
        </p>

        {/* Historical Avatar Card */}
        {profileData.historicalAvatar && (
          <div className="bg-white/[0.08] rounded-2xl py-5 px-6 w-full max-w-[400px] text-center">
            <h3 className={`font-bebas text-lg font-bold mb-2 text-white`}>
              {profileData.historicalAvatar.avatarName}
            </h3>
            {profileData.historicalAvatar.avatarDescription && (
              <p className="text-sm text-white/45 mb-2 leading-relaxed">
                {profileData.historicalAvatar.avatarDescription}
              </p>
            )}
            {profileData.historicalAvatar.bornLabel && (
              <p className="text-xs text-white/45 mb-1">
                {profileData.historicalAvatar.bornLabel}
              </p>
            )}
            {profileData.historicalAvatar.diedLabel && (
              <p className="text-xs text-white/45">
                {profileData.historicalAvatar.diedLabel}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 4. STAT STRIP */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 grid grid-cols-4 gap-[10px] mb-6">
        {[
          {
            value: profileData.avgAccuracy === null
              ? '...'
              : profileData.avgAccuracy !== null
                ? Math.round(Number(profileData.avgAccuracy)) + '%'
                : '—',
            label: 'Avg accuracy',
            color: styles.statColorOrange
          },
          {
            value: profileData.totalXp === null
              ? '...'
              : profileData.totalXp !== null
                ? profileData.totalXp.toLocaleString() + ' XP'
                : '—',
            label: 'Total XP',
            color: styles.statColorGold
          },
          {
            value: profileData.gamesPlayed === null
              ? '...'
              : profileData.gamesPlayed.toLocaleString(),
            label: 'Games played',
            color: styles.statColorViolet
          },
          {
            value: profileData.roundsPlayed === null
              ? '...'
              : profileData.roundsPlayed !== null
                ? profileData.roundsPlayed.toLocaleString()
                : '—',
            label: 'Rounds played',
            color: styles.statColorTeal
          }
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-white/[0.04] border border-white/[0.09] rounded-xl py-3.5 px-4 text-center"
          >
            <div className={`font-bebas text-2xl font-extrabold ${stat.color ?? ''}`}>
              {stat.value}
            </div>
            <div className="text-xs mt-1 text-white/45">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* 5. TWO-COLUMN ROW */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 grid grid-cols-2 gap-3 mb-6">
        {/* Left: Accuracy breakdown */}
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>Accuracy breakdown</h3>
          {progressData && progressData.byContinent.length > 0 ? (
            <div className="flex flex-col gap-2">
              {progressData.byContinent.map((item) => (
                <div key={item.continent}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/70">{item.continent}</span>
                    <span className="text-white/45">{item.avgAccuracy}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${styles.barFillViolet}`}
                      style={{ width: `${item.avgAccuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="text-sm text-white/35">—</div>
              <div className="text-xs text-white/35">{progressData === null ? 'Loading…' : 'No data yet'}</div>
            </div>
          )}
        </div>
        
        {/* Right: Badge collection */}
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>Badge collection</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Gold', count: null, colorClass: styles.badgeColorGold },
              { label: 'Silver', count: null, colorClass: styles.badgeColorSilver },
              { label: 'Bronze', count: null, colorClass: styles.badgeColorBronze },
              { label: 'Year', count: null, colorClass: styles.badgeColorGold, sub: 'gold' },
              { label: 'Location', count: null, colorClass: styles.badgeColorGold, sub: 'gold' },
              { label: 'Combo', count: null, colorClass: styles.badgeColorGold, sub: 'gold' }
            ].map((badge, i) => (
              <div 
                key={i}
                className="p-3 rounded-lg text-center bg-white/[0.03] border border-white/[0.09]"
              >
                <div className={`font-bebas text-lg font-bold ${badge.colorClass}`}>
                  {badge.count ?? '—'}
                </div>
                <div className="text-[10px] mt-1 text-white/45">
                  {badge.label}
                  {badge.sub && <span className="ml-0.5 opacity-70">({badge.sub})</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. FULL-WIDTH PANEL - Performance by mode */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>Performance by mode</h3>
          <div className="grid grid-cols-3 gap-[10px]">
            {/* Daily */}
            <div className="p-4 rounded-xl relative overflow-hidden bg-blue-900/40 border border-blue-500/30">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500" />
              <div className={`font-bebas text-lg font-bold mb-2`}>Daily</div>
              <div className="flex flex-col gap-1 items-center py-4">
                <div className="text-sm text-white/35">—</div>
                <div className="text-xs text-white/35">Coming soon</div>
              </div>
            </div>
            
            {/* Level Up */}
            <div className="p-4 rounded-xl relative overflow-hidden bg-purple-900/30 border border-purple-400/30">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${styles.accentBarViolet}`} />
              <div className={`font-bebas text-lg font-bold mb-2`}>Level Up</div>
              <div className="flex flex-col gap-1 items-center py-4">
                <div className="text-sm text-white/35">—</div>
                <div className="text-xs text-white/35">Coming soon</div>
              </div>
            </div>
            
            {/* Compete */}
            <div className="p-4 rounded-xl relative overflow-hidden bg-teal-500/25 border border-teal-500/30">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${styles.accentBarTeal}`} />
              <div className={`font-bebas text-lg font-bold mb-2`}>Compete</div>
              <div className="flex flex-col gap-1 items-center py-4">
                <div className="text-sm text-white/35">—</div>
                <div className="text-xs text-white/35">Coming soon</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. TWO-COLUMN ROW */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>Leaderboard positions</h3>
          <div className="flex flex-col gap-3">
            {/* Daily */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Daily (all-time)</span>
              <span className={`font-bebas text-sm font-bold text-blue-400`}>
                {profileData.dailyAvgAccuracy === null
                  ? '—'
                  : `${Math.round(Number(profileData.dailyAvgAccuracy))}% · ${profileData.dailyGamesPlayed ?? 0} games`}
              </span>
            </div>
            {/* Level Up */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Level Up</span>
              <span className={`font-bebas text-sm font-bold ${styles.leaderboardViolet}`}>
                {profileData.levelUpCurrentLevel === null
                  ? '—'
                  : `Level ${profileData.levelUpCurrentLevel} · ${profileData.levelUpBestAccuracy ?? 0}% best`}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>Score distribution</h3>
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="text-sm text-white/35">Coming soon</div>
          </div>
        </div>
      </div>

      {/* 8. FULL-WIDTH PANEL - History collection */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>History collection</h3>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="p-3 rounded-lg text-center bg-white/[0.03] border border-white/[0.09]">
              <div className={`font-bebas text-xl font-bold ${styles.historyColorOrange}`}>
                {progressData?.eventsSeenCount?.toLocaleString() ?? '—'}
              </div>
              <div className="text-[10px] mt-1 text-white/45">Events seen</div>
            </div>
            {[
              { label: 'Rated', colorClass: styles.historyColorViolet },
              { label: 'Regions', colorClass: styles.historyColorTeal },
              { label: 'Countries', colorClass: styles.historyColorGold }
            ].map((item, i) => (
              <div
                key={i}
                className="p-3 rounded-lg text-center bg-white/[0.03] border border-white/[0.09]"
              >
                <div className={`font-bebas text-xl font-bold ${item.colorClass}`}>—</div>
                <div className="text-[10px] mt-1 text-white/45">{item.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <h4 className="text-xs font-bold mb-3 text-white/70">By century</h4>
            <div className="flex flex-col gap-2">
              {progressData && progressData.byCentury.length > 0 ? (
                progressData.byCentury.map((item) => (
                  <div key={item.century}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/70">{item.century}</span>
                      <span className="text-white/45">{item.roundCount} rounds · {item.avgAccuracy}%</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${styles.barFillOrange}`}
                        style={{ width: `${item.avgAccuracy}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-white/35 py-2">
                  {progressData === null ? 'Loading…' : 'No data yet'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 9. FULL-WIDTH PANEL - Accuracy by century */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 pb-8">
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>Accuracy by century</h3>
          <div className="flex flex-wrap gap-2">
            {progressData && progressData.byCentury.length > 0 ? (
              progressData.byCentury.map((item) => (
                <div
                  key={item.century}
                  className={`py-3 px-3 rounded-lg text-center border ${styles.centuryChip}`}
                >
                  <div className={`font-bebas text-sm font-bold ${styles.historyColorOrange}`}>
                    {item.century}
                  </div>
                  <div className="text-xs mt-0.5 text-white/45">
                    {item.avgAccuracy}%
                  </div>
                </div>
              ))
            ) : (
              ['2000s', '1900s', '1800s', '1700s', '1500s', 'pre-1500'].map((label) => (
                <div
                  key={label}
                  className={`py-3 px-3 rounded-lg text-center border ${styles.centuryChip}`}
                >
                  <div className={`font-bebas text-sm font-bold ${styles.historyColorOrange}`}>{label}</div>
                  <div className="text-xs mt-0.5 text-white/45">—</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 10. ACCOUNT SECTION */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>Account</h3>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Email</span>
              <span className="text-sm text-white/45">{profileData.email ?? '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/70">Member since</span>
              <span className="text-sm text-white/45">{formatMemberSince(profileData.createdAt)}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full py-3 px-4 rounded-lg text-sm font-semibold bg-red-500/15 text-red-500 border border-red-500/30 cursor-pointer transition-colors hover:bg-red-500/25"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
