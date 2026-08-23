'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useIdentity } from '@/hooks/useIdentity';
import { updateCachedDisplayName, updateCachedAvatarUrl } from '@/core/identity';
import { supabaseBrowser, readSession } from '@/core/supabaseBrowser';
import styles from './profile.module.css';
import TopBar from '@/components/layout/TopBar';
import PlayerAvatar from '@/components/compete/PlayerAvatar';
import { NavModal } from '@/components/NavModal';
import { AvatarPickerModal } from '@/components/AvatarPickerModal';
import ExperienceAccuracy from '@/components/ExperienceAccuracy';
import AccuracySuffix from '@/components/AccuracySuffix';
import { getAccuracyColor } from '@/core/accuracyColor';
import RankCard from '@/components/RankCard';


type ProfileHistoricalAvatar = {
  avatarName: string;
  avatarDescription: string;
  bornLabel: string;
  diedLabel: string;
  avatarImageUrl: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playerId } = useIdentity();
  const viewedPlayerId = searchParams?.get('playerId') || playerId;
  const isOwnProfile = Boolean(playerId) && viewedPlayerId === playerId;
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const tGame = useTranslations('game');
  const locale = useLocale();
  const [accuracy, setAccuracy] = useState('--');
  const [xp, setXp] = useState('--');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);
  const [loadError, setLoadError] = useState(false);
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

  const fetchProfileData = useCallback(async () => {
    if (playerId === undefined) return;
    if (!playerId && !viewedPlayerId) {
      router.replace('/login');
      return;
    }

    const targetPlayerId = viewedPlayerId || playerId;
    if (!targetPlayerId) return;

    try {
      setLoadError(false);
      let isAiPlayer = false;

        let { data: profileResult } = await supabaseBrowser
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', targetPlayerId)
          .limit(1)
          .single();

        // Fallback to AI player identity for AI profiles.
        if (!profileResult) {
          try {
            const identityRes = await fetch(`/api/player-identity?id=${encodeURIComponent(targetPlayerId)}`);
            if (identityRes.ok) {
              const identity = await identityRes.json();
              profileResult = {
                display_name: identity.displayName,
                avatar_url: identity.avatarUrl,
              };
              isAiPlayer = Boolean(identity.isAi);
            }
          } catch (identityError) {
            console.error('Error fetching player identity:', identityError);
          }
        }

        // Parallelize independent queries (session + 3 supabase reads share no deps).
        const [session, statsResult, dailyAlltimeResult, levelupResult] = await Promise.all([
          readSession(),
          supabaseBrowser
            .from('player_global_stats')
            .select('avg_accuracy, total_xp, rounds_played, games_played')
            .eq('player_id', targetPlayerId)
            .limit(1)
            .single()
            .then(r => r.data),
          supabaseBrowser
            .from('leaderboard_daily_alltime')
            .select('avg_accuracy, games_played, total_xp')
            .eq('player_id', targetPlayerId)
            .limit(1)
            .single()
            .then(r => r.data),
          supabaseBrowser
            .from('leaderboard_levelup')
            .select('current_level, best_accuracy')
            .eq('player_id', targetPlayerId)
            .limit(1)
            .single()
            .then(r => r.data),
        ]);

        const authUser = session?.user;
        const email = isOwnProfile ? (authUser?.email ?? null) : null;
        const createdAt = isOwnProfile ? (authUser?.created_at ?? null) : null;

        if (statsResult) {
          setAccuracy(String(Math.round(Number(statsResult.avg_accuracy))));
          setXp(Number(statsResult.total_xp).toLocaleString('fr-FR'));
        } else {
          setAccuracy('--');
          setXp('--');
        }

        let historicalAvatar: ProfileHistoricalAvatar | null = null;
        if (!isAiPlayer && profileResult?.avatar_url) {
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

        if (isOwnProfile && profileResult?.display_name) updateCachedDisplayName(profileResult.display_name);
        if (isOwnProfile && profileResult?.avatar_url) updateCachedAvatarUrl(profileResult.avatar_url);
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

        if (isOwnProfile) {
          const progressRes = await fetch('/api/progress')
          if (progressRes.ok) {
            const json = await progressRes.json()
            setProgressData(json)
          }
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
        setLoadError(true);
      }
    }, [viewedPlayerId, playerId, isOwnProfile, router, tCommon]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const getInitials = (name: string | null): string => {
    if (!name) return '??';
    const words = name.trim().split(/\s+/);
    const initials = words.map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 2);
  };

  const formatMemberSince = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { year: 'numeric', month: 'long', day: 'numeric' });
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
    if (isOwnProfile) updateCachedAvatarUrl(avatarUrl);
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
      />

      {/* 3. BACK BUTTON + HOME BUTTON */}
      <div className="relative z-10 max-w-[820px] mx-auto pt-4 px-6 flex items-center justify-between">
        <button
          onClick={() => {
            const returnTo = searchParams?.get('returnTo') || '';
            const isSafe = returnTo
              && returnTo.startsWith('/')
              && !returnTo.startsWith('//')
              && !returnTo.includes('://')
              && !returnTo.toLowerCase().startsWith('javascript:')
              && !returnTo.toLowerCase().startsWith('data:');
            if (isSafe) {
              router.push(returnTo);
            } else {
              router.push('/home');
            }
          }}
          className={styles.backBtn}
        >
          <span className={styles.backArrow}>←</span>
          <span>{t('back')}</span>
        </button>
        <button
          onClick={() => router.push('/home')}
          className="flex items-center gap-2 text-sm text-[var(--gh-text-secondary)] hover:text-[var(--gh-text-primary)] transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          {tCommon('home')}
        </button>
      </div>

      {/* ERROR STATE BANNER */}
      {loadError && (
        <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-4">
          <div className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl p-4 flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--gh-text-secondary)]">{tCommon('no_data_yet')}</span>
            <button
              onClick={() => fetchProfileData()}
              className="flex items-center gap-2 text-sm font-bold text-[var(--gh-orange)] hover:opacity-80 transition-opacity cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              {tGame('retry')}
            </button>
          </div>
        </div>
      )}

      {/* 4. HERO SECTION */}
      <div className="relative z-10 max-w-[820px] mx-auto pt-16 px-6 flex flex-col items-center text-center">
        {/* Avatar with standardized gradient ring */}
        <div className="relative mb-4">
          <PlayerAvatar
            avatarUrl={profileData.avatarUrl}
            displayName={profileData.displayName ?? ''}
            playerId={viewedPlayerId ?? undefined}
            size={110}
            initials={getInitials(profileData.displayName)}
            onClick={isOwnProfile ? handleAvatarClick : undefined}
            disableProfileNavigation={!isOwnProfile}
          />
          {isOwnProfile && (
            <button
              type="button"
              className={styles.avatarEditIcon}
              onClick={handleAvatarClick}
              aria-label="Change avatar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Username */}
        <h2 className={`font-bebas text-xl font-bold mb-1 bg-gradient-to-r from-pink-300 to-yellow-300 bg-clip-text text-transparent`}>
          {profileData.displayName ?? ''}
        </h2>

        {/* Member since */}
        <p className="text-sm text-[var(--gh-text-muted)] mb-6">
          {t('member_since')} {formatMemberSince(profileData.createdAt)}
        </p>

        {/* Historical Avatar Card — bio/description renders below avatar, above rank title */}
        {profileData.historicalAvatar && (
          <div className="bg-[var(--gh-glass-bg)] rounded-2xl py-5 px-6 w-full max-w-[400px] text-center mb-6">
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

        {/* Rank progress — derived from total_xp (single source of truth) */}
        <div className={`${styles.rankWrap} w-full max-w-[400px] mb-6`}>
          <RankCard totalXp={profileData.totalXp} open inline />
        </div>
      </div>

      {/* 5. STAT STRIP */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 grid grid-cols-2 sm:grid-cols-4 gap-[10px] mb-6">
        {[
          {
            value: profileData.avgAccuracy === null
              ? '...'
              : String(Math.round(Number(profileData.avgAccuracy))),
            suffix: '%',
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
              {stat.suffix && <AccuracySuffix />}
            </div>
            <div className="text-xs mt-1 text-[var(--gh-text-muted)]">
              {stat.label}
            </div>
          </div>
        ))}
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
                style={{ color: profileData.dailyAvgAccuracy !== null ? getAccuracyColor(profileData.dailyAvgAccuracy) : 'var(--gh-text-muted)' }}
              >
                {profileData.dailyAvgAccuracy !== null ? (
                  <>
                    {Math.round(profileData.dailyAvgAccuracy)}
                    <AccuracySuffix />
                  </>
                ) : '—'}
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
                style={{ color: profileData.levelUpBestAccuracy !== null ? getAccuracyColor(profileData.levelUpBestAccuracy) : 'var(--gh-text-muted)' }}
              >
                {profileData.levelUpBestAccuracy !== null ? (
                  <>
                    {Math.round(profileData.levelUpBestAccuracy)}
                    <AccuracySuffix />
                  </>
                ) : '—'}
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
                style={{ color: progressData?.practice?.avgAccuracy != null ? getAccuracyColor(progressData.practice.avgAccuracy) : 'var(--gh-text-muted)' }}
              >
                {progressData?.practice?.avgAccuracy != null ? (
                  <>
                    {Math.round(progressData.practice.avgAccuracy)}
                    <AccuracySuffix />
                  </>
                ) : '—'}
              </span>
              <span className={styles.modeGames}>
                {progressData?.practice?.gamesPlayed != null ? `${progressData.practice.gamesPlayed} ${t('games')}` : '—'}
              </span>
            </div>

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
