"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Leaderboard page
// Route: /prototype/leaderboard   (direct access, fully self-contained)
//
// Self-contained mock UI exploring a podium + ranked list treatment.
// No WebSocket, no Supabase, no real data. Uses the same dark image + scrim
// visual language as the other /prototype pages.
// ============================================================================

import { useMemo, useState } from "react";

type Tab = "overall" | "daily" | "journey";
type DailySubTab = "today" | "alltime";

type Player = {
  id: string;
  name: string;
  score: number;
  accuracy: number;
  roundsWon: number;
  streak: number;
  isMe: boolean;
  isAI?: boolean;
  isFriend?: boolean;
};

const DATA: Record<string, Player[]> = {
  overall: [
    { id: "p5", name: "Jamal Wright", score: 45200, accuracy: 91, roundsWon: 12, streak: 6, isMe: false },
    { id: "a1", name: "Chronos Bot", score: 43600, accuracy: 96, roundsWon: 11, streak: 8, isMe: false, isAI: true },
    { id: "p2", name: "Mina Kovač", score: 42100, accuracy: 93, roundsWon: 10, streak: 5, isMe: false, isFriend: true },
    { id: "p1", name: "Alex Rivera", score: 38900, accuracy: 87, roundsWon: 8, streak: 4, isMe: true },
    { id: "p6", name: "Priya Patel", score: 37100, accuracy: 85, roundsWon: 7, streak: 4, isMe: false, isFriend: true },
    { id: "p7", name: "Liam O'Connor", score: 34000, accuracy: 82, roundsWon: 6, streak: 3, isMe: false },
    { id: "p4", name: "Sara Bianchi", score: 31200, accuracy: 80, roundsWon: 5, streak: 2, isMe: false, isFriend: true },
    { id: "p3", name: "Theo Lambert", score: 29800, accuracy: 70, roundsWon: 4, streak: 2, isMe: false },
  ],
  daily_today: [
    { id: "p2", name: "Mina Kovač", score: 8150, accuracy: 94, roundsWon: 2, streak: 4, isMe: false, isFriend: true },
    { id: "a2", name: "Quiz Bot", score: 7800, accuracy: 97, roundsWon: 2, streak: 5, isMe: false, isAI: true },
    { id: "p4", name: "Sara Bianchi", score: 7300, accuracy: 79, roundsWon: 1, streak: 2, isMe: false, isFriend: true },
    { id: "p1", name: "Alex Rivera", score: 7240, accuracy: 89, roundsWon: 2, streak: 3, isMe: true },
    { id: "p3", name: "Theo Lambert", score: 5230, accuracy: 68, roundsWon: 0, streak: 1, isMe: false },
  ],
  daily_alltime: [
    { id: "p5", name: "Jamal Wright", score: 45200, accuracy: 91, roundsWon: 12, streak: 6, isMe: false },
    { id: "a1", name: "Chronos Bot", score: 43600, accuracy: 96, roundsWon: 11, streak: 8, isMe: false, isAI: true },
    { id: "p2", name: "Mina Kovač", score: 42100, accuracy: 93, roundsWon: 10, streak: 5, isMe: false, isFriend: true },
    { id: "p1", name: "Alex Rivera", score: 38900, accuracy: 87, roundsWon: 8, streak: 4, isMe: true },
    { id: "p6", name: "Priya Patel", score: 37100, accuracy: 85, roundsWon: 7, streak: 4, isMe: false, isFriend: true },
    { id: "p7", name: "Liam O'Connor", score: 34000, accuracy: 82, roundsWon: 6, streak: 3, isMe: false },
    { id: "p4", name: "Sara Bianchi", score: 31200, accuracy: 80, roundsWon: 5, streak: 2, isMe: false, isFriend: true },
    { id: "p3", name: "Theo Lambert", score: 29800, accuracy: 70, roundsWon: 4, streak: 2, isMe: false },
  ],
  journey: [
    { id: "p8", name: "Noah Chen", score: 18500, accuracy: 88, roundsWon: 3, streak: 4, isMe: false },
    { id: "p1", name: "Alex Rivera", score: 16200, accuracy: 84, roundsWon: 3, streak: 3, isMe: true },
    { id: "a3", name: "Sage Bot", score: 15000, accuracy: 95, roundsWon: 3, streak: 4, isMe: false, isAI: true },
    { id: "p9", name: "Emma Dubois", score: 14100, accuracy: 90, roundsWon: 2, streak: 3, isMe: false, isFriend: true },
    { id: "p4", name: "Sara Bianchi", score: 12800, accuracy: 81, roundsWon: 2, streak: 2, isMe: false, isFriend: true },
  ],
};

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const h1 = hash % 360;
  return `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${(h1 + 48) % 360} 70% 42%))`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

