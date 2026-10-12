"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home V3 (Journey & Daily · Bento dashboard)
// Route: /prototype/home-v3   (direct access, self-contained, mock data)
//
// Second alternative to /prototype/home-v2 with intentionally different IA:
// v2 = two monolithic cards; v3 = a bento grid of purpose-built tiles —
// Journey route-map, Daily countdown, Streak, Leaders, Stats, More ways.
// On mobile the time-boxed Daily surfaces FIRST (above Journey); on desktop
// Journey gets ~2/3 and Daily ~1/3 of the top row.
//
// Styling: one CSS string, .hv3-* classes, normal document scroll.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Lock,
  Flame,
  Medal,
  ChevronRight,
  Map,
  CalendarDays,
  Trophy,
  BarChart3,
  Crown,
} from "lucide-react";
import { getAccuracyColor } from "@/core/accuracyColor";
import { getNextDailyRollover, getDailyChallengeDate } from "@/core/dailyDate";

// ── Journey mock (mirrors prod rules) ────────────────────────────────────────
// NOTE: journey_stages.title is null in prod — prod shows "Stage N".
// Titles / themes / difficulty below are MOCK.
const STAGE_META: Record<number, { title: string; theme: string; difficulty: number }> = {
  1: { title: "Breaking News", theme: "2023 – today · Worldwide", difficulty: 1 },
  2: { title: "The AI Boom", theme: "2022 – 2024 · Worldwide", difficulty: 1 },
  3: { title: "Lockdown", theme: "2020 – 2021 · Worldwide", difficulty: 2 },
  4: { title: "Climate Front Lines", theme: "2019 – 2023 · Worldwide", difficulty: 2 },
  5: { title: "Streaming Wars", theme: "2019 – 2022 · Americas & Europe", difficulty: 2 },
  6: { title: "Selfie Decade", theme: "2013 – 2019 · Worldwide", difficulty: 3 },
  7: { title: "Arab Spring", theme: "2010 – 2013 · Africa & Middle East", difficulty: 3 },
  8: { title: "The Great Recession", theme: "2007 – 2010 · Americas & Europe", difficulty: 4 },
  9: { title: "Pocket Revolution", theme: "2007 – 2009 · Worldwide", difficulty: 4 },
  10: { title: "Beijing to London", theme: "2008 – 2012 · Asia & Europe", difficulty: 4 },
};

// Accuracy gates for stages 1–10 (min_accuracy_pct, prod values).
const GATES = [50, 52.78, 55.56, 58.33, 61.11, 63.89, 66.67, 69.44, 72.22, 75];
const gateFor = (stage: number) => GATES[stage - 1] ?? 75;

type Badge = "gold" | "silver" | "bronze" | "completion";
// Prod thresholds (journeyCore.ts): gold = 100%, silver ≥ 95, bronze ≥ 90, completion ≥ gate.
function badgeFor(acc: number, gate: number): Badge | null {
  if (acc >= 100) return "gold";
  if (acc >= 95) return "silver";
  if (acc >= 90) return "bronze";
  if (acc >= gate) return "completion";
  return null;
}

const BADGE_COLORS: Record<Badge, string> = {
  gold: "#f0c060",
  silver: "#cbd5e1",
  bronze: "#d97706",
  completion: "#c4b5fd",
};

const rankIcon = (tierIdx: number) => `/icons/ranks/rank-${String(tierIdx + 1).padStart(2, "0")}.png`;

type JourneyState = "new" | "mid" | "resume";

// Mid/Resume: stages 1–7 completed with best accuracies.
const COMPLETED: Record<number, number> = { 1: 92, 2: 96, 3: 78, 4: 100, 5: 88, 6: 91, 7: 74 };

interface JourneyModel {
  nextStage: number;
  tierIdx: number;
  pathStages: number[];
  completed: Record<number, number>;
  resume: boolean;
}

function journeyModel(state: JourneyState): JourneyModel {
  if (state === "new") {
    return { nextStage: 1, tierIdx: 0, pathStages: [1, 2, 3, 4, 5], completed: {}, resume: false };
  }
  return {
    nextStage: 8,
    tierIdx: 1,
    pathStages: [6, 7, 8, 9, 10],
    completed: COMPLETED,
    resume: state === "resume",
  };
}

// ── Daily mock ───────────────────────────────────────────────────────────────
type DailyState = "new" | "playing" | "done";
const DAILY_MOCK = { playingToday: 3218, doneAcc: 86, doneXp: 812, doneRank: 142, streakBase: 12, streakBest: 31, roundInProgress: 3 };

// ── Time-dependent bits (client-only, post-mount) ────────────────────────────
function msToParts(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

// Isolated 30s ticker — only the countdown component re-renders, not the page.
function useDailyMs(): { ms: number; frac: number } | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const ms = getNextDailyRollover(new Date(now)).getTime() - now;
  const frac = Math.min(1, Math.max(0, 1 - ms / 86_400_000));
  return { ms, frac };
}

