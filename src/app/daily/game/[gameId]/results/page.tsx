"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import type { CompeteSessionSnapshot } from "@/core/types";
import { useIdentity } from "@/hooks/useIdentity";
import { AllRoundResult } from "@/core/competeTypes";
import SessionComplete from "@/components/compete/SessionComplete";
import TopBar from "@/components/layout/TopBar";
import { NavModal } from "@/components/NavModal";
import RankCard from "@/components/RankCard";
import { useRankOpen } from "@/hooks/useRankOpen";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import pageStyles from '@/app/practice/[gameId]/page.module.css';

export default function DailyResultsPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = typeof params?.gameId === "string" ? params.gameId : "";

  const t = useTranslations('game');

  const [rankOpen, toggleRankOpen] = useRankOpen();

  const [snapshot, setSnapshot] = useState<CompeteSessionSnapshot | null>(null);
  const [allRoundResults, setAllRoundResults] = useState<AllRoundResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNavModal, setShowNavModal] = useState(false);
  const [topbarAccuracy, setTopbarAccuracy] = useState("--");
  const [topbarXp, setTopbarXp] = useState("--");
  const [topbarAvatarUrl, setTopbarAvatarUrl] = useState<string | null>(null);
  const [topbarInitials, setTopbarInitials] = useState("PL");

  const router = useRouter();
  const { playerId, displayName, isLoading: identityLoading, error: identityError } = useIdentity();

  // Fetch snapshot
  useEffect(() => {
    if (!gameId || !playerId) return;
    let cancelled = false;

    ;(async () => {
      try {
        const response = await fetch(`/api/compete/${gameId}?playerId=${playerId}`, { cache: "no-store" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? t('failed_load_session'));
        }
        const data = await response.json();
        if (cancelled) return;
        setSnapshot(data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('failed_load_session'));
      }
    })();

    return () => { cancelled = true };
  }, [gameId, playerId, t]);

  // Fetch all round results
  useEffect(() => {
    if (!gameId || !playerId || !snapshot || snapshot.status !== "SESSION_COMPLETE") return;
    let cancelled = false;

    ;(async () => {
      try {
        const response = await fetch(`/api/compete/${gameId}/all-results?playerId=${playerId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setAllRoundResults(data.results ?? []);
      } catch (err) {
        console.error("[DailyResultsPage] Failed to fetch all round results:", err);
      }
    })();

    return () => { cancelled = true };
  }, [gameId, playerId, snapshot]);

  // TopBar: fetch viewer stats + profile
  useEffect(() => {
    if (!playerId) return;
    (async () => {
      try {
        const { data: stats } = await supabaseBrowser
          .from('player_global_stats')
          .select('avg_accuracy,total_xp')
          .eq('player_id', playerId)
          .single();
        if (stats) {
          setTopbarAccuracy(String(Math.round(Number(stats.avg_accuracy))));
          setTopbarXp(Number(stats.total_xp).toLocaleString('fr-FR'));
        }
      } catch {}
      try {
        const { data: profile } = await supabaseBrowser
          .from('profiles')
          .select('display_name,avatar_url')
          .eq('id', playerId)
          .single();
        if (profile) {
          if (profile.avatar_url) setTopbarAvatarUrl(profile.avatar_url);
          if (profile.display_name) setTopbarInitials(profile.display_name.slice(0, 2).toUpperCase());
        }
      } catch {}
    })();
  }, [playerId]);

  if (!gameId) return null;

  if (identityLoading || identityError || !snapshot) {
    return (
      <div className={pageStyles.loadingScreen}>
        <div className={pageStyles.loadingBg} aria-hidden="true" />
        <div className={pageStyles.loadingScrim} aria-hidden="true" />
        <div className={pageStyles.loadingContent}>
          <div className={pageStyles.loadingSpinner} />
          <span className={pageStyles.loadingLabel}>
            {identityError ? t('identity_error') : t('loading_game')}
          </span>
          {error && (
            <span className={pageStyles.loadingError}>{error}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className={`app-shell ${pageStyles.pageShell}`}>
      <TopBar
        accuracy={topbarAccuracy}
        xp={topbarXp}
        avatarUrl={topbarAvatarUrl}
        initials={topbarInitials}
        onAvatarClick={() => setShowNavModal(true)}
        rankOpen={rankOpen}
        onToggleRank={toggleRankOpen}
      />
      <RankCard totalXp={Number(topbarXp.replace(/[^\d]/g, '')) || 0} open={rankOpen} />
      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={topbarAvatarUrl}
        initials={topbarInitials}
        displayName={displayName ?? ""}
      />
      <div className={pageStyles.bgImage} />
      <div className={pageStyles.bgScrim} />
      <div className={pageStyles.pageContent}>
        <div className="shell-grid">
          <SessionComplete
            snapshot={snapshot}
            playerId={playerId}
            allRoundResults={allRoundResults}
            onPlayAgain={() => router.push('/home')}
            sendMessage={() => router.push('/home')}
          />
        </div>
      </div>
    </main>
  );
}
