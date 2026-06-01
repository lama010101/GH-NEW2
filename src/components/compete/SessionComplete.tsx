"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RainbowRing from "@/components/compete/RainbowRing";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { AllRoundResult } from "@/core/competeTypes";
import { getUsernameGradientStyle, playerLabel } from "@/core/competeUtils";
import { NavModal } from "@/components/NavModal";

interface SessionCompleteProps {
  snapshot: CompeteSessionSnapshot;
  playerId: string | null;
  allRoundResults: AllRoundResult[] | null;
  setFullscreenImg: (url: string | null) => void;
  sendMessage: (msg: object) => void;
}

export default function SessionComplete({
  snapshot,
  playerId,
  allRoundResults,
  setFullscreenImg,
  sendMessage,
}: SessionCompleteProps) {
  const router = useRouter();
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [navModalOpen, setNavModalOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isHost = snapshot.players?.find((p: any) => p.playerId === playerId)?.isHost ?? false;

  const handlePlayAgain = async () => {
    if (!playerId) return;
    if (!isHost) return;

    setIsCreatingLobby(true);
    setLobbyError(null);
    try {
      const currentDisplayName = playerLabel(snapshot.players, playerId);
      const response = await fetch("/api/compete/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          displayName: currentDisplayName,
          mode: snapshot.config.mode,
          roundTimerSec: snapshot.config.roundTimerSec,
          totalRounds: snapshot.config.totalRounds,
          yearMin: snapshot.config.yearMin,
          yearMax: snapshot.config.yearMax,
          resultsAutoAdvanceSec: snapshot.config.resultsAutoAdvanceSec,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create lobby");
      }
      const data = await response.json();
      sendMessage({ type: "PLAY_AGAIN", playerId, newGameId: data.gameId });
      await new Promise(resolve => setTimeout(resolve, 300));
      router.push(`/compete/${data.gameId}`);
    } catch (error) {
      console.error("Failed to create lobby:", error);
      setLobbyError("Failed to create lobby, try again");
    } finally {
      setIsCreatingLobby(false);
    }
  };

  // Helper: compute derived stats for a player
  const computePlayerStats = (pid: string) => {
    if (!allRoundResults) return null;
    const playerResults = allRoundResults.filter(r => r.playerId === pid && r.didSubmit);
    if (playerResults.length === 0) return null;

    const totalScore = playerResults.reduce((sum, r) => sum + r.score, 0);
    const avgAccuracy = Math.round(playerResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / playerResults.length);
    const avgLocationAccuracy = Math.round(playerResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / playerResults.length);
    const avgYearAccuracy = Math.round(playerResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / playerResults.length);
    const avgConsistency = Math.round(playerResults.reduce((sum, r) => sum + Math.min(r.locationScore ?? 0, r.timeScore ?? 0), 0) / playerResults.length);
    const avgDistanceKm = playerResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0) / playerResults.length;
    const avgYearDiff = playerResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0) / playerResults.length;

    return { totalScore, avgAccuracy, avgLocationAccuracy, avgYearAccuracy, avgConsistency, avgDistanceKm, avgYearDiff };
  };

  // Helper: compute per-round stats for all players
  const computeRoundStats = (roundIndex: number) => {
    if (!allRoundResults) return null;
    const roundResults = allRoundResults.filter(r => r.roundIndex === roundIndex);
    if (roundResults.length === 0) {
      return { avgAccuracy: 0, avgLocationScore: 0, avgTimeScore: 0, avgDistanceKm: 0, avgYearDiff: 0, totalScore: 0, bestPlayerId: null };
    }

    const avgAccuracy = Math.round(roundResults.reduce((sum, r) => sum + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0) / roundResults.length);
    const avgLocationScore = Math.round(roundResults.reduce((sum, r) => sum + (r.locationScore ?? 0), 0) / roundResults.length);
    const avgTimeScore = Math.round(roundResults.reduce((sum, r) => sum + (r.timeScore ?? 0), 0) / roundResults.length);
    const avgDistanceKm = roundResults.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0) / roundResults.length;
    const avgYearDiff = roundResults.reduce((sum, r) => sum + (r.yearDiff ?? 0), 0) / roundResults.length;
    const totalScore = roundResults.reduce((sum, r) => sum + r.score, 0);
    const bestPlayer = roundResults.length > 0
      ? roundResults.reduce((best, r) => r.score > best.score ? r : best, roundResults[0])
      : null;

    return { avgAccuracy, avgLocationScore, avgTimeScore, avgDistanceKm, avgYearDiff, totalScore, bestPlayerId: bestPlayer?.playerId ?? null };
  };

  return (
    <section className="gh-final-section">
      {(() => {
        if (!playerId || !allRoundResults) return null;
        const myStats = computePlayerStats(playerId);
        const overallAccuracy = myStats?.avgAccuracy ?? 0;
        const overallXP = myStats?.totalScore ?? 0;
        const whereAccuracy = myStats?.avgLocationAccuracy ?? 0;
        const whenAccuracy = myStats?.avgYearAccuracy ?? 0;
        const avgDistanceKm = myStats?.avgDistanceKm ?? 0;
        const avgYearDiff = myStats?.avgYearDiff ?? 0;
        const currentPlayerData = snapshot.players.find(p => p.playerId === playerId);
        const currentDisplayName = playerLabel(snapshot.players, playerId);
        const currentInitial = currentDisplayName ? currentDisplayName.charAt(0).toUpperCase() : "?";

        const roundWinners = new Map<number, string[]>();
        for (let i = 0; i < snapshot.config.totalRounds; i++) {
          const roundResults = (allRoundResults ?? []).filter(r => r.roundIndex === i);
          const maxScore = Math.max(...roundResults.map(r => r.score));
          if (maxScore > 0) {
            const winners = roundResults.filter(r => r.score === maxScore).map(r => r.playerId);
            roundWinners.set(i, winners);
          }
        }
        const leaderboard = snapshot.players
          .map(p => {
            const stats = computePlayerStats(p.playerId);
            const wonRounds: number[] = [];
            for (let i = 0; i < snapshot.config.totalRounds; i++) {
              const winners = roundWinners.get(i);
              if (winners?.includes(p.playerId)) {
                wonRounds.push(i);
              }
            }
            return {
              playerId: p.playerId,
              displayName: p.displayName,
              totalScore: stats?.totalScore ?? 0,
              avgAccuracy: stats?.avgAccuracy ?? 0,
              wonRounds,
            };
          })
          .sort((a, b) => {
            if (b.avgAccuracy !== a.avgAccuracy) return b.avgAccuracy - a.avgAccuracy;
            return b.totalScore - a.totalScore;
          });

        return (
          <>
            <style>{`
              .gh-final-section {
                min-height: 100vh;
                width: 100%;
                overflow-x: hidden;
                background: #000000;
                padding: 0 0 96px;
                color: #ffffff;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              }
              .gh-final-section * {
                box-sizing: border-box;
              }
              .gh-final-topbar {
                width: 100%;
                min-height: 48px;
                background: rgba(17, 24, 39, 0.72);
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 14px;
              }
              .gh-final-title {
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .gh-final-profile {
                position: relative;
              }
              .gh-final-profile summary {
                list-style: none;
              }
              .gh-final-profile summary::-webkit-details-marker {
                display: none;
              }
              .gh-final-avatar-button {
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 999px;
                background: #333333;
                color: #ffffff;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                cursor: pointer;
                font-size: 13px;
                font-weight: 700;
              }
              .gh-final-profile-menu {
                position: absolute;
                top: 40px;
                right: 0;
                z-index: 20;
                min-width: 112px;
                border-radius: 10px;
                background: #333333;
                padding: 6px;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
              }
              .gh-final-profile-menu button {
                width: 100%;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: #ffffff;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                padding: 8px 10px;
                text-align: left;
              }
              .session-complete-content {
                width: 100%;
                max-width: 680px;
                margin: 0 auto;
                padding: 14px 12px 0;
              }
              .gh-final-score-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 12px;
                margin-bottom: 12px;
              }
              .session-complete-score-hero {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px 12px 18px;
              }
              .gh-final-xp {
                margin-top: 8px;
                color: #9ca3af;
                font-size: 13px;
                font-weight: 400;
              }
              .gh-final-card {
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-stat-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
              }
              .gh-final-stat-card {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 15px 10px;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-stat-icon {
                width: 16px;
                height: 16px;
                color: #9ca3af;
                margin-bottom: 8px;
              }
              .gh-final-percent-line {
                display: inline-flex;
                align-items: baseline;
                justify-content: center;
                font-weight: 700;
                line-height: 1;
              }
              .gh-final-stat-number {
                font-size: 24px;
              }
              .gh-final-stat-symbol {
                font-size: 12px;
                margin-left: 1px;
                color: #ffffff;
              }
              .gh-final-stat-sub {
                margin-top: 7px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                text-align: center;
              }
              .gh-final-panel {
                overflow: hidden;
                margin-bottom: 12px;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-panel-heading {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                padding: 13px 14px 10px;
              }
              .gh-final-rank-row {
                display: grid;
                grid-template-columns: 22px 30px minmax(0, 1fr) auto;
                align-items: center;
                gap: 9px;
                padding: 11px 12px;
                border-left: 3px solid transparent;
              }
              .gh-final-rank-row + .gh-final-rank-row {
                border-top: 1px solid #374151;
              }
              .gh-final-rank-number {
                color: #9ca3af;
                font-size: 13px;
                font-weight: 400;
              }
              .gh-final-rank-avatar {
                width: 30px;
                height: 30px;
                border-radius: 999px;
                background: #1a1a1a;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                font-size: 12px;
                font-weight: 700;
              }
              .gh-final-rank-main {
                min-width: 0;
              }
              .gh-final-rank-name-line {
                min-width: 0;
                display: flex;
                align-items: center;
                gap: 5px;
              }
              .gh-final-rank-name {
                min-width: 0;
                font-size: 13px;
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .gh-final-you-tag {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 400;
                flex: 0 0 auto;
              }
              .gh-final-progress-track {
                width: 100%;
                height: 4px;
                background: #1a1a1a;
                border-radius: 999px;
                margin-top: 6px;
                overflow: hidden;
              }
              .gh-final-progress-fill {
                height: 100%;
                border-radius: 999px;
                background: #9ca3af;
              }
              .gh-final-rank-score {
                text-align: right;
                white-space: nowrap;
              }
              .gh-final-rank-percent {
                color: #ffffff;
                font-size: 15px;
                font-weight: 700;
                line-height: 1;
                display: inline-flex;
                align-items: baseline;
              }
              .gh-final-rank-xp {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 400;
                margin-top: 4px;
              }
              .gh-final-rounds {
                display: grid;
                grid-template-columns: 1fr;
                gap: 10px;
              }
              .gh-final-round-card {
                overflow: hidden;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-photo {
                position: relative;
                width: 100%;
                height: 112px;
                overflow: hidden;
                background: #1a1a1a;
              }
              .gh-final-photo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                cursor: pointer;
              }
              .gh-final-round-badge {
                position: absolute;
                top: 9px;
                left: 9px;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.72);
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                padding: 5px 8px;
              }
              .gh-final-photo-fallback {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 12px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                text-align: center;
              }
              .gh-final-round-body {
                padding: 11px 12px 12px;
              }
              .gh-final-round-title {
                color: #ffffff;
                font-size: 14px;
                font-weight: 600;
                line-height: 1.35;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                margin-bottom: 10px;
              }
              .gh-final-mini-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 6px;
              }
              .gh-final-mini-tile {
                min-width: 0;
                background: #1a1a1a;
                border-radius: 8px;
                padding: 9px 4px 8px;
                text-align: center;
              }
              .gh-final-mini-number {
                font-size: 20px;
              }
              .gh-final-mini-symbol {
                font-size: 10px;
                margin-left: 1px;
                color: #ffffff;
              }
              .gh-final-mini-label {
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.04em;
                line-height: 1;
                margin-top: 6px;
                text-transform: uppercase;
              }
              .gh-final-mini-sub {
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                line-height: 1.15;
                margin-top: 5px;
              }
              .gh-final-best-row {
                border-top: 1px solid #374151;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-top: 10px;
                padding-top: 10px;
              }
              .gh-final-best-label {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.05em;
                text-transform: uppercase;
              }
              .gh-final-best-name {
                min-width: 0;
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                overflow: hidden;
                text-align: right;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .gh-final-cta {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 30;
                display: flex;
                gap: 10px;
                width: 100%;
                background: #000000;
                padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
              }
              .gh-final-cta button {
                height: 46px;
                border-radius: 12px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
              }
              .gh-final-home {
                flex: 1;
                background: #1a1a1a;
                border: 1px solid #374151;
                color: #9ca3af;
              }
              .gh-final-play {
                flex: 1.25;
                background: #f97316;
                border: 1px solid #f97316;
                color: #ffffff;
              }
              @media (min-width: 768px) {
                .session-complete-content {
                  max-width: 720px;
                  margin: 0 auto;
                }
                .session-complete-score-hero {
                  display: grid;
                  grid-template-columns: auto 1fr;
                  gap: 24px;
                  align-items: center;
                }
                .gh-final-section {
                  padding-bottom: 48px;
                }
                .gh-final-topbar {
                  padding-left: 24px;
                  padding-right: 24px;
                }
                .gh-final-score-grid {
                  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                  align-items: stretch;
                }
                .session-complete-score-hero {
                  min-height: 230px;
                }
                .gh-final-stat-grid {
                  height: 100%;
                  align-content: stretch;
                }
                .gh-final-stat-card {
                  min-height: 109px;
                }
                .gh-final-cta {
                  position: static;
                  max-width: 680px;
                  margin: 18px auto 0;
                  padding: 0 12px;
                }
              }
            `}</style>
            <div className="gh-final-topbar">
              <div className="gh-final-title">Guess History</div>
              <>
                <button
                  type="button"
                  className="gh-final-avatar-button"
                  onClick={() => setNavModalOpen(true)}
                  aria-label="Open profile menu"
                >
                  {currentPlayerData?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentPlayerData.avatarUrl}
                      alt={currentDisplayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : currentInitial}
                </button>
                <NavModal
                  isOpen={navModalOpen}
                  onClose={() => setNavModalOpen(false)}
                  avatarUrl={currentPlayerData?.avatarUrl ?? null}
                  initials={currentInitial}
                  displayName={currentDisplayName}
                />
              </>
            </div>

            <div className="session-complete-content">
              {/* HERO ACCURACY CARD */}
              <div className="gh-final-score-grid">
                <div className="session-complete-score-hero gh-final-card">
                  <RainbowRing value={overallAccuracy} />
                  <div className="gh-final-xp">{overallXP} XP</div>
                </div>

                {/* WHERE / WHEN SUB-CARDS */}
                <div className="gh-final-stat-grid">
                  {/* WHERE card */}
                  <div className="gh-final-stat-card">
                    <svg className="gh-final-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
                      <circle cx={12} cy={10} r={2.5} />
                    </svg>
                    <div className="gh-final-percent-line">
                      <span className="gh-final-stat-number" style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, whereAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{whereAccuracy}</span>
                      <span className="gh-final-stat-symbol">%</span>
                    </div>
                    <div className="gh-final-stat-sub">avg {Math.round(avgDistanceKm)} km away</div>
                  </div>
                  {/* WHEN card */}
                  <div className="gh-final-stat-card">
                    <svg className="gh-final-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x={4} y={5} width={16} height={15} rx={2} />
                      <path d="M8 3v4M16 3v4M4 10h16" />
                    </svg>
                    <div className="gh-final-percent-line">
                      <span className="gh-final-stat-number" style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, whenAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{whenAccuracy}</span>
                      <span className="gh-final-stat-symbol">%</span>
                    </div>
                    <div className="gh-final-stat-sub">avg {Math.round(avgYearDiff)} yrs off</div>
                  </div>
                </div>
              </div>

              {/* LEADERBOARD SECTION */}
              <div className="gh-final-panel">
                <div className="gh-final-panel-heading">Final Rankings</div>
                {leaderboard.map((player, index) => {
                  const isCurrentPlayer = player.playerId === playerId;
                  const playerData = snapshot.players.find(p => p.playerId === player.playerId);
                  const displayName = playerLabel(snapshot.players, player.playerId);
                  const firstLetter = displayName ? displayName.charAt(0).toUpperCase() : "?";
                  return (
                    <div
                      key={player.playerId}
                      className="gh-final-rank-row"
                      style={{
                        borderLeftColor: "transparent",
                      }}
                    >
                      <div className="gh-final-rank-number">{index + 1}</div>
                      <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
                        <div className="gh-final-rank-avatar">
                          {playerData?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={playerData.avatarUrl}
                              alt={displayName}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : firstLetter}
                        </div>
                        {isCurrentPlayer && (
                          <span style={{
                            position: "absolute",
                            bottom: 1,
                            right: 1,
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            backgroundColor: "#f59e0b",
                            border: "1.5px solid #111",
                            display: "block",
                            zIndex: 2,
                          }} />
                        )}
                      </div>
                      <div className="gh-final-rank-main">
                        <div className="gh-final-rank-name-line">
                          <span
                            className="gh-final-rank-name"
                            style={getUsernameGradientStyle(player.playerId)}
                          >
                            {displayName}
                          </span>
                          {isCurrentPlayer ? <span className="gh-final-you-tag">(you)</span> : null}
                        </div>
                        <div className="gh-final-progress-track">
                          <div
                            className="gh-final-progress-fill"
                            style={{
                              width: `${Math.max(0, Math.min(100, player.avgAccuracy))}%`,
                              background: "#9ca3af",
                            }}
                          />
                        </div>
                      </div>
                      <div className="gh-final-rank-score">
                        <div className="gh-final-rank-percent">
                          <span style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, player.avgAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{player.avgAccuracy}</span>
                          <span style={{ color: "#ffffff", fontSize: "3.75px" }}>%</span>
                        </div>
                        <div className="gh-final-rank-xp">{player.totalScore} XP</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ROUND BREAKDOWN LABEL */}
              <div className="gh-final-panel-heading" style={{ paddingLeft: 2 }}>Round Breakdown</div>
              {/* ROUND CARDS */}
              <div className="gh-final-rounds">
                {snapshot.rounds.map((round, i) => {
                  const roundStats = computeRoundStats(i) ?? {
                    avgAccuracy: 0, avgLocationScore: 0, avgTimeScore: 0,
                    avgDistanceKm: 0, avgYearDiff: 0, totalScore: 0, bestPlayerId: null
                  };
                  const bestPlayerName = roundStats.bestPlayerId ? playerLabel(snapshot.players, roundStats.bestPlayerId) : null;
                  const isCurrentBestPlayer = roundStats.bestPlayerId !== null && roundStats.bestPlayerId === playerId;
                  return (
                    <div key={i} className="gh-final-round-card">
                      {/* Photo strip */}
                      <div className="gh-final-photo">
                        {round.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={round.imageUrl}
                            alt={round.title}
                            onClick={() => setFullscreenImg(round.imageUrl)}
                          />
                        ) : (
                          <div className="gh-final-photo-fallback">
                            {round.locationName || `${round.latitude.toFixed(2)}, ${round.longitude.toFixed(2)}`} · {round.year}
                          </div>
                        )}
                        <div className="gh-final-round-badge">ROUND {i + 1}</div>
                      </div>

                      {/* Card body */}
                      <div className="gh-final-round-body">
                        <div className="gh-final-round-title">{round.title}</div>

                        {/* 3-column score row */}
                        <div className="gh-final-mini-grid">
                          {/* TOTAL cell */}
                          <div className="gh-final-mini-tile">
                            <div className="gh-final-percent-line">
                              <span className="gh-final-mini-number" style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgAccuracy)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgAccuracy}</span>
                              <span className="gh-final-mini-symbol">%</span>
                            </div>
                            <div className="gh-final-mini-label">Total</div>
                            <div className="gh-final-mini-sub">{roundStats.totalScore} pts</div>
                          </div>

                          <div className="gh-final-mini-tile">
                            <div className="gh-final-percent-line">
                              <span className="gh-final-mini-number" style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgLocationScore)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgLocationScore}</span>
                              <span className="gh-final-mini-symbol">%</span>
                            </div>
                            <div className="gh-final-mini-label">Where</div>
                            <div className="gh-final-mini-sub">avg {Math.round(roundStats.avgDistanceKm)} km</div>
                          </div>

                          <div className="gh-final-mini-tile">
                            <div className="gh-final-percent-line">
                              <span className="gh-final-mini-number" style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, roundStats.avgTimeScore)) / 100) * 120)}, 100%, 50%)` }}>{roundStats.avgTimeScore}</span>
                              <span className="gh-final-mini-symbol">%</span>
                            </div>
                            <div className="gh-final-mini-label">When</div>
                            <div className="gh-final-mini-sub">avg {Math.round(roundStats.avgYearDiff)} yrs</div>
                          </div>
                        </div>

                        {/* Round footer */}
                        {bestPlayerName && (
                          <div className="gh-final-best-row">
                            <div className="gh-final-best-label">
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M8 21h8" />
                                <path d="M12 17v4" />
                                <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
                                <path d="M5 6H3a3 3 0 0 0 3 3h1" />
                                <path d="M19 6h2a3 3 0 0 1-3 3h-1" />
                              </svg>
                              Best Player
                            </div>
                            <div
                              className="gh-final-best-name"
                              style={{ color: isCurrentBestPlayer ? "#f97316" : "#9ca3af" }}
                            >
                              {bestPlayerName}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BOTTOM ACTION BAR */}
              <div className="gh-final-cta">
                <button
                  type="button"
                  className="gh-final-home"
                  onClick={() => router.push("/")}
                >
                  Home
                </button>
                {isHost ? (
                  <button
                    type="button"
                    className="gh-final-play"
                    onClick={handlePlayAgain}
                    disabled={isCreatingLobby}
                  >
                    {isCreatingLobby ? "Creating lobby..." : "Play Again"}
                  </button>
                ) : (
                  <GuestPlayAgainButton />
                )}
                {lobbyError && (
                  <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px", gridColumn: "1 / -1", textAlign: "center" }}>
                    {lobbyError}
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </section>
  );
}

function GuestPlayAgainButton() {
  const [waiting, setWaiting] = useState(false);
  return (
    <button
      type="button"
      className="gh-final-play"
      onClick={() => setWaiting(true)}
      disabled={waiting}
      style={waiting ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
    >
      {waiting ? "Waiting for Host…" : "Play Again"}
    </button>
  );
}