// format "big"  → hero digits (~34px tabular) + day-progress bar
// format "line" → single muted line, e.g. "Next Daily in 18h 46m"
function DailyCountdown({ format = "big", prefix = "" }: { format?: "big" | "line"; prefix?: string }) {
  const data = useDailyMs();
  if (data === null) {
    return <span className={`hv3d-count ${format === "big" ? "hv3d-countBig" : "hv3d-countLine"}`}>—</span>;
  }
  const { h, m } = msToParts(data.ms);
  if (format === "line") {
    return <span className="hv3d-count hv3d-countLine">{prefix} {h}h {m}m</span>;
  }
  return (
    <span className="hv3d-countWrap">
      <span className="hv3d-count hv3d-countBig">{h}h {m}m</span>
      <span className="hv3d-daybar"><span className="hv3d-dayfill" style={{ width: `${data.frac * 100}%` }} /></span>
    </span>
  );
}

function useToday(): { dateLabel: string | null; weekDays: { initial: string; today: boolean }[] | null } {
  const [data, setData] = useState<{ dateLabel: string | null; weekDays: { initial: string; today: boolean }[] | null }>({
    dateLabel: null,
    weekDays: null,
  });
  useEffect(() => {
    const iso = getDailyChallengeDate();
    const day = new Date(`${iso}T00:00:00Z`);
    const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(day);
    const initials = ["S", "M", "T", "W", "T", "F", "S"];
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(day);
      d.setUTCDate(d.getUTCDate() - (6 - i));
      return { initial: initials[d.getUTCDay()], today: i === 6 };
    });
    setData({ dateLabel: label, weekDays: week });
  }, []);
  return data;
}

type WeekDays = { initial: string; today: boolean }[] | null;