function accColor(acc: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, acc)) / 100) * 120);
  return `hsl(${hue}, 90%, 52%)`;
}

function rankSuffix(n: number): string {
  const m = n % 100;
  if (m >= 11 && m <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function Avatar({ id, name, size = 32, initials, dot }: { id: string; name: string; size?: number; initials?: string; dot?: boolean }) {
  return (
    <span className="lb-avatar-wrap">
      <span
        className="lb-avatar"
        style={{ background: gradientFor(id), width: size, height: size, fontSize: size * 0.36 }}
      >
        {initials ?? initialsOf(name)}
      </span>
      {dot && <span className="lb-me-dot" />}
    </span>
  );
}

function PodiumCard({
  player,
  rank,
  placeClass,
  height,
}: {
  player: Player;
  rank: number;
  placeClass: string;
  height: string;
}) {
  return (
    <div className={`lb-podium-item ${placeClass}`} style={{ height }}>
      <span className={`lb-podium-rank ${placeClass}-rank`}>{rank}</span>
      {rank === 1 && <span className="lb-crown">👑</span>}
      <Avatar id={player.id} name={player.name} size={rank === 1 ? 64 : 48} initials={player.isAI ? "AI" : undefined} dot={player.isMe} />
      <span className="lb-podium-name">{player.name}</span>
      <span className="lb-podium-score">{player.score.toLocaleString()}</span>
      <span className="lb-podium-acc" style={{ color: accColor(player.accuracy) }}>
        {player.accuracy}%
      </span>
    </div>
  );
}

function LeaderboardRow({ player, rank }: { player: Player; rank: number }) {
  const isTop = rank <= 3;
  return (
    <div className={`lb-row ${player.isMe ? "lb-row-me" : ""}`}>
      <span className={`lb-rank ${isTop ? `lb-rank-${rank}` : ""}`}>
        {isTop ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
      </span>
      <Avatar id={player.id} name={player.name} size={38} initials={player.isAI ? "AI" : undefined} dot={player.isMe} />
      <div className="lb-name-col">
        <span className="lb-name">
          {player.name}
          {player.isAI && <span className="lb-ai-tag">AI</span>}
        </span>
        <span className="lb-meta">
          {player.roundsWon} round{player.roundsWon === 1 ? "" : "s"} won · {player.streak} streak
        </span>
      </div>
      <div className="lb-score-col">
        <span className="lb-score">{player.score.toLocaleString()} XP</span>
        <span className="lb-acc" style={{ color: accColor(player.accuracy) }}>
          {player.accuracy}%
        </span>
      </div>
    </div>
  );
}

export default function LeaderboardPrototypePage() {
  const [tab, setTab] = useState<Tab>("overall");
  const [subTab, setSubTab] = useState<DailySubTab>("today");
  const [filters, setFilters] = useState({ humans: false, ai: false, friends: false });

  const viewKey = tab === "daily" ? `daily_${subTab}` : tab;

  const ranked = useMemo(() => {
    let rows = [...DATA[viewKey]].sort((a, b) => b.score - a.score);
    if (filters.humans && !filters.ai) rows = rows.filter((p) => !p.isAI);
    if (filters.ai && !filters.humans) rows = rows.filter((p) => p.isAI);
    if (filters.friends) rows = rows.filter((p) => p.isFriend);
    return rows;
  }, [viewKey, filters]);

  const myRank = useMemo(() => ranked.findIndex((p) => p.isMe) + 1, [ranked]);

  const podium = useMemo(() => {
    if (ranked.length < 3) return [];
    return [
      { player: ranked[1], rank: 2, placeClass: "lb-silver", height: "88%" },
      { player: ranked[0], rank: 1, placeClass: "lb-gold", height: "100%" },
      { player: ranked[2], rank: 3, placeClass: "lb-bronze", height: "78%" },
    ];
  }, [ranked]);

  const listRows = useMemo(() => ranked.slice(3), [ranked]);

  const tabLabels: Record<Tab, string> = {
    overall: "Overall",
    daily: "Daily",
    journey: "Journey",
  };

  const summaryLabel = tab === "daily" ? `Daily ${subTab === "today" ? "Today" : "All-time"}` : tabLabels[tab];

  return (
    <>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #0a0a0a;
        }

        .lb-screen {
          position: fixed;
          inset: 0;
          overflow: hidden;
          font-family: var(--font-dm-sans), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
            sans-serif;
          color: var(--gh-text-primary);
        }

        .lb-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }

        .lb-scrim {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: rgba(0, 0, 0, 0.86);
        }

        .lb-proto-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(10, 10, 12, 0.6);
          backdrop-filter: blur(8px);
          flex-wrap: wrap;
        }

        .lb-proto-title {
          font-size: var(--font-xs);
          font-weight: 600;
          letter-spacing: 0.3px;
          opacity: 0.85;
        }

        .lb-proto-hint {
          font-size: var(--font-2xs);
          font-weight: 600;
          opacity: 0.55;
        }

        .lb-scroll {
          position: absolute;
          inset: 0;
          z-index: 2;
          overflow-y: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 56px 16px calc(24px + env(safe-area-inset-bottom));
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-width: 560px;
          margin: 0 auto;
          box-sizing: border-box;
          width: 100%;
        }

        .lb-scroll::-webkit-scrollbar {
          display: none;
        }

        @media (min-width: 1024px) {
          .lb-scroll {
            display: grid;
            grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
            align-content: start;
            max-width: 1040px;
            padding-left: 24px;
            padding-right: 24px;
          }

          .lb-header,
          .lb-seg,
          .lb-subrow,
          .lb-filters,
          .lb-summary {
            grid-column: 1 / -1;
          }
        }

        .lb-card {
          background: var(--gh-glass-bg);
          border: 1px solid var(--gh-glass-border);
          border-radius: var(--gh-general-card-radius);
          backdrop-filter: var(--gh-glass-blur);
          box-shadow: var(--gh-general-card-shadow);
        }

        .lb-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 0 2px;
        }

        .lb-back {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--gh-glass-bg);
          border: 1px solid var(--gh-border-default);
          border-radius: 10px;
          color: var(--gh-text-primary);
          font-size: var(--font-sm);
          font-weight: 600;
          padding: 8px 12px;
          cursor: pointer;
        }

        .lb-back-arrow {
          font-size: var(--font-lg);
        }

        .lb-title {
          font-family: var(--font-bebas), sans-serif;
          font-size: var(--font-2xl);
          font-weight: bold;
          letter-spacing: 1.5px;
          margin: 0;
          text-transform: uppercase;
          background: linear-gradient(180deg, var(--gh-text-primary), var(--gh-text-secondary));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .lb-spacer {
          width: 80px;
        }

        .lb-rank-num {
          background: linear-gradient(135deg, var(--gh-teal), var(--gh-violet));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 800;
        }

        .lb-seg {
          display: flex;
          gap: 6px;
          padding: 5px;
          border-radius: 14px;
        }

        .lb-seg-tab {
          flex: 1;
          font-family: var(--font-bebas), sans-serif;
          font-size: var(--font-base);
          font-weight: bold;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: 10px;
          color: var(--gh-text-secondary);
          cursor: pointer;
          transition: color 0.2s ease, background 0.2s ease;
        }

        .lb-seg-tab:hover {
          color: var(--gh-text-primary);
        }

        .lb-seg-tab-active,
        .lb-seg-tab-active:hover {
          color: var(--gh-btn-text);
          background: linear-gradient(135deg, var(--gh-orange), rgba(var(--gh-orange-rgb), 0.85));
          box-shadow: 0 4px 14px rgba(var(--gh-orange-rgb), 0.35);
        }

        .lb-subrow,
        .lb-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .lb-chip {
          font-size: var(--font-xs);
          font-weight: 600;
          padding: 8px 14px;
          background: var(--gh-glass-bg);
          border: 1px solid var(--gh-border-default);
          border-radius: 20px;
          color: var(--gh-text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .lb-chip:hover {
          color: var(--gh-text-primary);
        }

        .lb-chip-active,
        .lb-chip-active:hover {
          background: rgba(var(--gh-orange-rgb), 0.15);
          border-color: rgba(var(--gh-orange-rgb), 0.3);
          color: var(--gh-orange);
        }

        .lb-friends {
          margin-left: auto;
        }

        .lb-summary {
          text-align: center;
          padding: 10px 14px;
          font-size: var(--font-sm);
          font-weight: 500;
          color: var(--gh-text-secondary);
        }

        .lb-ai-tag {
          font-size: var(--font-2xs);
          font-weight: 700;
          color: var(--gh-orange);
          background: rgba(var(--gh-orange-rgb), 0.15);
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }

        .lb-podium {
          padding: 18px 14px 14px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 10px;
          height: 300px;
        }

        .lb-podium-item {
          flex: 1;
          max-width: 130px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          padding: 14px 8px;
          border-radius: var(--gh-general-card-radius);
          border: 1px solid var(--gh-glass-border);
          background: rgba(255, 255, 255, 0.04);
          transition: transform 0.2s ease;
        }

        .lb-podium-item:hover {
          transform: translateY(-4px);
        }

        .lb-gold {
          max-width: 150px;
          background: linear-gradient(180deg, rgba(251, 191, 36, 0.24), rgba(251, 191, 36, 0.07));
          border-color: rgba(251, 191, 36, 0.6);
          box-shadow: 0 12px 36px rgba(251, 191, 36, 0.3);
          animation: lb-gold-glow 2.6s ease-in-out infinite;
        }

        @keyframes lb-gold-glow {
          0%,
          100% {
            box-shadow: 0 12px 36px rgba(251, 191, 36, 0.3);
          }
          50% {
            box-shadow: 0 12px 44px rgba(251, 191, 36, 0.5);
          }
        }

        .lb-crown {
          font-size: 26px;
          line-height: 1;
          margin-bottom: -4px;
          filter: drop-shadow(0 2px 6px rgba(251, 191, 36, 0.65));
        }

        .lb-gold .lb-podium-name {
          font-size: var(--font-base);
        }

        .lb-gold .lb-podium-score {
          font-size: var(--font-lg);
        }

        .lb-silver {
          background: linear-gradient(180deg, rgba(192, 192, 192, 0.12), rgba(192, 192, 192, 0.04));
          border-color: rgba(192, 192, 192, 0.3);
        }

        .lb-bronze {
          background: linear-gradient(180deg, rgba(205, 127, 50, 0.12), rgba(205, 127, 50, 0.04));
          border-color: rgba(205, 127, 50, 0.3);
        }

        .lb-podium-rank {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: var(--font-sm);
          font-weight: 800;
          color: #fff;
        }

        .lb-gold-rank {
          background: var(--gh-gold);
          color: #1a0a00;
          width: 34px;
          height: 34px;
          font-size: var(--font-base);
        }

        .lb-silver-rank {
          background: #c0c0c0;
          color: #1a0a00;
        }

        .lb-bronze-rank {
          background: #cd7f32;
          color: #fff;
        }

        .lb-podium-name {
          font-size: var(--font-sm);
          font-weight: 700;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        .lb-podium-score {
          font-size: var(--font-base);
          font-weight: 800;
          color: var(--gh-gold);
        }

        .lb-podium-acc {
          font-size: var(--font-xs);
          font-weight: 700;
        }

        .lb-list {
          padding: 8px;
          display: flex;
          flex-direction: column;
        }

        .lb-row {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 11px 10px;
          border-radius: var(--radius-md);
        }

        .lb-row + .lb-row {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .lb-row-me {
          background: var(--gh-lb-row-me-bg);
          border: 1px solid var(--gh-lb-row-me-border);
        }

        .lb-rank {
          width: 28px;
          text-align: center;
          font-size: var(--font-base);
          font-weight: 800;
          color: var(--gh-text-secondary);
        }

        .lb-rank-1 {
          color: #ffd54a;
        }

        .lb-rank-2 {
          color: #c0c0c0;
        }

        .lb-rank-3 {
          color: #cd7f32;
        }

        .lb-avatar-wrap {
          position: relative;
          display: inline-flex;
          flex-shrink: 0;
        }

        .lb-avatar {
          flex-shrink: 0;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #fff;
          text-transform: uppercase;
          border: 2px solid rgba(255, 255, 255, 0.25);
        }

        .lb-me-dot {
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #22d3ee;
          border: 2px solid rgba(10, 10, 12, 0.85);
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.7);
          animation: lb-dot-pulse 1.8s ease-in-out infinite;
        }

        @keyframes lb-dot-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }

        .lb-name-col {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .lb-name {
          font-size: var(--font-sm);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .lb-meta {
          font-size: var(--font-2xs);
          color: var(--gh-text-muted);
        }

        .lb-score-col {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .lb-score {
          font-size: var(--font-sm);
          font-weight: 800;
          color: var(--gh-gold);
        }

        .lb-acc {
          font-size: var(--font-xs);
          font-weight: 700;
        }

        .lb-empty {
          padding: 40px 16px;
          text-align: center;
          color: var(--gh-text-muted);
          font-size: var(--font-sm);
        }
      `}</style>

      <main className="lb-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className="lb-bg" draggable={false} />
        <div className="lb-scrim" />

        <div className="lb-proto-bar">
          <span className="lb-proto-title">Leaderboard — Prototype</span>
          <span className="lb-proto-hint">Mock data · you = Alex</span>
        </div>

        <div className="lb-scroll">
          <div className="lb-header">
            <button className="lb-back" onClick={() => window.history.back()}>
              <span className="lb-back-arrow">←</span>
              <span>Back</span>
            </button>
            <h1 className="lb-title">Leaderboard</h1>
            <span className="lb-spacer" />
          </div>

          <div className="lb-card lb-seg">
            {(["overall", "daily", "journey"] as Tab[]).map((key) => (
              <button
                key={key}
                className={`lb-seg-tab ${tab === key ? "lb-seg-tab-active" : ""}`}
                onClick={() => setTab(key)}
              >
                {tabLabels[key]}
              </button>
            ))}
          </div>

          {tab === "daily" && (
            <div className="lb-subrow">
              {(["today", "alltime"] as DailySubTab[]).map((key) => (
                <button
                  key={key}
                  className={`lb-chip ${subTab === key ? "lb-chip-active" : ""}`}
                  onClick={() => setSubTab(key)}
                >
                  {key === "today" ? "Today" : "All-time"}
                </button>
              ))}
            </div>
          )}

          <div className="lb-filters">
            <button
              className={`lb-chip ${filters.humans ? "lb-chip-active" : ""}`}
              aria-pressed={filters.humans}
              onClick={() => setFilters((f) => ({ ...f, humans: !f.humans }))}
            >
              Humans
            </button>
            <button
              className={`lb-chip ${filters.ai ? "lb-chip-active" : ""}`}
              aria-pressed={filters.ai}
              onClick={() => setFilters((f) => ({ ...f, ai: !f.ai }))}
            >
              AI
            </button>
            <button
              className={`lb-chip lb-friends ${filters.friends ? "lb-chip-active" : ""}`}
              aria-pressed={filters.friends}
              onClick={() => setFilters((f) => ({ ...f, friends: !f.friends }))}
            >
              Friends
            </button>
          </div>

          {myRank > 0 && (
            <div className="lb-card lb-summary">
              You are{" "}
              <span className="lb-rank-num">
                {myRank}
                {rankSuffix(myRank)}
              </span>{" "}
              in {summaryLabel}
            </div>
          )}

          <div className="lb-card">
            <div className="lb-podium">
              {podium.map((slot) => (
                <PodiumCard
                  key={slot.player.id}
                  player={slot.player}
                  rank={slot.rank}
                  placeClass={slot.placeClass}
                  height={slot.height}
                />
              ))}
            </div>
          </div>

          <div className="lb-card lb-list">
            {listRows.length === 0 ? (
              <div className="lb-empty">No more ranked players.</div>
            ) : (
              listRows.map((player, idx) => (
                <LeaderboardRow key={player.id} player={player} rank={idx + 4} />
              ))
            )}
          </div>

        </div>
      </main>
    </>
  );
}
