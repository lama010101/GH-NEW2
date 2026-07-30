'use client';

import { Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useIdentity } from '@/hooks/useIdentity';
import { updateCachedDisplayName, updateCachedAvatarUrl } from '@/core/identity';
import { supabaseBrowser } from '@/core/supabaseBrowser';
import TopBar from '@/components/layout/TopBar';
import { NavModal } from '@/components/NavModal';
import AccuracySuffix from '@/components/AccuracySuffix';
import styles from './leaderboard.module.css';

type LeaderboardTab = 'daily' | 'levelup' | 'overall';
type DailySubTab = 'today' | 'alltime';

type TodayRow = {
  player_id: string;
  avg_accuracy: number;
  completed_at: string;
};

type AlltimeRow = {
  player_id: string;
  avg_accuracy: number;
  games_played: number;
};

type LevelupRow = {
  player_id: string;
  current_level: number;
  best_accuracy: number;
};

type OverallRow = {
  player_id: string;
  avg_accuracy: number;
  rounds_played: number;
  rounds_won: number;
  games_played: number;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type LeaderboardEntry = {
  rank: number;
  player_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avg_accuracy?: number;
  games_played?: number;
  rounds_played?: number;
  rounds_won?: number;
  current_level?: number;
  best_accuracy?: number;
};

function LeaderboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playerId, displayName } = useIdentity();
  const t = useTranslations('leaderboard');
  
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('overall');
  const [activeSubTab, setActiveSubTab] = useState<DailySubTab>('today');
  
  const [todayData, setTodayData] = useState<LeaderboardEntry[] | null>(null);
  const [alltimeData, setAlltimeData] = useState<LeaderboardEntry[] | null>(null);
  const [levelupData, setLevelupData] = useState<LeaderboardEntry[] | null>(null);
  const [overallData, setOverallData] = useState<LeaderboardEntry[] | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accuracy, setAccuracy] = useState('--');
  const [xp, setXp] = useState('--');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initials, setInitials] = useState('PL');
  const [showNavModal, setShowNavModal] = useState(false);
  const locale = useLocale();
  const [ownRank, setOwnRank] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (!playerId) {
      setAvatarUrl(null);
      setInitials('PL');
      setAccuracy('--');
      setXp('--');
      return;
    }
    (async () => {
      try {
        const { data: stats } = await supabaseBrowser
          .from('player_global_stats')
          .select('avg_accuracy,total_xp')
          .eq('player_id', playerId)
          .single();
        if (stats) {
          setAccuracy(String(Math.round(Number(stats.avg_accuracy))));
          setXp(Number(stats.total_xp).toLocaleString('fr-FR'));
        }
      } catch {}
      try {
        const { data: profile } = await supabaseBrowser
          .from('profiles')
          .select('display_name,avatar_url')
          .eq('id', playerId)
          .single();
        if (profile) {
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
          if (profile.display_name) setInitials(profile.display_name.slice(0, 2).toUpperCase());
          if (profile.display_name) updateCachedDisplayName(profile.display_name);
          if (profile.avatar_url) updateCachedAvatarUrl(profile.avatar_url);
        }
      } catch {}
    })();
  }, [playerId]);

  const getInitials = (name: string | null): string => {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    const initials = words.map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 2);
  };

  const fetchProfiles = async (playerIds: string[]): Promise<Map<string, ProfileRow>> => {
    if (playerIds.length === 0) return new Map();
    
    const { data: profileRows } = await supabaseBrowser
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', playerIds);
    
    const profileMap = new Map<string, ProfileRow>();
    profileRows?.forEach((p: ProfileRow) => {
      profileMap.set(p.id, p);
    });
    return profileMap;
  };

  const fetchTodayData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: todayRows, error: todayError } = await supabaseBrowser
      .from('leaderboard_daily')
      .select('player_id, avg_accuracy')
      .eq('date', today)
      .order('avg_accuracy', { ascending: false })
      .order('total_xp', { ascending: false })
      .limit(50);
    
    if (todayError) throw todayError;
    
    const playerIds = (todayRows as TodayRow[] || []).map(r => r.player_id);
    const profileMap = await fetchProfiles(playerIds);
    
    const entries: LeaderboardEntry[] = (todayRows as TodayRow[] || []).map((row, idx) => {
      const profile = profileMap.get(row.player_id);
      return {
        rank: idx + 1,
        player_id: row.player_id,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        avg_accuracy: row.avg_accuracy,
        games_played: 1,
      };
    });
    
    setTodayData(entries);
  }, []);

  const fetchAlltimeData = useCallback(async () => {
    const { data: alltimeRows, error: alltimeError } = await supabaseBrowser
      .from('leaderboard_daily_alltime')
      .select('player_id, avg_accuracy, games_played')
      .order('avg_accuracy', { ascending: false })
      .order('total_xp', { ascending: false })
      .limit(50);
    
    if (alltimeError) throw alltimeError;
    
    const playerIds = (alltimeRows as AlltimeRow[] || []).map(r => r.player_id);
    const profileMap = await fetchProfiles(playerIds);
    
    const entries: LeaderboardEntry[] = (alltimeRows as AlltimeRow[] || []).map((row, idx) => {
      const profile = profileMap.get(row.player_id);
      return {
        rank: idx + 1,
        player_id: row.player_id,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        avg_accuracy: row.avg_accuracy,
        games_played: row.games_played,
      };
    });
    
    setAlltimeData(entries);
  }, []);

  const fetchLevelupData = useCallback(async () => {
    const { data: levelupRows, error: levelupError } = await supabaseBrowser
      .from('leaderboard_levelup')
      .select('player_id, current_level, best_accuracy')
      .order('current_level', { ascending: false })
      .order('best_accuracy', { ascending: false })
      .limit(50);
    
    if (levelupError) throw levelupError;
    
    const playerIds = (levelupRows as LevelupRow[] || []).map(r => r.player_id);
    const profileMap = await fetchProfiles(playerIds);
    
    const entries: LeaderboardEntry[] = (levelupRows as LevelupRow[] || []).map((row, idx) => {
      const profile = profileMap.get(row.player_id);
      return {
        rank: idx + 1,
        player_id: row.player_id,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        current_level: row.current_level,
        best_accuracy: row.best_accuracy,
      };
    });
    
    setLevelupData(entries);
  }, []);

  const fetchOverallData = useCallback(async () => {
    const { data: overallRows, error: overallError } = await supabaseBrowser
      .from('player_global_stats')
      .select('player_id, avg_accuracy, rounds_played, rounds_won, games_played')
      .order('avg_accuracy', { ascending: false })
      .order('total_xp', { ascending: false })
      .limit(50);

    if (overallError) throw overallError;

    const playerIds = (overallRows as OverallRow[] || []).map(r => r.player_id);
    const profileMap = await fetchProfiles(playerIds);

    const entries: LeaderboardEntry[] = (overallRows as OverallRow[] || []).map((row, idx) => {
      const profile = profileMap.get(row.player_id);
      return {
        rank: idx + 1,
        player_id: row.player_id,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        avg_accuracy: row.avg_accuracy,
        rounds_played: row.rounds_played,
        rounds_won: row.rounds_won,
        games_played: row.games_played,
      };
    });

    setOverallData(entries);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (activeTab === 'daily') {
        if (activeSubTab === 'today') {
          if (todayData === null) {
            await fetchTodayData();
          }
        } else {
          if (alltimeData === null) {
            await fetchAlltimeData();
          }
        }
      } else if (activeTab === 'overall') {
        if (overallData === null) {
          await fetchOverallData();
        }
      } else {
        if (levelupData === null) {
          await fetchLevelupData();
        }
      }
    } catch {
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, activeSubTab, todayData, alltimeData, levelupData, overallData, fetchTodayData, fetchAlltimeData, fetchLevelupData, fetchOverallData]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'overall' || tab === 'daily' || tab === 'levelup') {
      setActiveTab(tab as LeaderboardTab);
    }
    const subtab = searchParams.get('subtab');
    if (subtab === 'today' || subtab === 'alltime') {
      setActiveSubTab(subtab as DailySubTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync activeTab + activeSubTab to URL so refresh restores the same view
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== 'overall') params.set('tab', activeTab);
    if (activeTab === 'daily' && activeSubTab === 'alltime') params.set('subtab', activeSubTab);
    const qs = params.toString();
    router.replace(qs ? `/leaderboard?${qs}` : '/leaderboard', { scroll: false });
  }, [activeTab, activeSubTab, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetry = () => {
    if (activeTab === 'daily' && activeSubTab === 'today') {
      setTodayData(null);
    } else if (activeTab === 'daily' && activeSubTab === 'alltime') {
      setAlltimeData(null);
    } else if (activeTab === 'overall') {
      setOverallData(null);
    } else {
      setLevelupData(null);
    }
    fetchData();
  };

  const getCurrentData = (): LeaderboardEntry[] | null => {
    if (activeTab === 'daily') {
      return activeSubTab === 'today' ? todayData : alltimeData;
    }
    if (activeTab === 'overall') return overallData;
    return levelupData;
  };

  const fetchOwnRank = useCallback(async (): Promise<number | null> => {
    if (!playerId) return null;
    try {
      let rows: { player_id: string }[] = [];
      if (activeTab === 'overall') {
        const { data } = await supabaseBrowser
          .from('player_global_stats')
          .select('player_id')
          .order('avg_accuracy', { ascending: false })
          .order('total_xp', { ascending: false });
        rows = (data || []) as { player_id: string }[];
      } else if (activeTab === 'daily' && activeSubTab === 'today') {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabaseBrowser
          .from('leaderboard_daily')
          .select('player_id')
          .eq('date', today)
          .order('avg_accuracy', { ascending: false })
          .order('total_xp', { ascending: false });
        rows = (data || []) as { player_id: string }[];
      } else if (activeTab === 'daily' && activeSubTab === 'alltime') {
        const { data } = await supabaseBrowser
          .from('leaderboard_daily_alltime')
          .select('player_id')
          .order('avg_accuracy', { ascending: false })
          .order('total_xp', { ascending: false });
        rows = (data || []) as { player_id: string }[];
      } else {
        const { data } = await supabaseBrowser
          .from('leaderboard_levelup')
          .select('player_id, current_level, best_accuracy')
          .order('current_level', { ascending: false })
          .order('best_accuracy', { ascending: false });
        rows = (data || []) as { player_id: string }[];
      }
      const index = rows.findIndex((r) => r.player_id === playerId);
      return index === -1 ? null : index + 1;
    } catch {
      return null;
    }
  }, [playerId, activeTab, activeSubTab]);

  useEffect(() => {
    let cancelled = false;
    setOwnRank(null);
    if (!playerId) return;
    (async () => {
      const rank = await fetchOwnRank();
      if (!cancelled) setOwnRank(rank);
    })();
    return () => { cancelled = true; };
  }, [playerId, activeTab, activeSubTab, fetchOwnRank]);

  const getOrdinalSuffix = (n: number): string => {
    const category = new Intl.PluralRules(locale, { type: 'ordinal' }).select(n);
    const suffixKey = `rank_suffix_${category}` as 'rank_suffix_one' | 'rank_suffix_two' | 'rank_suffix_few' | 'rank_suffix_many' | 'rank_suffix_other';
    return (t(suffixKey) as string) ?? '';
  };

  const getSummaryTabLabel = (): string => {
    if (activeTab === 'daily') {
      return `${t('daily')} ${t(activeSubTab === 'today' ? 'today' : 'all_time')}`;
    }
    if (activeTab === 'levelup') return t('level_up');
    return t('overall');
  };

  const handleSummaryClick = () => {
    const row = playerId ? rowRefs.current.get(playerId) : undefined;
    if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return '—';
    return num.toLocaleString();
  };

  function AccuracyValue({ acc }: { acc: number | undefined }): ReactNode {
    if (acc === undefined || acc === null) return '—';
    return (
      <>
        {Math.round(acc)}
        <AccuracySuffix />
      </>
    );
  }

  const currentData = getCurrentData();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  rowRefs.current = useMemo(() => new Map<string, HTMLTableRowElement>(), [currentData]);

  const podiumSlots = useMemo(() => {
    const data = currentData ?? [];
    if (data.length < 3) return [];
    return [
      { entry: data[1], place: 2, className: styles.podiumSilver, height: '85%' },
      { entry: data[0], place: 1, className: styles.podiumGold, height: '100%' },
      { entry: data[2], place: 3, className: styles.podiumBronze, height: '85%' },
    ];
  }, [currentData]);

  const renderRank = (rank: number) => {
    if (rank === 1) return <span className={styles.medalGold}>🥇</span>;
    if (rank === 2) return <span className={styles.medalSilver}>🥈</span>;
    if (rank === 3) return <span className={styles.medalBronze}>🥉</span>;
    return <span className={styles.rankNumber}>{rank}</span>;
  };

  const renderPlayerCell = (entry: LeaderboardEntry) => {
    let subtitle: string;
    if (activeTab === 'overall') {
      const roundsWon = entry.rounds_won ?? 0;
      const gamesPlayed = entry.games_played ?? 0;
      subtitle = `${t('rounds_won', { n: roundsWon })} · ${t('games_played_subtitle', { n: gamesPlayed })}`;
    } else if (activeTab === 'daily') {
      const gamesPlayed = entry.games_played ?? 1;
      subtitle = t('games_played_subtitle', { n: gamesPlayed });
    } else if (activeTab === 'levelup') {
      subtitle = t('level_subtitle', { n: entry.current_level ?? 0 });
    } else {
      subtitle = '';
    }

    return (
      <div className={styles.playerCell}>
        {entry.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar_url}
            alt=""
            className={styles.avatar}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className={styles.avatarInitials}>
            {getInitials(entry.display_name)}
          </div>
        )}
        <div className={styles.playerInfo}>
          <span className={styles.playerName}>{entry.display_name ?? t('unknown_player')}</span>
          <span className={styles.playerSubtitle}>{subtitle}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container} style={{ paddingTop: 64 }}>
      <TopBar
        accuracy={accuracy}
        xp={xp}
        avatarUrl={avatarUrl}
        initials={initials}
        onAvatarClick={() => setShowNavModal(true)}
      />

      {/* Header */}
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backBtn}>
          <span className={styles.backArrow}>←</span>
          <span>{t('back')}</span>
        </button>
        <h1 className={styles.title}>{t('title')}</h1>
        <div className={styles.headerSpacer}></div>
      </div>

      {/* Main Tabs */}
      <div className={styles.tabRow}>
        <button
          onClick={() => setActiveTab('overall')}
          className={`${styles.tab} ${activeTab === 'overall' ? styles.tabActive : ''}`}
        >
          {t('overall')}
        </button>
        <button
          onClick={() => setActiveTab('daily')}
          className={`${styles.tab} ${activeTab === 'daily' ? styles.tabActive : ''}`}
        >
          {t('daily')}
        </button>
        <button
          onClick={() => setActiveTab('levelup')}
          className={`${styles.tab} ${activeTab === 'levelup' ? styles.tabActive : ''}`}
        >
          {t('level_up')}
        </button>
      </div>

      {/* Sub Tabs (Daily only) */}
      {activeTab === 'daily' && (
        <div className={styles.subTabRow}>
          <button
            onClick={() => setActiveSubTab('today')}
            className={`${styles.subTab} ${activeSubTab === 'today' ? styles.subTabActive : ''}`}
          >
            {t('today')}
          </button>
          <button
            onClick={() => setActiveSubTab('alltime')}
            className={`${styles.subTab} ${activeSubTab === 'alltime' ? styles.subTabActive : ''}`}
          >
            {t('all_time')}
          </button>
        </div>
      )}

      {/* Summary */}
      {!loading && !error && ownRank !== null && ownRank > 0 && (
        <div
          className={styles.summaryLine}
          onClick={handleSummaryClick}
          role="button"
          tabIndex={0}
        >
          {t('summary_line', { rank: ownRank, suffix: getOrdinalSuffix(ownRank), tab: getSummaryTabLabel() })}
        </div>
      )}

      {/* Podium */}
      {!loading && !error && podiumSlots.length === 3 && (
        <div className={styles.podium}>
          {podiumSlots.map((slot) => (
            <div
              key={slot.entry.player_id}
              className={`${styles.podiumItem} ${slot.className}`}
              style={{ height: slot.height }}
            >
              <span className={styles.podiumRank}>{slot.place}</span>
              {slot.entry.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slot.entry.avatar_url}
                  alt=""
                  className={styles.podiumAvatar}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className={styles.podiumAvatarInitials}>
                  {getInitials(slot.entry.display_name)}
                </div>
              )}
              <span className={styles.podiumName}>{slot.entry.display_name ?? t('unknown_player')}</span>
              <span className={styles.podiumValue}>
                {activeTab === 'levelup'
                  ? (slot.entry.current_level ?? '—')
                  : <AccuracyValue acc={slot.entry.avg_accuracy} />}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {loading && (
          <div className={styles.spinnerContainer}>
            <div className={styles.spinner}></div>
          </div>
        )}

        {error && !loading && (
          <div className={styles.errorState}>
            <p>{t('err_load_failed')}</p>
            <button onClick={handleRetry} className={styles.retryBtn}>
              {t('retry')}
            </button>
          </div>
        )}

        {!loading && !error && currentData && currentData.length === 0 && (
          <div className={styles.emptyState}>
            <p>{t('no_results_today')}</p>
          </div>
        )}

        {!loading && !error && currentData && currentData.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>#</th>
                  <th className={styles.th}>{t('col_player')}</th>
                  {activeTab === 'daily' && activeSubTab === 'today' && (
                    <>
                      <th className={styles.th}>{t('accuracy_pct')}</th>
                      <th className={styles.th}>{t('col_games')}</th>
                    </>
                  )}
                  {activeTab === 'daily' && activeSubTab === 'alltime' && (
                    <>
                      <th className={styles.th}>{t('accuracy_pct')}</th>
                      <th className={`${styles.th} ${styles.thGames}`}>{t('col_games')}</th>
                    </>
                  )}
                  {activeTab === 'levelup' && (
                    <>
                      <th className={styles.th}>{t('accuracy_pct')}</th>
                      <th className={styles.th}>{t('col_level')}</th>
                    </>
                  )}
                  {activeTab === 'overall' && (
                    <>
                      <th className={styles.th}>{t('accuracy_pct')}</th>
                      <th className={`${styles.th} ${styles.thGames}`}>{t('col_games')}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {currentData.map((entry) => {
                  const isCurrentPlayer = playerId === entry.player_id;
                  return (
                    <tr
                      key={entry.player_id}
                      ref={(el) => { if (el) rowRefs.current.set(entry.player_id, el); }}
                      className={`${styles.row} ${isCurrentPlayer ? styles.rowHighlight : ''}`}
                    >
                      <td className={styles.rankCell}>{renderRank(entry.rank)}</td>
                      <td className={styles.playerCell}>{renderPlayerCell(entry)}</td>
                      
                      {activeTab === 'daily' && activeSubTab === 'today' && (
                        <>
                          <td className={styles.accuracyCell}>
                            <span className={styles.accuracyValue}><AccuracyValue acc={entry.avg_accuracy} /></span>
                          </td>
                          <td className={`${styles.gamesCell} ${styles.gamesCellDesktop}`}>
                            {formatNumber(entry.games_played ?? 1)}
                          </td>
                        </>
                      )}
                      
                      {activeTab === 'daily' && activeSubTab === 'alltime' && (
                        <>
                          <td className={styles.accuracyCell}>
                            <span className={styles.accuracyValue}><AccuracyValue acc={entry.avg_accuracy} /></span>
                          </td>
                          <td className={`${styles.gamesCell} ${styles.gamesCellDesktop}`}>
                            {formatNumber(entry.games_played)}
                          </td>
                        </>
                      )}
                      
                      {activeTab === 'levelup' && (
                        <>
                          <td className={styles.accuracyCell}>
                            <AccuracyValue acc={entry.best_accuracy} />
                          </td>
                          <td className={styles.levelCell}>
                            <span className={styles.levelValue}>{t('lvl_prefix', { n: entry.current_level ?? 0 })}</span>
                          </td>
                        </>
                      )}
                      {activeTab === 'overall' && (
                        <>
                          <td className={styles.accuracyCell}>
                            <span className={styles.accuracyValue}><AccuracyValue acc={entry.avg_accuracy} /></span>
                          </td>
                          <td className={`${styles.gamesCell} ${styles.gamesCellDesktop}`}>
                            {formatNumber(entry.games_played)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={avatarUrl}
        initials={initials}
        displayName={displayName ?? initials}
      />
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--gh-text-primary)', padding: '2rem', textAlign: 'center' }}>Loading…</div>}>
      <LeaderboardPageInner />
    </Suspense>
  );
}
