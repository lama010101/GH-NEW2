'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useIdentity } from '@/hooks/useIdentity';
import { supabaseBrowser } from '@/core/supabaseBrowser';
import styles from './profile.module.css';
import TopBar from '@/components/layout/TopBar';
import RankCard from '@/components/RankCard';
import { useRankOpen } from '@/hooks/useRankOpen';
import { NavModal } from '@/components/NavModal';
import { AvatarPickerModal } from '@/components/AvatarPickerModal';
import ExperienceAccuracy from '@/components/ExperienceAccuracy';
import RankProgressBar from '@/components/RankProgressBar';


type ProfileHistoricalAvatar = {
  avatarName: string;
  avatarDescription: string;
  bornLabel: string;
  diedLabel: string;
  avatarImageUrl: string;
};

function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, var(--gh-acc-lightness, 52%))`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { playerId } = useIdentity();
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [accuracy, setAccuracy] = useState('--');
  const [xp, setXp] = useState('--');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);
  const [rankOpen, toggleRankOpen] = useRankOpen();
  const [progressData, setProgressData] = useState<{
    byCentury: Array<{ century: string; avgAccuracy: number; totalXp: number; roundCount: number }>
    byContinent: Array<{ continent: string; avgAccuracy: number; totalXp: number; roundCount: number }>
    eventsSeenCount: number
    countriesCount: number
    practice: { avgAccuracy: number | null; gamesPlayed: number | null; totalXp: number | null }
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
    if (playerId === undefined) return;
    if (!playerId) {
      router.replace('/login');
      return;
    }

    const fetchProfileData = async () => {
      try {
        const { data: profileResult } = await supabaseBrowser
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', playerId)
          .limit(1)
          .single();

        const { data: { user: authUser } } = await supabaseBrowser.auth.getUser();
        const email = authUser?.email ?? null;
        const createdAt = authUser?.created_at ?? null;

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
          .maybeSingle();

        const { data: levelupResult } = await supabaseBrowser
          .from('leaderboard_levelup')
          .select('current_level, best_accuracy')
          .eq('player_id', playerId)
          .limit(1)
          .maybeSingle();

        let historicalAvatar: ProfileHistoricalAvatar | null = null;
        if (profileResult?.avatar_url) {
          let { data: avatarResult } = await supabaseBrowser
            .from('avatars')
            .select('first_name, last_name, description, birth_day, death_day, birth_city, birth_country, death_city, death_country')
            .eq('firebase_url', profileResult.avatar_url)
            .limit(1)
            .single();

          if (!avatarResult) {
            ({ data: avatarResult } = await supabaseBrowser
              .from('avatars')
              .select('first_name, last_name, description, birth_day, death_day, birth_city, birth_country, death_city, death_country')
              .eq('image_url', profileResult.avatar_url)
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
            const bornLabel = bornParts.length > 0 ? `${tCommon('born_prefix')} ${bornParts.join(', ')}` : '';

            const diedParts: string[] = [];
            if (avatarResult.death_day) diedParts.push(avatarResult.death_day);
            if (avatarResult.death_city) diedParts.push(avatarResult.death_city);
            if (avatarResult.death_country) diedParts.push(avatarResult.death_country);
            const diedLabel = diedParts.length > 0 ? `${tCommon('died_prefix')} ${diedParts.join(', ')}` : '';

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
  }, [playerId, router]);

  const getInitials = (name: string | null): string => {
    if (!name) return '??';
    const words = name.trim().split(/\s+/);
    const initials = words.map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 2);
  };

  const formatMemberSince = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  const handleAvatarClick = () => {
    setAvatarPickerOpen(true);
  };

  const handleSaveAvatar = async (avatarUrl: string) => {
    const res = await fetch('/api/user/update-avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });

    if (!res.ok) {
      const error = await res.json();
      console.error('Failed to update avatar:', error);
      return;
    }

    setProfileData(prev => ({ ...prev, avatarUrl }));
    setAvatarPickerOpen(false);
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
        onAvatarClick={() => setShowNavModal(true)}
        rankOpen={rankOpen}
        onToggleRank={toggleRankOpen}
      />
      <RankCard totalXp={profileData.totalXp ?? 0} open={rankOpen} />

      {/* 3. BACK BUTTON */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6" style={{ paddingTop: rankOpen ? 100 : 20 }}>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-[var(--gh-text-secondary)] hover:text-[var(--gh-text-primary)] transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          {t('back')}
        </button>
      </div>

      {/* 4. HERO SECTION */}
      <div className="relative z-10 max-w-[820px] mx-auto pt-16 px-6 flex flex-col items-center text-center">
        {/* Avatar with gradient border */}
        <div className="relative mb-4">
          <div
            className="w-[110px] h-[110px] rounded-full p-[3px] bg-gradient-to-br from-pink-300 to-yellow-300 flex items-center justify-center cursor-pointer"
            onClick={handleAvatarClick}
          >
            {profileData.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileData.avatarUrl}
                alt={t('avatar_alt')}
                className="w-full h-full object-cover rounded-full"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className={`font-bebas text-4xl font-extrabold text-[var(--gh-text-primary)]`}>
                {getInitials(profileData.displayName)}
              </span>
            )}
          </div>
          <span className={styles.avatarEditIcon} aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
          </span>
        </div>

        {/* Username */}
        <h2 className={`font-bebas text-xl font-bold mb-1 bg-gradient-to-r from-pink-300 to-yellow-300 bg-clip-text text-transparent`}>
          {profileData.displayName ?? ''}
        </h2>

        {/* Member since */}
        <p className="text-sm text-[var(--gh-text-muted)] mb-6">
          {t('member_since')} {formatMemberSince(profileData.createdAt)}
        </p>

        {/* Rank progress — derived from total_xp (single source of truth) */}
        <div className={`${styles.rankWrap} w-full max-w-[400px] mb-6`}>
          <RankProgressBar totalXp={profileData.totalXp} />
        </div>

        {/* Historical Avatar Card */}
        {profileData.historicalAvatar && (
          <div className="bg-[var(--gh-glass-bg)] rounded-2xl py-5 px-6 w-full max-w-[400px] text-center">
            <h3 className={`font-bebas text-lg font-bold mb-2 text-[var(--gh-text-primary)]`}>
              {profileData.historicalAvatar.avatarName}
            </h3>
            {profileData.historicalAvatar.avatarDescription && (
              <p className="text-sm text-[var(--gh-text-muted)] mb-2 leading-relaxed">
                {profileData.historicalAvatar.avatarDescription}
              </p>
            )}
            {profileData.historicalAvatar.bornLabel && (
              <p className="text-xs text-[var(--gh-text-muted)] mb-1">
                {profileData.historicalAvatar.bornLabel}
              </p>
            )}
            {profileData.historicalAvatar.diedLabel && (
              <p className="text-xs text-[var(--gh-text-muted)]">
                {profileData.historicalAvatar.diedLabel}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 5. STAT STRIP */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 grid grid-cols-4 gap-[10px] mb-6">
        {[
          {
            value: profileData.avgAccuracy === null
              ? '...'
              : profileData.avgAccuracy !== null
                ? String(Math.round(Number(profileData.avgAccuracy)))
                : '—',
            label: t('avg_accuracy'),
            color: styles.statColorOrange
          },
          {
            value: profileData.totalXp === null
              ? '...'
              : profileData.totalXp !== null
                ? profileData.totalXp.toLocaleString() + ' XP'
                : '—',
            label: t('total_xp'),
            color: styles.statColorGold
          },
          {
            value: profileData.gamesPlayed === null
              ? '...'
              : profileData.gamesPlayed.toLocaleString(),
            label: t('games_played'),
            color: styles.statColorViolet
          },
          {
            value: profileData.roundsPlayed === null
              ? '...'
              : profileData.roundsPlayed !== null
                ? profileData.roundsPlayed.toLocaleString()
                : '—',
            label: t('rounds_played'),
            color: styles.statColorTeal
          }
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl py-3.5 px-4 text-center"
          >
            <div className={`font-bebas text-2xl font-extrabold ${stat.color ?? ''}`}>
              {stat.value}
            </div>
            <div className="text-xs mt-1 text-[var(--gh-text-muted)]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* 6. BADGE COLLECTION */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <div className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl p-4">
          <div className={styles.sectionHead}>
            <span className={styles.sectionAccentBar} />
            <h3 className={`font-bebas text-sm font-bold ${styles.sectionTitle}`}>{t('badge_collection')}</h3>
          </div>
          <div className={styles.badgeTierRow}>
            {[
              { label: 'Gold', tier: 'gold', color: 'var(--gh-badge-gold, #ffd700)', bg: 'rgba(255,215,0,0.10)', border: 'rgba(255,215,0,0.30)' },
              { label: 'Silver', tier: 'silver', color: 'var(--gh-badge-silver, #c0c0c0)', bg: 'rgba(192,192,192,0.10)', border: 'rgba(192,192,192,0.30)' },
              { label: 'Bronze', tier: 'bronze', color: 'var(--gh-badge-bronze, #cd7f32)', bg: 'rgba(205,127,50,0.10)', border: 'rgba(205,127,50,0.30)' },
            ].map((b) => (
              <div
                key={b.label}
                className={styles.badgeTier}
                style={{ background: b.bg, border: `1px solid ${b.border}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/badges/combo_${b.tier}.webp`} alt={`${b.label} badge`} className={styles.badgeTierImg} />
                <span className={styles.badgeTierCount} style={{ color: b.color }}>—</span>
                <span className={styles.badgeTierLabel}>{b.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.badgeDimRow}>
            {[
              { label: 'Year', dim: 'year', accent: 'var(--gh-violet, #8b5cf6)' },
              { label: 'Location', dim: 'location', accent: 'var(--gh-teal, #22d3ee)' },
              { label: 'Combo', dim: 'combo', accent: 'var(--gh-gold, #ffd54a)' },
            ].map((d) => (
              <div key={d.label} className={styles.badgeDim}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/badges/${d.dim}_gold.webp`} alt={`${d.label} gold badge`} className={styles.badgeDimImg} />
                <span className={styles.badgeDimLabel}>{d.label}</span>
                <span className={styles.badgeDimCount}>—</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7. PERFORMANCE BY MODE */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <div className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl p-4">
          <div className={styles.sectionHead}>
            <span className={styles.sectionAccentBar} />
            <h3 className={`font-bebas text-sm font-bold ${styles.sectionTitle}`}>{t('performance_by_mode')}</h3>
          </div>
          <div className={styles.modeRow}>
            {/* Daily */}
            <div
              className={styles.modeCard}
              style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.30)' }}
            >
              <span className={styles.modeAccent} style={{ background: 'var(--gh-blue)' }} />
              <span className={styles.modeName}>{t('daily')}</span>
              <span
                className={styles.modeAcc}
                style={{ color: profileData.dailyAvgAccuracy !== null ? accColor(profileData.dailyAvgAccuracy) : 'var(--gh-text-muted)' }}
              >
                {profileData.dailyAvgAccuracy !== null ? `${Math.round(profileData.dailyAvgAccuracy)}` : '—'}
              </span>
              <span className={styles.modeGames}>
                {profileData.dailyGamesPlayed !== null ? `${profileData.dailyGamesPlayed} ${t('games')}` : t('coming_soon')}
              </span>
            </div>

            {/* Level Up */}
            <div
              className={styles.modeCard}
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.30)' }}
            >
              <span className={styles.modeAccent} style={{ background: 'var(--gh-violet, #8b5cf6)' }} />
              <span className={styles.modeName}>{t('level_up')}</span>
              <span
                className={styles.modeAcc}
                style={{ color: profileData.levelUpBestAccuracy !== null ? accColor(profileData.levelUpBestAccuracy) : 'var(--gh-text-muted)' }}
              >
                {profileData.levelUpBestAccuracy !== null ? `${Math.round(profileData.levelUpBestAccuracy)}` : '—'}
              </span>
              <span className={styles.modeGames}>
                {profileData.levelUpCurrentLevel !== null ? `${t('level_up')} ${profileData.levelUpCurrentLevel}` : t('coming_soon')}
              </span>
            </div>

            {/* Practice */}
            <div
              className={styles.modeCard}
              style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.30)' }}
            >
              <span className={styles.modeAccent} style={{ background: 'var(--gh-orange, #f97316)' }} />
              <span className={styles.modeName}>{t('practice') ?? 'Practice'}</span>
              <span
                className={styles.modeAcc}
                style={{ color: progressData?.practice?.avgAccuracy != null ? accColor(progressData.practice.avgAccuracy) : 'var(--gh-text-muted)' }}
              >
                {progressData?.practice?.avgAccuracy != null ? `${Math.round(progressData.practice.avgAccuracy)}` : '—'}
              </span>
              <span className={styles.modeGames}>
                {progressData?.practice?.gamesPlayed != null ? `${progressData.practice.gamesPlayed} ${t('games')}` : '—'}
              </span>
            </div>

            {/* Compete */}
            <div
              className={styles.modeCard}
              style={{ background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.30)' }}
            >
              <span className={styles.modeAccent} style={{ background: 'var(--gh-teal, #22d3ee)' }} />
              <span className={styles.modeName}>{t('compete')}</span>
              <span className={styles.modeAcc} style={{ color: 'var(--gh-text-muted)' }}>—</span>
              <span className={styles.modeGames}>{t('coming_soon')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 8. TWO-COLUMN ROW */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>{t('leaderboard_positions')}</h3>
          <div className="flex flex-col gap-3">
            {/* Daily */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--gh-text-secondary)]">Daily (all-time)</span>
              <span className={`font-bebas text-sm font-bold text-blue-400`}>
                {profileData.dailyAvgAccuracy === null
                  ? '—'
                  : `${Math.round(Number(profileData.dailyAvgAccuracy))} · ${profileData.dailyGamesPlayed ?? 0} games`}
              </span>
            </div>
            {/* Level Up */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--gh-text-secondary)]">{t('level_up')}</span>
              <span className={`font-bebas text-sm font-bold ${styles.leaderboardViolet}`}>
                {profileData.levelUpCurrentLevel === null
                  ? '—'
                  : `Level ${profileData.levelUpCurrentLevel} · ${profileData.levelUpBestAccuracy ?? 0} best`}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl p-4">
          <h3 className={`font-bebas text-sm font-bold mb-4`}>{t('score_distribution')}</h3>
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="text-sm text-[var(--gh-text-muted)]">{t('coming_soon')}</div>
          </div>
        </div>
      </div>

      {/* 9+10. EXPERIENCE & ACCURACY (shared component) */}
      <ExperienceAccuracy
        data={{
          byWhen: progressData?.byCentury.map(c => ({ label: c.century, avgAccuracy: c.avgAccuracy, totalXp: c.totalXp, roundCount: c.roundCount })) ?? [],
          byWhere: progressData?.byContinent.map(c => ({ label: c.continent, avgAccuracy: c.avgAccuracy, totalXp: c.totalXp, roundCount: c.roundCount })) ?? [],
          eventsSeenCount: progressData?.eventsSeenCount ?? 0,
          countriesCount: progressData?.countriesCount ?? 0,
          roundsPlayed: progressData === null ? null : (profileData.roundsPlayed ?? 0),
        }}
      />

      {/* Avatar Picker Modal */}
      <AvatarPickerModal
        isOpen={avatarPickerOpen}
        currentAvatarUrl={profileData.avatarUrl}
        onSave={handleSaveAvatar}
        onClose={() => setAvatarPickerOpen(false)}
      />

      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={profileData.avatarUrl}
        initials={getInitials(profileData.displayName)}
        displayName={profileData.displayName ?? getInitials(profileData.displayName)}
      />
    </div>
  );
}