// ════════════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════════════
export default function HomeV3Page() {
  const [journeyState, setJourneyState] = useState<JourneyState>("mid");
  const [dailyState, setDailyState] = useState<DailyState>("new");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { dateLabel, weekDays } = useToday();

  const open = (path: string) => {
    setToast(`Prototype — would open ${path}`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  return (
    <main className="hv3-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hv3-bg" />
      <div className="hv3-scrim" />

      {/* Proto controls — not sticky */}
      <div className="hv3-proto" data-proto>
        <div className="hv3-protoInner">
          <span className="hv3-protoLabel">Prototype · Home V3 · mock data</span>
          <div className="hv3-protoGroups">
          <span className="hv3-seg">
            <span className="hv3-segName">Journey</span>
            {(["new", "mid", "resume"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setJourneyState(s)}
                className={`hv3-segBtn ${journeyState === s ? "hv3-segOn" : ""}`}>
                {s === "new" ? "New" : s === "mid" ? "Mid" : "Resume"}
              </button>
            ))}
          </span>
          <span className="hv3-seg">
            <span className="hv3-segName">Daily</span>
            {(["new", "playing", "done"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setDailyState(s)}
                className={`hv3-segBtn ${dailyState === s ? "hv3-segOn" : ""}`}>
                {s === "new" ? "New" : s === "playing" ? "Playing" : "Done"}
              </button>
            ))}
          </span>
          </div>
        </div>
      </div>

      {/* Sticky top bar */}
      <header className="hv3-top">
        <div className="hv3-topInner">
          <div className="hv3-topLeft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt="Guess-History" width={512} height={77} decoding="async" className="hv3-logo" />
          </div>
          <div className="hv3-topRight">
            <span className="hv3-xpPill">
              <span className="hv3-xpFull">87% · 124,800 XP</span>
              <span className="hv3-xpShort">87% · 124.8k</span>
            </span>
            <span className="hv3-avatar">AR</span>
          </div>
        </div>
      </header>

      <div className="hv3-wrap">
        <div className="hv3-helloRow">
          <div className="hv3-helloTxt">
            <h1 className="hv3-hello">Welcome back, Alex</h1>
            <p className="hv3-tagline">Where and when did it happen?</p>
          </div>
          <span className="hv3-date">{dateLabel ?? "—"}</span>
        </div>

        <div className="hv3-grid">
          <JourneyTile state={journeyState} onOpen={open} />
          <DailyTile state={dailyState} dateLabel={dateLabel} onOpen={open} />
          <StreakTile state={dailyState} weekDays={weekDays} />
          <LeadersTile state={dailyState} />
          <StatsTile onOpen={open} />
          <MoreWaysTile onOpen={open} />
        </div>
      </div>

      {toast && <div className="hv3-toast">{toast}</div>}
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// JOURNEY tile — route map + up-next panel
// ════════════════════════════════════════════════════════════════════════════
function JourneyTile({ state, onOpen }: { state: JourneyState; onOpen: (p: string) => void }) {
  const m = journeyModel(state);
  const meta = STAGE_META[m.nextStage];
  const gate = Math.round(gateFor(m.nextStage));
  const doneCount = Object.keys(m.completed).length;

  const tally = { gold: 0, silver: 0, bronze: 0, completion: 0 };
  for (const [s, acc] of Object.entries(m.completed)) {
    const b = badgeFor(acc, gateFor(Number(s)));
    if (b) tally[b]++;
  }
  const cta = state === "new" ? "Start your journey" : m.resume ? "Resume attempt" : `Play stage ${m.nextStage}`;

  return (
    <section className="hv3-tile hv3-tileJourney" aria-labelledby="hv3j-label">
      <div className="hv3-tileHead">
        <span className="hv3-tileLabel hv3-cPurple" id="hv3j-label">
          <Map size={13} /> Your Journey
        </span>
        <span className="hv3j-headMeta">
          <span className="hv3j-progNum">{doneCount} / 100</span>
          <span className="hv3j-tier">Tier {m.tierIdx + 1} of 20</span>
        </span>
      </div>

      {/* Route map through the 5 tier stages */}
      <div className="hv3j-routeRow">
        {m.pathStages.map((s, i) => {
          const acc = m.completed[s];
          const isDone = acc !== undefined;
          const isCur = s === m.nextStage;
          const badge = isDone ? badgeFor(acc, gateFor(s)) : null;
          return (
            <React.Fragment key={s}>
              {i > 0 && <span className={`hv3j-seg ${m.pathStages[i - 1] < m.nextStage ? "hv3j-segFill" : ""}`} />}
              <span className="hv3j-node">
                <span className="hv3j-nodeTop">
                  {isDone ? (
                    <span className="hv3j-nodeDone" style={{ background: badge ? BADGE_COLORS[badge] : "#c4b5fd" }}>
                      {s}
                      {badge && badge !== "completion" && (
                        <Medal size={10} className="hv3j-nodeMedal" style={{ color: BADGE_COLORS[badge] }} />
                      )}
                    </span>
                  ) : isCur ? (
                    <span className="hv3j-nodeCur">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={rankIcon(m.tierIdx)} alt="" width={46} height={46} decoding="async" className="hv3j-nodeCurIcon" />
                    </span>
                  ) : (
                    <span className="hv3j-nodeLock"><Lock size={14} /></span>
                  )}
                </span>
                <span className={`hv3j-nodeCap ${isDone ? "hv3j-nodeAcc" : isCur ? "hv3j-nodeCapCur" : ""}`}>
                  {isDone ? `${acc}%` : isCur ? `Stage ${s}` : s}
                </span>
              </span>
            </React.Fragment>
          );
        })}
        <span className="hv3j-seg" />
        <span className="hv3j-node">
          <span className="hv3j-nodeTop">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rankIcon(m.tierIdx + 1)} alt="" width={40} height={40} decoding="async" className="hv3j-ghostIcon" />
          </span>
          <span className="hv3j-nodeCap hv3j-ghostCap">Stage {m.pathStages[4] + 1}</span>
        </span>
      </div>

      {/* Up next panel */}
      <div className="hv3j-up">
        <div className="hv3j-upTxt">
          <span className="hv3j-upKicker">Up next</span>
          <span className="hv3j-stageLabel">STAGE {m.nextStage}</span>
          <span className="hv3j-stageTitle">{meta.title}</span>
          <span className="hv3j-theme">{meta.theme}</span>
          <div className="hv3j-chips">
            <span className="hv3j-chip">5 rounds</span>
            <span className="hv3j-chip">Pass ≥ {gate}%</span>
            <span className="hv3j-chip">Difficulty {meta.difficulty}/10</span>
          </div>
          {m.resume && (
            <div className="hv3j-resume">
              <span className="hv3j-dots">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`hv3j-dot ${i < 2 ? "hv3j-dotDone" : i === 2 ? "hv3j-dotCur" : ""}`} />
                ))}
              </span>
              <span className="hv3j-resumeTxt">Round {DAILY_MOCK.roundInProgress} of 5</span>
              <span className="hv3j-lastTry">Last try 64% · need {gate}%</span>
            </div>
          )}
        </div>
        <div className="hv3j-upActions">
          <button type="button" className="hv3j-cta" onClick={() => onOpen(`/journey/${m.nextStage}`)}>
            <Play size={16} strokeWidth={2.5} /> {cta}
          </button>
          {m.resume && (
            <button type="button" className="hv3j-ctaGhost" onClick={() => onOpen(`/journey/${m.nextStage}`)}>
              Start new attempt
            </button>
          )}
        </div>
      </div>

      {state === "new" && (
        <p className="hv3j-explainer">Each stage is 5 rounds. Hit the accuracy gate to unlock the next one.</p>
      )}

      <div className="hv3j-foot">
        {state !== "new" && (
          <span className="hv3j-tally">
            {tally.gold} gold · {tally.silver} silver · {tally.bronze} bronze · {tally.completion} cleared
          </span>
        )}
        <button type="button" className="hv3j-viewAll" onClick={() => onOpen("/journey")}>
          View journey →
        </button>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DAILY tile — big countdown / result ring
// ════════════════════════════════════════════════════════════════════════════
const STATUS_META: Record<DailyState, { label: string; color: string }> = {
  new: { label: "NEW", color: "#22c55e" },
  playing: { label: "IN PROGRESS", color: "#f59e0b" },
  done: { label: "DONE", color: "#60a5fa" },
};

