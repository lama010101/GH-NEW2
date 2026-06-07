'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useIdentity } from '@/hooks/useIdentity';
import { supabaseBrowser } from '@/core/supabaseBrowser';
import styles from './leaderboard.module.css';

type LeaderboardTab = 'daily' | 'levelup' | 'overall';
type DailySubTab = 'today' | 'alltime';

type TodayRow = {
  player_id: string;
  avg_accuracy: number;
  total_xp: number;
  completed_at: string;
};

type AlltimeRow = {
  player_id: string;
  avg_accuracy: number;
  total_xp: number;
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
  total_xp: number;
  rounds_played: number;
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
  total_xp?: number;
  games_played?: number;
  rounds_played?: number;
  current_level?: number;
  best_accuracy?: number;
};

function LeaderboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playerId } = useIdentity();
  
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('daily');
  const [activeSubTab, setActiveSubTab] = useState<DailySubTab>('today');
  
  const [todayData, setTodayData] = useState<LeaderboardEntry[] | null>(null);
  const [alltimeData, setAlltimeData] = useState<LeaderboardEntry[] | null>(null);
  const [levelupData, setLevelupData] = useState<LeaderboardEntry[] | null>(null);
  const [overallData, setOverallData] = useState<LeaderboardEntry[] | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      .select('player_id, avg_accuracy, total_xp, completed_at')
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
        total_xp: row.total_xp,
      };
    });
    
    setTodayData(entries);
  }, []);

  const fetchAlltimeData = useCallback(async () => {
    const { data: alltimeRows, error: alltimeError } = await supabaseBrowser
      .from('leaderboard_daily_alltime')
      .select('player_id, avg_accuracy, total_xp, games_played')
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
        total_xp: row.total_xp,
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
      .select('player_id, avg_accuracy, total_xp, rounds_played, games_played')
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
        total_xp: row.total_xp,
        rounds_played: row.rounds_played,
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
  }, []);

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

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return '—';
    return num.toLocaleString();
  };

  const formatAccuracy = (acc: number | undefined): string => {
    if (acc === undefined || acc === null) return '—';
    return Math.round(acc) + '%';
  };

  const currentData = getCurrentData();

  const renderRank = (rank: number) => {
    if (rank === 1) return <span className={styles.medalGold}>🥇</span>;
    if (rank === 2) return <span className={styles.medalSilver}>🥈</span>;
    if (rank === 3) return <span className={styles.medalBronze}>🥉</span>;
    return <span className={styles.rankNumber}>{rank}</span>;
  };

  const renderPlayerCell = (entry: LeaderboardEntry) => {
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
        <span className={styles.playerName}>{entry.display_name ?? 'Unknown'}</span>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backBtn}>
          <span className={styles.backArrow}>←</span>
          <span>Back</span>
        </button>
        <h1 className={styles.title}>LEADERBOARD</h1>
        <div className={styles.headerSpacer}></div>
      </div>

      {/* Main Tabs */}
      <div className={styles.tabRow}>
        <button
          onClick={() => setActiveTab('daily')}
          className={`${styles.tab} ${activeTab === 'daily' ? styles.tabActive : ''}`}
        >
          Daily
        </button>
        <button
          onClick={() => setActiveTab('levelup')}
          className={`${styles.tab} ${activeTab === 'levelup' ? styles.tabActive : ''}`}
        >
          Level Up
        </button>
        <button
          onClick={() => setActiveTab('overall')}
          className={`${styles.tab} ${activeTab === 'overall' ? styles.tabActive : ''}`}
        >
          Overall
        </button>
      </div>

      {/* Sub Tabs (Daily only) */}
      {activeTab === 'daily' && (
        <div className={styles.subTabRow}>
          <button
            onClick={() => setActiveSubTab('today')}
            className={`${styles.subTab} ${activeSubTab === 'today' ? styles.subTabActive : ''}`}
          >
            Today
          </button>
          <button
            onClick={() => setActiveSubTab('alltime')}
            className={`${styles.subTab} ${activeSubTab === 'alltime' ? styles.subTabActive : ''}`}
          >
            All-time
          </button>
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
            <p>{error}</p>
            <button onClick={handleRetry} className={styles.retryBtn}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && currentData && currentData.length === 0 && (
          <div className={styles.emptyState}>
            <p>No results yet for today.</p>
          </div>
        )}

        {!loading && !error && currentData && currentData.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>#</th>
                  <th className={styles.th}>Player</th>
                  {activeTab === 'daily' && activeSubTab === 'today' && (
                    <>
                      <th className={styles.th}>Accuracy %</th>
                      <th className={styles.th}>XP Today</th>
                    </>
                  )}
                  {activeTab === 'daily' && activeSubTab === 'alltime' && (
                    <>
                      <th className={styles.th}>Avg Accuracy</th>
                      <th className={styles.th}>Total XP</th>
                      <th className={`${styles.th} ${styles.thGames}`}>Games</th>
                    </>
                  )}
                  {activeTab === 'levelup' && (
                    <>
                      <th className={styles.th}>Level</th>
                      <th className={styles.th}>Accuracy at Level</th>
                    </>
                  )}
                  {activeTab === 'overall' && (
                    <>
                      <th className={styles.th}>Avg Accuracy</th>
                      <th className={styles.th}>Total XP</th>
                      <th className={`${styles.th} ${styles.thGames}`}>Games</th>
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
                      className={`${styles.row} ${isCurrentPlayer ? styles.rowHighlight : ''}`}
                    >
                      <td className={styles.rankCell}>{renderRank(entry.rank)}</td>
                      <td className={styles.playerCell}>{renderPlayerCell(entry)}</td>
                      
                      {activeTab === 'daily' && activeSubTab === 'today' && (
                        <>
                          <td className={styles.accuracyCell}>
                            <span className={styles.accuracyValue}>{formatAccuracy(entry.avg_accuracy)}</span>
                          </td>
                          <td className={styles.xpCell}>
                            {formatNumber(entry.total_xp)} XP
                          </td>
                        </>
                      )}
                      
                      {activeTab === 'daily' && activeSubTab === 'alltime' && (
                        <>
                          <td className={styles.accuracyCell}>
                            <span className={styles.accuracyValue}>{formatAccuracy(entry.avg_accuracy)}</span>
                          </td>
                          <td className={styles.xpCell}>
                            {formatNumber(entry.total_xp)} XP
                          </td>
                          <td className={`${styles.gamesCell} ${styles.gamesCellDesktop}`}>
                            {formatNumber(entry.games_played)}
                          </td>
                        </>
                      )}
                      
                      {activeTab === 'levelup' && (
                        <>
                          <td className={styles.levelCell}>
                            <span className={styles.levelValue}>Lvl {entry.current_level}</span>
                          </td>
                          <td className={styles.accuracyCell}>
                            {formatAccuracy(entry.best_accuracy)}
                          </td>
                        </>
                      )}
                      {activeTab === 'overall' && (
                        <>
                          <td className={styles.accuracyCell}>
                            <span className={styles.accuracyValue}>{formatAccuracy(entry.avg_accuracy)}</span>
                          </td>
                          <td className={styles.xpCell}>
                            {formatNumber(entry.total_xp)} XP
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
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div style={{ color: '#fff', padding: '2rem', textAlign: 'center' }}>Loading…</div>}>
      <LeaderboardPageInner />
    </Suspense>
  );
}
