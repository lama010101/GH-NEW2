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
import PlayerAvatar from '@/components/compete/PlayerAvatar';
import { getAccuracyColor } from '@/core/accuracyColor';
import { partitionPodium } from './podium';
import styles from './leaderboard.module.css';

type LeaderboardTab = 'daily' | 'journey' | 'overall';
type DailySubTab = 'today' | 'alltime';
type SortOption = 'accuracy' | 'xp' | 'stage';
type MetricKind = 'accuracy' | 'xp' | 'stage';

const TAB_SORT_OPTIONS: Record<LeaderboardTab, readonly SortOption[]> = {
  overall: ['accuracy', 'xp'],
  daily: ['accuracy', 'xp'],
  journey: ['stage', 'accuracy'],
};
const TAB_DEFAULT_SORT: Record<LeaderboardTab, SortOption> = {
  overall: 'accuracy',
  daily: 'accuracy',
  journey: 'stage',
};

// `levelup` is kept as an accepted URL alias for `journey`.
const resolveTabParam = (raw: string | null): LeaderboardTab => {
  if (raw === 'daily' || raw === 'journey' || raw === 'overall') return raw;
  if (raw === 'levelup') return 'journey';
  return 'overall';
};
const resolveSubTabParam = (raw: string | null): DailySubTab =>
  raw === 'alltime' ? 'alltime' : 'today';
const resolveSortParam = (raw: string | null, tab: LeaderboardTab): SortOption =>
  raw && TAB_SORT_OPTIONS[tab].includes(raw as SortOption)
    ? (raw as SortOption)
    : TAB_DEFAULT_SORT[tab];

type LeaderboardEntry = {
  rank: number;
  player_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_ai: boolean;
  avg_accuracy?: number;
  total_xp?: number;
  games_played?: number;
  rounds_played?: number;
  rounds_won?: number;
  highest_stage?: number;
  stages_completed?: number;
};