function DailyTile({ state, dateLabel, onOpen }: { state: DailyState; dateLabel: string | null; onOpen: (p: string) => void }) {
  const status = STATUS_META[state];
  const percentile = Math.ceil((DAILY_MOCK.doneRank / DAILY_MOCK.playingToday) * 100);

  return (
    <section className="hv3-tile hv3-tileDaily" aria-labelledby="hv3d-label">
      <div className="hv3-tileHead">
        <span className="hv3-tileLabel hv3-cRed" id="hv3d-label">
          <CalendarDays size={13} /> Daily
        </span>
        <span className="hv3d-headMeta">
          <span className="hv3d-date">{dateLabel ?? "—"}</span>
          <span
            className="hv3d-status"
            style={{ color: status.color, background: `${status.color}1f`, borderColor: `${status.color}66` }}
          >
            {status.label}
          </span>
        </span>
      </div>

      {state !== "done" ? (
        <div className="hv3d-center">
          <span className="hv3d-endsIn">Ends in</span>
          <DailyCountdown format="big" />
        </div>
      ) : (
        <div className="hv3d-result">
          <span className="hv3d-resRing" style={{ borderColor: getAccuracyColor(DAILY_MOCK.doneAcc), color: getAccuracyColor(DAILY_MOCK.doneAcc) }}>
            {DAILY_MOCK.doneAcc}%
          </span>
          <div className="hv3d-resTxt">
            <span className="hv3d-resXp">+{DAILY_MOCK.doneXp} XP</span>
            <span className="hv3d-resRank">#{DAILY_MOCK.doneRank} worldwide · Top {percentile}%</span>
          </div>
        </div>
      )}

      {state === "playing" && (
        <div className="hv3d-rounds">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`hv3d-dot ${i < 2 ? "hv3d-dotDone" : i === 2 ? "hv3d-dotCur" : ""}`} />
          ))}
          <span className="hv3d-roundTxt">Round {DAILY_MOCK.roundInProgress} of 5</span>
        </div>
      )}

      {state !== "done" ? (
        <button type="button" className="hv3d-cta" onClick={() => onOpen("/daily")}>
          <Play size={16} strokeWidth={2.5} /> {state === "playing" ? "Resume Daily" : "Play today\u2019s Daily"}
        </button>
      ) : (
        <>
          <button type="button" className="hv3d-ctaOutline" onClick={() => onOpen("/daily/game/mock/results")}>
            View results
          </button>
          <DailyCountdown format="line" prefix="Next Daily in" />
        </>
      )}

      <p className="hv3d-sub">5 events · same for everyone · {DAILY_MOCK.playingToday.toLocaleString()} playing today</p>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STREAK tile
