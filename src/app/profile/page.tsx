'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useIdentity } from '@/hooks/useIdentity';
import { updateCachedDisplayName, updateCachedAvatarUrl, signOut } from '@/core/identity';
import { supabaseBrowser, readSession } from '@/core/supabaseBrowser';
import styles from './profile.module.css';
import TopBar from '@/components/layout/TopBar';
import PlayerAvatar from '@/components/compete/PlayerAvatar';
import { NavModal } from '@/components/NavModal';
import { AvatarPickerModal } from '@/components/AvatarPickerModal';
import { getAccuracyColor } from '@/core/accuracyColor';
import RankLadderCard from '@/components/RankLadderCard';
import { Loader2, LogOut } from 'lucide-react';


type ProfileHistoricalAvatar = {
  avatarName: string;
  avatarDescription: string;
  bornLabel: string;
  diedLabel: string;
  avatarImageUrl: string;
};

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

// Mini accuracy ring (ported from prototype/profile-v2; streak chip omitted).
function TinyRing({ pct, color, size = 44 }: { pct: number | null; color: string; size?: number }) {
  const sw = 4;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const p = pct === null ? 0 : clampPct(pct);
  const offset = c - (p / 100) * c;
  return (
    <div className={styles.tinyRing} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gh-border-subtle)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.tinyRingVal} style={{ color }}>{pct === null ? '—' : Math.round(pct)}</span>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playerId } = useIdentity();
  const viewedPlayerId = searchParams?.get('playerId') || playerId;
  const isOwnProfile = Boolean(playerId) && viewedPlayerId === playerId;
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const tGame = useTranslations('game');
  const tAccount = useTranslations('account');
  const locale = useLocale();
  const [accuracy, setAccuracy] = useState('--');
  const [xp, setXp] = useState('--');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [editName, setEditName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [saveNameResult, setSaveNameResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [eraDim, setEraDim] = useState<'era' | 'region'>('era');
  const [eraMetric, setEraMetric] = useState<'acc' | 'rounds'>('acc');
  const [signingOut, setSigningOut] = useState(false);
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

  // Sync the editable username field with the loaded display name (own profile
  // only). Mirrors the Account page's displayName/savedName pattern.
  useEffect(() => {
    if (!isOwnProfile) return;
    const name = profileData.displayName ?? '';
    setEditName(name);
    setSavedName(name);
  }, [isOwnProfile, profileData.displayName]);

  const handleSaveName = async () => {
    if (!isOwnProfile || editName.trim() === savedName.trim()) return;
    setSavingName(true);
    setSaveNameResult('idle');
    setUsernameError(null);
    try {
      const res = await fetch('/api/user/update-username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setUsernameError(data.message || "That username is already taken.");
        }
        setSaveNameResult('error');
        return;
      }
      setSavedName(editName.trim());
      updateCachedDisplayName(editName.trim());
      setProfileData(prev => ({ ...prev, displayName: editName.trim() }));
      setSaveNameResult('success');
      setTimeout(() => setSaveNameResult('idle'), 2500);
    } catch {
      setSaveNameResult('error');
    } finally {
      setSavingName(false);
    }
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
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : locale, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      window.location.href = '/';
    } catch (err) {
      console.error('[Profile] signOut failed:', err);
      window.location.href = '/login';
    }
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

      {/* 3. BACK BUTTON */}
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
              aria-label={t('change_avatar')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Username */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <h2 className={`font-bebas text-xl font-bold bg-gradient-to-r from-pink-300 to-yellow-300 bg-clip-text text-transparent`}>
            {profileData.displayName ?? ''}
          </h2>
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => {
                if (editingName) setEditName(savedName);
                setEditingName(v => !v);
              }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--gh-orange)] text-[var(--gh-btn-text)] border-2 border-[var(--gh-modal-bg)] shadow-sm cursor-pointer hover:opacity-[0.85] transition-opacity duration-200"
              aria-label={editingName ? t('cancel_edit_username') : t('edit_username')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Editable username (own profile only) — reuses PATCH /api/user/update-username */}
        {isOwnProfile && editingName && (
          <div className={`${styles.nameEditCard} w-full max-w-[400px] mt-2 mb-4`}>
            <label className={styles.nameEditLabel}>{tAccount('username')}</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={styles.nameEditInput}
              maxLength={40}
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={editName.trim() === savedName.trim() || savingName}
              className={styles.nameEditSave}
              style={{
                background: editName.trim() === savedName.trim() || savingName ? 'rgba(251,146,60,0.4)' : 'var(--gh-orange)',
                cursor: editName.trim() === savedName.trim() || savingName ? 'not-allowed' : 'pointer',
              }}
            >
              {savingName ? tAccount('saving') : tAccount('save')}
            </button>
            {saveNameResult === 'success' && (
              <div className={styles.nameEditFeedbackSuccess}>{tAccount('saved')}</div>
            )}
            {saveNameResult === 'error' && (
              <div className={styles.nameEditFeedbackError}>{usernameError || tAccount('err_save_failed')}</div>
            )}
          </div>
        )}

        {/* Member since */}
        <p className="text-sm text-[var(--gh-text-muted)] mb-6">
          {t('member_since')} {formatMemberSince(profileData.createdAt)}
        </p>

        {/* Historical Avatar Card — bio/description renders below avatar, above rank title */}
        {profileData.historicalAvatar && (
          <div className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-default)] rounded-2xl py-5 px-6 w-full max-w-[400px] text-center mb-6">
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

        {/* Rank ladder — derived from total_xp (single source of truth) */}
        <div className={`${styles.rankWrap} w-full mb-6`}>
          <RankLadderCard totalXp={profileData.totalXp ?? 0} />
        </div>
      </div>

      {/* 5. STATS — v2 StatsCard, 4 tiles (no sparkline: no prod data) */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('stats')}</h3>
          <div className={styles.statGrid}>
            <div className={styles.statTile}>
              <span
                className={styles.statVal}
                style={{ color: profileData.avgAccuracy !== null ? getAccuracyColor(Number(profileData.avgAccuracy)) : undefined }}
              >
                {profileData.avgAccuracy === null ? '...' : `${Math.round(Number(profileData.avgAccuracy))}%`}
              </span>
              <span className={styles.statLabel}>{t('accuracy')}</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statVal} style={{ color: 'var(--gh-gold)' }}>
                {profileData.totalXp === null ? '...' : profileData.totalXp.toLocaleString()}
              </span>
              <span className={styles.statLabel}>{t('total_xp')}</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statVal}>
                {profileData.gamesPlayed === null ? '...' : profileData.gamesPlayed.toLocaleString()}
              </span>
              <span className={styles.statLabel}>{t('games')}</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statVal}>
                {profileData.roundsPlayed === null ? '...' : profileData.roundsPlayed.toLocaleString()}
              </span>
              <span className={styles.statLabel}>{t('rounds')}</span>
            </div>
          </div>
        </section>
      </div>

      {/* 7. PERFORMANCE BY MODE — v2 ModesCard with TinyRing per mode (no streak chip) */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('performance_by_mode')}</h3>
          <div className={styles.mdRow}>
            {([
              {
                name: t('daily'),
                acc: profileData.dailyAvgAccuracy,
                sub: profileData.dailyGamesPlayed !== null ? `${profileData.dailyGamesPlayed} ${t('games')}` : t('coming_soon'),
                rgb: 'var(--gh-blue-rgb)',
              },
              {
                name: t('level_up'),
                acc: profileData.levelUpBestAccuracy,
                sub: profileData.levelUpCurrentLevel !== null ? `${t('level')} ${profileData.levelUpCurrentLevel}` : t('coming_soon'),
                rgb: 'var(--gh-violet-rgb)',
              },
              {
                name: t('practice'),
                acc: progressData?.practice?.avgAccuracy ?? null,
                sub: progressData?.practice?.gamesPlayed != null ? `${progressData.practice.gamesPlayed} ${t('games')}` : '—',
                rgb: 'var(--gh-orange-rgb)',
              },
            ]).map((m) => (
              <div
                key={m.name}
                className={styles.mdTile}
                style={{ background: `rgba(${m.rgb}, 0.08)`, border: `1px solid rgba(${m.rgb}, 0.25)` }}
              >
                <TinyRing pct={m.acc} color={`rgb(${m.rgb})`} />
                <span className={styles.mdName}>{m.name}</span>
                <span className={styles.mdSub}>{m.sub}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 9+10. ERA & REGION — v2 merged card: Era|Region × Accuracy|Rounds toggles */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
        <section className={styles.card}>
          <div className={styles.erHead}>
            <h3 className={`${styles.cardTitle} ${styles.cardTitleFlush}`}>{t('era_region')}</h3>
            <div className={styles.erToggles}>
              <div className={styles.seg}>
                {(['era', 'region'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.segBtn} ${eraDim === d ? styles.segBtnOn : ''}`}
                    onClick={() => setEraDim(d)}
                  >
                    {d === 'era' ? t('era') : t('region')}
                  </button>
                ))}
              </div>
              <div className={styles.seg}>
                {(['acc', 'rounds'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.segBtn} ${eraMetric === m ? styles.segBtnOn : ''}`}
                    onClick={() => setEraMetric(m)}
                  >
                    {m === 'acc' ? t('accuracy') : t('rounds')}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.erRows}>
            {(() => {
              const rows = (eraDim === 'era'
                ? progressData?.byCentury.map((c) => ({ label: c.century, avgAccuracy: c.avgAccuracy, count: c.roundCount }))
                : progressData?.byContinent.map((c) => ({ label: c.continent, avgAccuracy: c.avgAccuracy, count: c.roundCount }))) ?? [];
              const maxCount = Math.max(...rows.map((r) => r.count), 1);
              if (rows.length === 0) {
                return <div className={styles.erEmpty}>{tCommon('no_data_yet')}</div>;
              }
              return rows.map((r) => (
                <div className={styles.erRow} key={r.label}>
                  <div className={styles.erLabelWrap}>
                    <span className={styles.erLabel}>{r.label}</span>
                  </div>
                  <div className={styles.erBar}>
                    <span
                      className={styles.erBarFill}
                      style={eraMetric === 'acc'
                        ? { width: `${clampPct(r.avgAccuracy)}%`, background: getAccuracyColor(r.avgAccuracy) }
                        : { width: `${(r.count / maxCount) * 100}%`, background: 'var(--gh-text-dim)' }}
                    />
                  </div>
                  {eraMetric === 'acc' ? (
                    <span className={styles.erVal} style={{ color: getAccuracyColor(r.avgAccuracy) }}>
                      {Math.round(r.avgAccuracy)}%<span className={styles.erDim}> ·{r.count}</span>
                    </span>
                  ) : (
                    <span className={styles.erVal}>
                      {r.count}<span className={styles.erDim}> ·{Math.round(r.avgAccuracy)}%</span>
                    </span>
                  )}
                </div>
              ));
            })()}
          </div>
        </section>
      </div>

      {/* 11. ACCOUNT — own profile only */}
      {isOwnProfile && (
        <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 mb-6">
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>{t('account')}</h3>
            <div className={styles.acRows}>
              <div className={styles.acRow}>
                <span className={styles.acKey}>{t('email')}</span>
                <span className={styles.acVal}>{profileData.email ?? '—'}</span>
              </div>
              <div className={styles.acRow}>
                <span className={styles.acKey}>{t('member_since_full')}</span>
                <span className={styles.acVal}>{formatMemberSince(profileData.createdAt)}</span>
              </div>
              <div className={styles.acRow}>
                <span className={styles.acKey}>{t('player_id')}</span>
                <span className={styles.acVal}>{viewedPlayerId ?? '—'}</span>
              </div>
            </div>
            <div className={styles.acDiv} />
            <button
              type="button"
              className={styles.acOut}
              onClick={handleSignOut}
              disabled={signingOut}
              aria-busy={signingOut}
            >
              {signingOut
                ? <Loader2 size={13} className={styles.acOutSpinner} aria-hidden="true" />
                : <LogOut size={13} strokeWidth={2.4} aria-hidden="true" />}
              {t('sign_out')}
            </button>
          </section>
        </div>
      )}

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
