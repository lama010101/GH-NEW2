'use client';

import { Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useIdentity } from '@/hooks/useIdentity';
import { usePlayerFilter } from '@/hooks/usePlayerFilter';
import { supabaseBrowser } from '@/core/supabaseBrowser';
import TopBar from '@/components/layout/TopBar';
import { NavModal } from '@/components/NavModal';
import AccuracySuffix from '@/components/AccuracySuffix';
import { getAccuracyColor } from '@/core/accuracyColor';
import styles from './leaderboard.module.css';

type LeaderboardTab = 'daily' | 'levelup' | 'overall';
type DailySubTab = 'today' | 'alltime';

type LeaderboardEntry = {
  rank: number;
  player_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_ai: boolean;
  avg_accuracy?: number;
  games_played?: number;
  rounds_played?: number;
  rounds_won?: number;
  current_level?: number;
  best_accuracy?: number;
};

type LeaderboardResponse = {
  tab: string;
  filter: string;
  humans: boolean;
  ai: boolean;
  friends: boolean;
  rows: LeaderboardEntry[];
  ownEntry: LeaderboardEntry | null;
};

function LeaderboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playerId, displayName, avatarUrl } = useIdentity();
  const { filter, toggleHumans, toggleAi, toggleFriends } = usePlayerFilter();
  const t = useTranslations('leaderboard');

  const [activeTab, setActiveTab] = useState<LeaderboardTab>('overall');
  const [activeSubTab, setActiveSubTab] = useState<DailySubTab>('today');

  const [currentData, setCurrentData] = useState<LeaderboardEntry[] | null>(null);
  const [ownEntry, setOwnEntry] = useState<LeaderboardEntry | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accuracy, setAccuracy] = useState('--');
  const [xp, setXp] = useState('--');
  const [showNavModal, setShowNavModal] = useState(false);
  const locale = useLocale();
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const initials = useMemo(() => {
    if (!displayName) return 'PL';
    return displayName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }, [displayName]);

  useEffect(() => {
    if (!playerId) {
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
    })();
  }, [playerId]);

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

  // Sync activeTab + activeSubTab to URL so refresh restores the same view.
  // Preserves any existing query params (e.g. filter chips).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTab !== 'overall') params.set('tab', activeTab);
    else params.delete('tab');
    if (activeTab === 'daily' && activeSubTab === 'alltime') params.set('subtab', activeSubTab);
    else params.delete('subtab');
    const qs = params.toString();
    router.replace(qs ? `/leaderboard?${qs}` : '/leaderboard', { scroll: false });
  }, [activeTab, activeSubTab, router, searchParams]);

  const getApiTab = useCallback((): string => {
    if (activeTab === 'daily') {
      return activeSubTab === 'today' ? 'daily_today' : 'daily_alltime';
    }
    if (activeTab === 'levelup') return 'levelup';
    return 'overall';
  }, [activeTab, activeSubTab]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const apiTab = getApiTab();
      if (apiTab !== 'overall') params.set('tab', apiTab);
      if (filter.humans) params.set('humans', 'true');
      if (filter.ai) params.set('ai', 'true');
      if (filter.friends) params.set('friends', 'true');
      const qs = params.toString();
      const res = await fetch(`/api/leaderboard${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load leaderboard');
      }
      const data = (await res.json()) as LeaderboardResponse;
      setCurrentData(data.rows);
      setOwnEntry(data.ownEntry);
    } catch {
      setError(t('err_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [getApiTab, filter, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetry = () => {
    fetchData();
  };

  const getInitials = (name: string | null): string => {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    const initials = words.map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 2);
  };

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

  const ownRow = useMemo(() => {
    if (!playerId) return null;
    return currentData?.find((r) => r.player_id === playerId) ?? ownEntry ?? null;
  }, [playerId, currentData, ownEntry]);

  const ownRank = ownRow?.rank ?? null;

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
      <span style={{ color: getAccuracyColor(acc) }}>
        {Math.round(acc)}
        <AccuracySuffix />
      </span>
    );
  }

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

    const name = entry.display_name ?? t('unknown_player');
    const avatarFallback = entry.is_ai ? 'AI' : getInitials(entry.display_name);

    return (
      <div className={styles.playerCell}>
        {entry.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.avatar_url}
            alt=""
            className={`${styles.avatar} ${entry.is_ai ? styles.avatarAi : ''}`}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className={`${styles.avatarInitials} ${entry.is_ai ? styles.avatarAi : ''}`}>
            {avatarFallback}
          </div>
        )}
        <div className={styles.playerInfo}>
          <span className={styles.playerName}>{name}{entry.is_ai ? <span className={styles.aiBadge}>AI</span> : null}</span>
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

      {/* Filter chips */}
      <div className={styles.filterRow}>
        <button
          type="button"
          onClick={toggleHumans}
          className={`${styles.filterChip} ${filter.humans ? styles.filterChipActive : ''}`}
          aria-pressed={filter.humans}
        >
          {t('filter_humans')}
        </button>
        <button
          type="button"
          onClick={toggleAi}
          className={`${styles.filterChip} ${filter.ai ? styles.filterChipActive : ''}`}
          aria-pressed={filter.ai}
        >
          {t('filter_ai')}
        </button>
        <button
          type="button"
          onClick={toggleFriends}
          className={`${styles.friendsToggle} ${filter.friends ? styles.friendsToggleActive : ''}`}
          aria-pressed={filter.friends}
        >
          {t('filter_friends')}
        </button>
      </div>

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
                  className={`${styles.podiumAvatar} ${slot.entry.is_ai ? styles.avatarAi : ''}`}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className={`${styles.podiumAvatarInitials} ${slot.entry.is_ai ? styles.avatarAi : ''}`}>
                  {slot.entry.is_ai ? 'AI' : getInitials(slot.entry.display_name)}
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