// ════════════════════════════════════════════════════════════════════════════
function StreakTile({ state, weekDays }: { state: DailyState; weekDays: WeekDays }) {
  const streak = state === "done" ? DAILY_MOCK.streakBase + 1 : DAILY_MOCK.streakBase;
  return (
    <section className="hv3-tile hv3-tileStreak" aria-labelledby="hv3s-label">
      <div className="hv3-tileHead">
        <span className="hv3-tileLabel hv3-cAmber" id="hv3s-label">
          <Flame size={13} /> Streak
        </span>
        <span className="hv3s-best">Best {DAILY_MOCK.streakBest}</span>
      </div>
      <div className="hv3s-big">{streak}-day streak</div>
      <div className="hv3s-week">
        {weekDays === null
          ? Array.from({ length: 7 }, (_, i) => <span key={i} className="hv3s-day hv3s-dayEmpty" />)
          : weekDays.map((d, i) => (
              <span
                key={i}
                className={`hv3s-day ${!d.today || state === "done" ? "hv3s-dayDone" : "hv3s-dayToday"}`}
              >
                {d.initial}
              </span>
            ))}
      </div>
      {state !== "done" && (
        <span className="hv3s-nudge">Play today to keep your {DAILY_MOCK.streakBase}-day streak</span>
      )}
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEADERS tile
// ════════════════════════════════════════════════════════════════════════════
const LEADERS = [
  { rank: 1, name: "Mina K.", acc: 98 },
  { rank: 2, name: "Theo L.", acc: 97 },
  { rank: 3, name: "Sara B.", acc: 96 },
];

function LeadersTile({ state }: { state: DailyState }) {
  return (
    <section className="hv3-tile hv3-tileLeaders" aria-labelledby="hv3l-label">
      <div className="hv3-tileHead">
        <span className="hv3-tileLabel hv3-cGold" id="hv3l-label">
          <Trophy size={13} /> Leaders
        </span>
        <span className="hv3l-sub">Today&apos;s top</span>
      </div>
      <div className="hv3l-rows">
        {LEADERS.map((l) => (
          <div className={`hv3l-row ${l.rank === 1 ? "hv3l-top" : ""}`} key={l.rank}>
            <span className="hv3l-rank">{l.rank === 1 ? <Crown size={11} /> : l.rank}</span>
            <span className="hv3l-av">{l.name.split(" ").map((w) => w[0]).join("")}</span>
            <span className="hv3l-name">{l.name}</span>
            <span className="hv3l-acc" style={{ color: getAccuracyColor(l.acc) }}>{l.acc}%</span>
          </div>
        ))}
        {state === "done" ? (
          <div className="hv3l-row hv3l-me">
            <span className="hv3l-rank">{DAILY_MOCK.doneRank}</span>
            <span className="hv3l-av hv3l-avMe">AR</span>
            <span className="hv3l-name">You</span>
            <span className="hv3l-acc" style={{ color: getAccuracyColor(DAILY_MOCK.doneAcc) }}>{DAILY_MOCK.doneAcc}%</span>
          </div>
        ) : (
          <div className="hv3l-row hv3l-meMuted">
            <span className="hv3l-rank">—</span>
            <span className="hv3l-av hv3l-avMe">AR</span>
            <span className="hv3l-name">You</span>
            <span className="hv3l-accMuted">not played yet</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STATS tile
// ════════════════════════════════════════════════════════════════════════════
function StatsTile({ onOpen }: { onOpen: (p: string) => void }) {
  const stats: { v: string; l: string; color?: string }[] = [
    { v: "87%", l: "Accuracy", color: getAccuracyColor(87) },
    { v: "124,800", l: "XP" },
    { v: "642", l: "Rounds" },
    { v: "138", l: "Games" },
  ];
  return (
    <section className="hv3-tile hv3-tileStats" aria-labelledby="hv3st-label">
      <div className="hv3-tileHead">
        <span className="hv3-tileLabel hv3-cCyan" id="hv3st-label">
          <BarChart3 size={13} /> Stats
        </span>
        <span className="hv3st-sub">All-time</span>
      </div>
      <div className="hv3st-grid">
        {stats.map((s) => (
          <div className="hv3st-cell" key={s.l}>
            <span className="hv3st-v" style={s.color ? { color: s.color } : undefined}>{s.v}</span>
            <span className="hv3st-l">{s.l}</span>
          </div>
        ))}
      </div>
      <button type="button" className="hv3st-link" onClick={() => onOpen("/profile")}>
        View profile →
      </button>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MORE WAYS row
// ════════════════════════════════════════════════════════════════════════════
function MoreWaysTile({ onOpen }: { onOpen: (p: string) => void }) {
  const tiles: { title: string; desc: string; img: string; path: string; tint: string; badge?: string }[] = [
    { title: "Challenge", desc: "Play with friends", img: "/icons/compete_large.webp", path: "/compete",
      tint: "linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)", badge: "2 your turn" },
    { title: "Practice", desc: "Play solo · unlimited", img: "/icons/practice_large.webp", path: "/practice",
      tint: "linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)" },
  ];
  return (
    <section className="hv3-more hv3-tileMore" aria-labelledby="hv3m-title">
      <h2 id="hv3m-title" className="hv3m-title">More ways to play</h2>
      <div className="hv3m-grid">
        {tiles.map((t) => (
          <button key={t.path} type="button" className="hv3m-tile" style={{ background: t.tint }} onClick={() => onOpen(t.path)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.img} alt="" width={40} height={40} decoding="async" loading="lazy" />
            <span className="hv3m-txt">
              <span className="hv3m-name">{t.title}</span>
              <span className="hv3m-desc">{t.desc}</span>
            </span>
            {t.badge && <span className="hv3m-badge">{t.badge}</span>}
            <ChevronRight size={16} className="hv3m-chev" />
          </button>
        ))}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CSS
// ════════════════════════════════════════════════════════════════════════════
const CSS = `
  html, body { margin: 0; padding: 0; background: #0a0a0a; }

  .hv3-root {
    --hv3-gold: #f0c060;
    --hv3-daily: #ef4444;
    --hv3-purple: #a855f7;
    min-height: 100vh; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    position: relative;
  }
  .hv3-bg {
    position: fixed; inset: 0; z-index: -2;
    background: url("/home_background.webp") center / cover no-repeat;
  }
  .hv3-scrim {
    position: fixed; inset: 0; z-index: -1;
    background: linear-gradient(180deg, rgba(8,12,20,0.78) 0%, rgba(8,12,20,0.92) 100%);
  }
  @media (min-width: 768px) {
    .hv3-bg { background-image: url("/desktop-home_background.webp"); }
  }

  /* ── Proto controls ── */
  .hv3-proto {
    background: rgba(168,85,247,0.12);
    border-bottom: 1px solid rgba(168,85,247,0.3);
    font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6);
  }
  .hv3-protoInner {
    max-width: 1200px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
    padding: 8px 16px;
  }
  @media (min-width: 640px) { .hv3-protoInner { padding: 8px 24px; } }
  @media (min-width: 1024px) { .hv3-protoInner { padding: 8px 32px; } }
  .hv3-protoGroups { display: flex; flex-wrap: wrap; gap: 10px; }
  .hv3-seg {
    display: inline-flex; align-items: center; gap: 2px;
    padding: 2px; border-radius: 999px; background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
  }
  .hv3-segName { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; padding: 0 6px 0 8px; color: rgba(255,255,255,0.5); }
  .hv3-segBtn {
    border: 0; padding: 4px 12px; border-radius: 999px; cursor: pointer;
    font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); background: transparent;
  }
  .hv3-segOn { background: linear-gradient(135deg, #a855f7, #6b21a8); color: #fff; }

  /* ── Top bar ── */
  .hv3-top {
    position: sticky; top: 0; z-index: 40;
    background: rgba(10,10,14,0.72); backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .hv3-topInner {
    max-width: 1200px; margin: 0 auto; height: 56px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px;
  }
  @media (min-width: 640px) { .hv3-topInner { padding: 0 24px; } }
  @media (min-width: 1024px) { .hv3-topInner { padding: 0 32px; } }
  .hv3-topLeft { display: flex; align-items: center; gap: 10px; }
  .hv3-logo { height: 20px; width: auto; display: block; }
  @media (min-width: 768px) { .hv3-logo { height: 28px; } }
  .hv3-topRight { display: flex; align-items: center; gap: 10px; }
  .hv3-xpPill {
    padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 800;
    background: rgba(240,192,96,0.12); border: 1px solid rgba(240,192,96,0.4); color: var(--hv3-gold);
  }
  .hv3-xpShort { display: none; }
  @media (max-width: 479px) {
    .hv3-xpFull { display: none; }
    .hv3-xpShort { display: inline; }
  }
  .hv3-avatar {
    width: 36px; height: 36px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 900; color: #1a0d02;
    background: linear-gradient(135deg, #fb923c, #f97316);
  }

  /* ── Layout / bento grid ── */
  .hv3-wrap { max-width: 1200px; margin: 0 auto; padding: 16px; }
  @media (min-width: 640px) { .hv3-wrap { padding: 24px; } }
  @media (min-width: 1024px) { .hv3-wrap { padding: 32px; } }

  .hv3-helloRow { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .hv3-helloTxt { min-width: 0; }
  .hv3-hello { margin: 8px 0 2px; font-size: clamp(22px, 2.6vw, 30px); font-weight: 800; letter-spacing: -0.02em; }
  .hv3-tagline { margin: 0 0 18px; font-size: 14px; color: rgba(255,255,255,0.55); }
  .hv3-date { display: none; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.45); padding-bottom: 18px; flex-shrink: 0; }
  @media (min-width: 768px) { .hv3-date { display: block; } }

  .hv3-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
  /* Mobile order: time-boxed Daily first (unlike prod / home-v2), then Journey. */
  .hv3-tileDaily { order: 1; }
  .hv3-tileJourney { order: 2; }
  .hv3-tileStreak { order: 3; }
  .hv3-tileLeaders { order: 4; }
  .hv3-tileStats { order: 5; }
  .hv3-tileMore { order: 6; }

  @media (min-width: 640px) {
    .hv3-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
    .hv3-tileJourney { order: 0; grid-column: 1 / 7; grid-row: 1; }
    .hv3-tileDaily { order: 0; grid-column: 1 / 4; grid-row: 2; }
    .hv3-tileStreak { order: 0; grid-column: 4 / 7; grid-row: 2; }
    .hv3-tileLeaders { order: 0; grid-column: 1 / 4; grid-row: 3; }
    .hv3-tileStats { order: 0; grid-column: 4 / 7; grid-row: 3; }
    .hv3-tileMore { order: 0; grid-column: 1 / 7; grid-row: 4; }
  }
  @media (min-width: 1024px) {
    .hv3-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; }
    .hv3-tileJourney { grid-column: 1 / 9; grid-row: 1; }
    .hv3-tileDaily { grid-column: 9 / 13; grid-row: 1; }
    .hv3-tileStreak { grid-column: 1 / 5; grid-row: 2; }
    .hv3-tileLeaders { grid-column: 5 / 9; grid-row: 2; }
    .hv3-tileStats { grid-column: 9 / 13; grid-row: 2; }
    .hv3-tileMore { grid-column: 1 / 13; grid-row: 3; }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  /* ── Tile base — dark glass ── */
  .hv3-tile {
    position: relative; flex-shrink: 0; overflow: hidden;
    border-radius: 20px; padding: 16px;
    background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    border: 1px solid rgba(255,255,255,0.10);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.35);
    display: flex; flex-direction: column;
  }
  .hv3-tile::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--hv3-accent, transparent);
  }
  .hv3-tileJourney { --hv3-accent: linear-gradient(90deg, rgba(168,85,247,0.9), rgba(168,85,247,0.15)); container-type: inline-size; container-name: hv3j; }
  .hv3-tileDaily { --hv3-accent: linear-gradient(90deg, rgba(239,68,68,0.9), rgba(239,68,68,0.15)); }
  .hv3-tileStreak { --hv3-accent: linear-gradient(90deg, rgba(245,158,11,0.9), rgba(245,158,11,0.15)); }

  .hv3-tileHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .hv3-tileLabel {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase;
  }
  .hv3-tileLabel svg { display: block; }
  .hv3-cPurple { color: #c4b5fd; }
  .hv3-cRed { color: #f87171; }
  .hv3-cAmber { color: #fbbf24; }
  .hv3-cGold { color: var(--hv3-gold); }
  .hv3-cCyan { color: #22d3ee; }

  /* ── Journey tile ── */
  .hv3j-headMeta { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
  .hv3j-progNum { font-size: 12px; font-weight: 900; }
  .hv3j-tier { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.5); }

  .hv3j-routeRow { display: flex; align-items: flex-start; margin-top: 16px; }
  .hv3j-seg { flex: 1; min-width: 6px; height: 56px; display: flex; align-items: center; }
  .hv3j-seg::before {
    content: ""; display: block; width: 100%; height: 3px; border-radius: 999px;
    background: rgba(255,255,255,0.14);
  }
  .hv3j-segFill::before { background: linear-gradient(90deg, rgba(168,85,247,0.85), rgba(255,255,255,0.85)); }
  .hv3j-node { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
  .hv3j-nodeTop { height: 56px; display: flex; align-items: center; justify-content: center; }
  .hv3j-nodeDone {
    position: relative; width: 44px; height: 44px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 900; color: rgba(10,10,14,0.85);
  }
  .hv3j-nodeMedal { position: absolute; top: -4px; right: -7px; }
  .hv3j-nodeCur {
    width: 56px; height: 56px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(168,85,247,0.16); border: 2px solid var(--hv3-purple);
    animation: hv3PulsePurple 2s ease-out infinite;
  }
  .hv3j-nodeCurIcon { width: 38px; height: 38px; object-fit: contain; }
  @keyframes hv3PulsePurple {
    0% { box-shadow: 0 0 0 0 rgba(168,85,247,0.55); }
    70% { box-shadow: 0 0 0 14px rgba(168,85,247,0); }
    100% { box-shadow: 0 0 0 0 rgba(168,85,247,0); }
  }
  .hv3j-nodeLock {
    width: 44px; height: 44px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.30);
  }
  .hv3j-nodeCap { margin-top: 5px; font-size: 9px; font-weight: 800; color: rgba(255,255,255,0.4); white-space: nowrap; }
  .hv3j-nodeAcc { color: rgba(255,255,255,0.85); }
  .hv3j-nodeCapCur { color: #d8b4fe; }
  .hv3j-ghostIcon { filter: grayscale(1); opacity: 0.4; width: 40px; height: 40px; }
  .hv3j-ghostCap { color: rgba(255,255,255,0.4); }

  .hv3j-up {
    display: flex; flex-direction: column; gap: 12px; margin-top: 18px;
    padding: 14px; border-radius: 16px;
    background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.25);
  }
  .hv3j-upTxt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .hv3j-upKicker { font-size: 9px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(196,181,253,0.7); }
  .hv3j-stageLabel { font-size: 10px; font-weight: 900; letter-spacing: 1.4px; color: rgba(255,255,255,0.55); margin-top: 4px; }
  .hv3j-stageTitle { font-size: 20px; font-weight: 800; line-height: 1.1; }
  .hv3j-theme { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.55); }
  .hv3j-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
  .hv3j-chip {
    font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16);
  }
  .hv3j-resume { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
  .hv3j-dots { display: flex; gap: 4px; }
  .hv3j-dot {
    width: 8px; height: 8px; border-radius: 999px;
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2);
  }
  .hv3j-dotDone { background: var(--hv3-purple); border-color: var(--hv3-purple); }
  .hv3j-dotCur { border-color: var(--hv3-purple); box-shadow: 0 0 0 2px rgba(168,85,247,0.35); }
  .hv3j-resumeTxt { font-size: 12px; font-weight: 800; }
  .hv3j-lastTry { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); }
  .hv3j-upActions { display: flex; flex-direction: column; gap: 8px; }
  .hv3j-cta {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 0 22px; border-radius: 999px; border: 0; cursor: pointer;
    background: #fff; color: #6b21a8; font-size: 14px; font-weight: 900; width: 100%;
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  }
  .hv3j-ctaGhost {
    min-height: 44px; padding: 0 14px; border-radius: 999px; cursor: pointer;
    background: transparent; border: 1px solid rgba(255,255,255,0.3);
    color: #fff; font-size: 12px; font-weight: 700;
  }
  .hv3j-explainer { margin: 10px 0 0; font-size: 11.5px; color: rgba(255,255,255,0.55); }
  .hv3j-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 16px; }
  .hv3j-tally { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.65); }
  .hv3j-viewAll {
    min-height: 44px; padding: 0 8px; border: 0; background: transparent; cursor: pointer;
    font-size: 12px; font-weight: 800; color: #d8b4fe; margin-left: auto;
  }
  .hv3j-tally + .hv3j-viewAll { margin-left: 0; }

  @container hv3j (min-width: 560px) {
    .hv3j-nodeTop, .hv3j-seg { height: 68px; }
    .hv3j-nodeDone, .hv3j-nodeLock { width: 52px; height: 52px; }
    .hv3j-nodeCur { width: 68px; height: 68px; }
    .hv3j-nodeCurIcon { width: 46px; height: 46px; }
    .hv3j-up { flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; }
    .hv3j-upActions { flex-shrink: 0; }
    .hv3j-cta { width: auto; }
  }

  /* ── Daily tile ── */
  .hv3d-headMeta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .hv3d-date { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); }
  .hv3d-status {
    font-size: 9px; font-weight: 900; letter-spacing: 1px; padding: 4px 10px;
    border-radius: 999px; border: 1px solid; flex-shrink: 0;
  }
  .hv3d-center { margin-top: 16px; }
  .hv3d-endsIn { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: rgba(255,255,255,0.45); }
  .hv3d-countWrap { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
  .hv3d-countBig {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 34px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1;
  }
  .hv3d-daybar { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
  .hv3d-dayfill { display: block; height: 100%; border-radius: 999px; background: var(--hv3-daily); transition: width 0.5s ease; }
  .hv3d-countLine { display: block; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.55); margin-top: 10px; }

  .hv3d-rounds { display: flex; align-items: center; gap: 6px; margin-top: 14px; }
  .hv3d-dot {
    width: 10px; height: 10px; border-radius: 999px;
    background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.2);
  }
  .hv3d-dotDone { background: var(--hv3-daily); border-color: var(--hv3-daily); }
  .hv3d-dotCur { border-color: var(--hv3-daily); box-shadow: 0 0 0 2px rgba(239,68,68,0.35); }
  .hv3d-roundTxt { margin-left: 6px; font-size: 12px; font-weight: 800; }

  .hv3d-cta, .hv3d-ctaOutline {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 0 20px; border-radius: 999px; cursor: pointer;
    font-size: 14px; font-weight: 900; width: 100%; margin-top: 16px;
  }
  .hv3d-cta {
    border: 0; color: #fff;
    background: linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%);
    box-shadow: 0 6px 20px rgba(200,24,24,0.35);
  }
  .hv3d-ctaOutline { background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #fff; }

  .hv3d-result { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
  .hv3d-resRing {
    width: 56px; height: 56px; border-radius: 999px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 4px solid; font-size: 15px; font-weight: 900;
  }
  .hv3d-resTxt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .hv3d-resXp { font-size: 15px; font-weight: 900; color: var(--hv3-gold); }
  .hv3d-resRank { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); }
  .hv3d-sub { margin: auto 0 0; padding-top: 14px; font-size: 11px; color: rgba(255,255,255,0.45); }

  /* ── Streak tile ── */
  .hv3s-best { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.45); }
  .hv3s-big { margin-top: 14px; font-size: 26px; font-weight: 900; letter-spacing: -0.02em; }
  .hv3s-week { display: flex; gap: 6px; margin-top: 12px; }
  .hv3s-day {
    width: 26px; height: 26px; border-radius: 999px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800;
  }
  .hv3s-dayDone { background: var(--hv3-daily); color: #fff; }
  .hv3s-dayToday {
    border: 1px solid var(--hv3-daily); color: var(--hv3-daily);
    animation: hv3PulseRed 2s ease-out infinite;
  }
  .hv3s-dayEmpty { border: 1px solid rgba(255,255,255,0.12); }
  @keyframes hv3PulseRed {
    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
    70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .hv3s-nudge { margin-top: 12px; font-size: 11px; font-weight: 600; color: #f59e0b; }

  /* ── Leaders tile ── */
  .hv3l-sub { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.45); }
  .hv3l-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
  .hv3l-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,0.03);
  }
  .hv3l-top { background: rgba(240,192,96,0.10); border: 1px solid rgba(240,192,96,0.3); }
  .hv3l-top .hv3l-rank { color: var(--hv3-gold); }
  .hv3l-me { background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.35); }
  .hv3l-meMuted { opacity: 0.55; }
  .hv3l-rank {
    width: 22px; font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.5);
    display: inline-flex; align-items: center;
  }
  .hv3l-av {
    width: 22px; height: 22px; border-radius: 999px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 900; background: rgba(255,255,255,0.12);
  }
  .hv3l-avMe { background: linear-gradient(135deg, #fb923c, #f97316); color: #1a0d02; }
  .hv3l-name { flex: 1; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hv3l-acc { font-size: 12px; font-weight: 900; }
  .hv3l-accMuted { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.4); }

  /* ── Stats tile ── */
  .hv3st-sub { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.45); }
  .hv3st-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
  .hv3st-cell {
    display: flex; flex-direction: column; gap: 1px; padding: 10px 12px;
    border-radius: 12px; background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .hv3st-v { font-size: 17px; font-weight: 900; }
  .hv3st-l { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.6px; }
  .hv3st-link {
    align-self: flex-end; min-height: 44px; padding: 0 4px; margin-top: 4px;
    border: 0; background: transparent; cursor: pointer;
    font-size: 12px; font-weight: 800; color: #67e8f9;
  }

  /* ── More ways ── */
  .hv3m-title { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(255,255,255,0.6); }
  .hv3m-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hv3m-tile {
    display: flex; align-items: center; gap: 12px; min-height: 72px;
    padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.14);
    cursor: pointer; text-align: left; color: #fff; position: relative;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .hv3m-tile img { flex-shrink: 0; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35)); }
  .hv3m-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .hv3m-name { font-size: 14px; font-weight: 800; }
  .hv3m-desc { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); }
  .hv3m-badge {
    position: absolute; top: -7px; right: 10px;
    font-size: 9px; font-weight: 900; padding: 2px 8px; border-radius: 999px;
    background: #ef4444; color: #fff; box-shadow: 0 3px 8px rgba(0,0,0,0.4);
  }
  .hv3m-chev { flex-shrink: 0; opacity: 0.6; }

  /* ── Toast ── */
  .hv3-toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 80;
    padding: 10px 18px; border-radius: 999px;
    background: rgba(20,20,26,0.95); border: 1px solid rgba(168,85,247,0.5);
    color: #e9d5ff; font-size: 12px; font-weight: 700; white-space: nowrap;
    animation: hv3ToastIn 0.25s ease;
  }
  @keyframes hv3ToastIn {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .hv3-root *, .hv3-root *::before, .hv3-root *::after {
      animation: none !important;
      transition: none !important;
    }
  }
`;