type LeaderboardResponse = {
  tab: string;
  sort: string;
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

  const [activeTab, setActiveTab] = useState<LeaderboardTab>(() => resolveTabParam(searchParams.get('tab')));
  const [activeSubTab, setActiveSubTab] = useState<DailySubTab>(() => resolveSubTabParam(searchParams.get('subtab')));
  const [activeSort, setActiveSort] = useState<SortOption>(() => resolveSortParam(searchParams.get('sort'), resolveTabParam(searchParams.get('tab'))));

  const [currentData, setCurrentData] = useState<LeaderboardEntry[] | null>(null);
  const [ownEntry, setOwnEntry] = useState<LeaderboardEntry | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accuracy, setAccuracy] = useState('--');
  const [xp, setXp] = useState('--');
  const [showNavModal, setShowNavModal] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const locale = useLocale();
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastScrollY = useRef(0);
  const didAutoCenter = useRef(false);

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

  // Sync activeTab + activeSubTab + activeSort to URL so refresh restores the
  // same view. `sort` is omitted when it equals the tab's default. Preserves
  // any existing query params (e.g. filter chips).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTab !== 'overall') params.set('tab', activeTab);
    else params.delete('tab');
    if (activeTab === 'daily' && activeSubTab === 'alltime') params.set('subtab', activeSubTab);
    else params.delete('subtab');
    if (activeSort !== TAB_DEFAULT_SORT[activeTab]) params.set('sort', activeSort);
    else params.delete('sort');
    const qs = params.toString();
    router.replace(qs ? `/leaderboard?${qs}` : '/leaderboard', { scroll: false });
  }, [activeTab, activeSubTab, activeSort, router, searchParams]);

  const selectTab = (tab: LeaderboardTab) => {
    setActiveTab(tab);
    if (!TAB_SORT_OPTIONS[tab].includes(activeSort)) {
      setActiveSort(TAB_DEFAULT_SORT[tab]);
    }
  };

  const getApiTab = useCallback((): string => {
    if (activeTab === 'daily') {
      return activeSubTab === 'today' ? 'daily_today' : 'daily_alltime';
    }
    if (activeTab === 'journey') return 'journey';
    return 'overall';
  }, [activeTab, activeSubTab]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const apiTab = getApiTab();
      if (apiTab !== 'overall') params.set('tab', apiTab);
      params.set('sort', activeSort);
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
      setCurrentData(
        data.rows.map((e, i) => {
          const rank = Number(e.rank);
          return { ...e, rank: Number.isNaN(rank) ? i + 1 : rank };
        })
      );
      setOwnEntry(data.ownEntry);
    } catch {
      setError(t('err_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [getApiTab, activeSort, filter, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Centre the signed-in user's own row (podium card or list row) once on the
  // first loaded dataset — never again on filter/sort/tab clicks.
  useEffect(() => {
    if (didAutoCenter.current || !playerId || loading || error || !currentData || currentData.length === 0) return;
    didAutoCenter.current = true;
    const raf = requestAnimationFrame(() => {
      const row = rowRefs.current.get(playerId);
      if (row) row.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(raf);
  }, [playerId, currentData, loading, error]);

  // Show the back-to-top button only while the user is scrolling up
  // (and has scrolled far enough down for it to be useful).
  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setShowScrollTop(y < lastScrollY.current && y > 240);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    if (activeTab === 'journey') return t('journey');
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
  rowRefs.current = useMemo(() => new Map<string, HTMLDivElement>(), [currentData]);

  const podiumSlots = useMemo(() => {
    const { podium } = partitionPodium(currentData ?? []);
    const byPosition = [
      { position: 1, column: 1, className: styles.podiumSilver, rankClassName: styles.podiumRankSilver, height: '88%' },
      { position: 0, column: 2, className: styles.podiumGold, rankClassName: styles.podiumRankGold, height: '100%' },
      { position: 2, column: 3, className: styles.podiumBronze, rankClassName: styles.podiumRankBronze, height: '78%' },
    ];
    return byPosition
      .filter((slot) => slot.position < podium.length)
      .map((slot) => ({
        entry: podium[slot.position],
        place: slot.position + 1,
        column: slot.column,
        className: slot.className,
        rankClassName: slot.rankClassName,
        height: slot.height,
      }));
  }, [currentData]);

  const listRows = useMemo(
    () => partitionPodium(currentData ?? []).list,
    [currentData]
  );

  const getRowSubtitle = (entry: LeaderboardEntry): string => {
    if (activeTab === 'overall') {
      return `${t('rounds_won', { n: entry.rounds_won ?? 0 })} · ${t('games_played_subtitle', { n: entry.games_played ?? 0 })}`;
    }
    if (activeTab === 'daily') {
      return t('games_played_subtitle', { n: entry.games_played ?? 1 });
    }
    return t('journey_stages_completed', { n: entry.stages_completed ?? 0 });
  };

  const primaryMetric: MetricKind =
    activeTab === 'journey'
      ? activeSort === 'stage' ? 'stage' : 'accuracy'
      : activeSort === 'xp' ? 'xp' : 'accuracy';
  const secondaryMetric: MetricKind =
    activeTab === 'journey'
      ? primaryMetric === 'stage' ? 'accuracy' : 'stage'
      : primaryMetric === 'xp' ? 'accuracy' : 'xp';

  const renderMetric = (entry: LeaderboardEntry, metric: MetricKind): ReactNode => {
    if (metric === 'accuracy') return <AccuracyValue acc={entry.avg_accuracy} />;
    if (metric === 'xp') return <span className={styles.xpValue}>{t('xp_amount', { n: entry.total_xp ?? 0 })}</span>;
    return (entry.highest_stage ?? 0) > 0
      ? t('journey_stage', { n: entry.highest_stage })
      : t('journey_no_stage');
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
          onClick={() => selectTab('overall')}
          className={`${styles.tab} ${activeTab === 'overall' ? styles.tabActive : ''}`}
        >
          {t('overall')}
        </button>
        <button
          onClick={() => selectTab('daily')}
          className={`${styles.tab} ${activeTab === 'daily' ? styles.tabActive : ''}`}
        >
          {t('daily')}
        </button>
        <button
          onClick={() => selectTab('journey')}
          className={`${styles.tab} ${activeTab === 'journey' ? styles.tabActive : ''}`}
        >
          {t('journey')}
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

      {/* Filter controls on one line: identity group (Humans/AI multi-select),
          friends toggle, and metric sort — three visually distinct groups */}
      <div className={styles.filterRow}>
        <div className={styles.identityGroup}>
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
        </div>
        <button
          type="button"
          onClick={toggleFriends}
          className={`${styles.friendsToggle} ${filter.friends ? styles.friendsToggleActive : ''}`}
          aria-pressed={filter.friends}
        >
          {t('filter_friends')}
        </button>
        <div
          className={styles.sortToggle}
          role="group"
          aria-hidden={TAB_SORT_OPTIONS[activeTab].length === 1}
        >
          {TAB_SORT_OPTIONS[activeTab].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setActiveSort(opt)}
              className={`${styles.sortSegment} ${activeSort === opt ? styles.sortSegmentActive : ''}`}
              aria-pressed={activeSort === opt}
              aria-label={t(`sort_${opt}`)}
              title={t(`sort_${opt}`)}
            >
              {opt === 'accuracy' ? '%' : opt === 'xp' ? 'XP' : t('sort_stage')}
            </button>
          ))}
        </div>
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

      {/* Content — keep the rendered list mounted while refetching so the
          document height (and scroll position) doesn't collapse on every
          filter/sort/tab click. Spinner shows only when there's no data. */}
      <div className={styles.content} aria-busy={loading}>
        {loading && !currentData?.length && (
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
            <p>{t(activeTab === 'journey' ? 'no_results_journey' : 'no_results_today')}</p>
          </div>
        )}

        {currentData && currentData.length > 0 && (
          <>
            {podiumSlots.length > 0 && (
              <div className={styles.card}>
                <div className={styles.podium}>
                  {podiumSlots.map((slot) => (
                    <div
                      key={slot.entry.player_id}
                      ref={(el) => { if (el) rowRefs.current.set(slot.entry.player_id, el); }}
                      className={`${styles.podiumItem} ${slot.className}`}
                      style={{ height: slot.height, gridColumn: slot.column }}
                    >
                      <span className={`${styles.podiumRank} ${slot.rankClassName}`}>{slot.entry.rank}</span>
                      {slot.place === 1 && <span className={styles.crown}>👑</span>}
                      <PlayerAvatar
                        avatarUrl={slot.entry.avatar_url}
                        displayName={slot.entry.display_name ?? t('unknown_player')}
                        playerId={slot.entry.player_id}
                        size={slot.place === 1 ? 64 : 48}
                        initials={slot.entry.is_ai ? 'AI' : getInitials(slot.entry.display_name)}
                        isMe={playerId === slot.entry.player_id}
                      />
                      <span className={styles.podiumName}>{slot.entry.display_name ?? t('unknown_player')}</span>
                      <span className={styles.podiumScore}>{renderMetric(slot.entry, primaryMetric)}</span>
                      <span className={styles.podiumAcc}>{renderMetric(slot.entry, secondaryMetric)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`${styles.card} ${styles.list}`}>
              {listRows.length === 0 ? (
                <div className={styles.listEmpty}>{t('no_more_players')}</div>
              ) : (
                listRows.map((entry) => {
                  const isCurrentPlayer = playerId === entry.player_id;
                  const name = entry.display_name ?? t('unknown_player');
                  return (
                    <div
                      key={entry.player_id}
                      ref={(el) => { if (el) rowRefs.current.set(entry.player_id, el); }}
                      className={`${styles.listRow} ${isCurrentPlayer ? styles.listRowMe : ''}`}
                    >
                      <span className={styles.listRank}>{entry.rank}</span>
                      <PlayerAvatar
                        avatarUrl={entry.avatar_url}
                        displayName={name}
                        playerId={entry.player_id}
                        size={38}
                        initials={entry.is_ai ? 'AI' : getInitials(entry.display_name)}
                        isMe={isCurrentPlayer}
                      />
                      <div className={styles.listNameCol}>
                        <span className={styles.listName}>
                          {name}
                          {entry.is_ai ? <span className={styles.aiBadge}>{t('filter_ai')}</span> : null}
                        </span>
                        <span className={styles.listMeta}>{getRowSubtitle(entry)}</span>
                      </div>
                      <div className={styles.listScoreCol}>
                        <span className={styles.listScore}>{renderMetric(entry, primaryMetric)}</span>
                        <span className={styles.listAcc}>{renderMetric(entry, secondaryMetric)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {showScrollTop && (
        <button
          type="button"
          className={styles.scrollTopBtn}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={t('back_to_top')}
          title={t('back_to_top')}
        >
          ↑
        </button>
      )}

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
  const t = useTranslations();
  return (
    <Suspense fallback={<div style={{ color: 'var(--gh-text-primary)', padding: '2rem', textAlign: 'center' }}>{t('common.loading_ellipsis')}</div>}>
      <LeaderboardPageInner />
    </Suspense>
  );
}
