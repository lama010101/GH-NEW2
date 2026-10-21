"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home V2 (Journey & Daily focus)
// Route: /prototype/home-v2   (direct access, self-contained, mock data)
//
// Improvements over the prod home stack:
//   Journey — stage title + theme, accuracy gate, rounds count, difficulty,
//             5-node tier path with per-stage badges, resume state
//   Daily   — explicit status chip, streak (current/best + week strip),
//             rank & percentile when done, live countdown to 10:00 UTC rollover
//   Layout  — real desktop grid (7fr/5fr) + container queries inside cards;
//             prod just widens the same column to 600px.
//
// Styling: one CSS string, .hv2-* classes, normal document scroll.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Lock,
  Medal,
  ChevronRight,
  Trash2,
  Plus,
} from "lucide-react";
import { getAccuracyColor } from "@/core/accuracyColor";
import { getNextDailyRollover, getDailyChallengeDate } from "@/core/dailyDate";
import TopBar from "@/components/layout/TopBar";
import { NavModal } from "@/components/NavModal";

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
const DAILY_MOCK = { playingToday: 3218, doneAcc: 86, doneXp: 812, doneRank: 142, streakBase: 12, roundInProgress: 3 };

// ── Practice mock (mirrors PracticeSettingsModal fields) ────────────────────
type PracticeState = "new" | "playing";
const PRACTICE_MOCK = { roundInProgress: 2, timerSec: 120, eras: 3, erasTotal: 5, regions: 6, regionsTotal: 6 };

// ── Time-dependent bits (client-only, post-mount) ────────────────────────────
function msToParts(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

function DailyCountdown({ prefix }: { prefix: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <span className="hv2d-countBadge">—</span>;
  const ms = getNextDailyRollover(new Date(now)).getTime() - now;
  const { h, m } = msToParts(ms);
  return <span className="hv2d-countBadge">{prefix} {h}h {m}m</span>;
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

// ════════════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════════════
export default function HomeV2Page() {
  const [journeyState, setJourneyState] = useState<JourneyState>("mid");
  const [dailyState, setDailyState] = useState<DailyState>("new");
  const [practiceState, setPracticeState] = useState<PracticeState>("playing");
  const [showNavModal, setShowNavModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = (path: string) => {
    setToast(`Prototype — would open ${path}`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  return (
    <main className="hv2-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hv2-bg" />
      <div className="hv2-scrim" />

      {/* Proto controls — not sticky */}
      <div className="hv2-proto" data-proto>
        <div className="hv2-protoInner">
          <span className="hv2-protoLabel">Prototype · Home V2 · mock data</span>
          <div className="hv2-protoGroups">
          <span className="hv2-seg">
            <span className="hv2-segName">Journey</span>
            {(["new", "mid", "resume"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setJourneyState(s)}
                className={`hv2-segBtn ${journeyState === s ? "hv2-segOn" : ""}`}>
                {s === "new" ? "New" : s === "mid" ? "Mid" : "Resume"}
              </button>
            ))}
          </span>
          <span className="hv2-seg">
            <span className="hv2-segName">Daily</span>
            {(["new", "playing", "done"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setDailyState(s)}
                className={`hv2-segBtn ${dailyState === s ? "hv2-segOn" : ""}`}>
                {s === "new" ? "New" : s === "playing" ? "Playing" : "Done"}
              </button>
            ))}
          </span>
          <span className="hv2-seg">
            <span className="hv2-segName">Practice</span>
            {(["new", "playing"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setPracticeState(s)}
                className={`hv2-segBtn ${practiceState === s ? "hv2-segOn" : ""}`}>
                {s === "new" ? "New" : "Playing"}
              </button>
            ))}
          </span>
          </div>
        </div>
      </div>

      {/* Prod top bar — real component, mock props */}
      <TopBar
        accuracy="87"
        xp="124800"
        avatarUrl={null}
        initials="AR"
        onAvatarClick={() => setShowNavModal(true)}
      />
      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={null}
        initials="AR"
        displayName="Alex Rivera"
      />

      <div className="hv2-wrap">
        <h1 className="hv2-hello">Where and when did it happen?</h1>

        <div className="hv2-grid">
          <JourneyCard state={journeyState} onOpen={open} />
          <ChallengeCard onOpen={open} />
          <DailyCard state={dailyState} onOpen={open} />
          <PracticeCard state={practiceState} onOpen={open} />
        </div>
      </div>

      {toast && <div className="hv2-toast">{toast}</div>}
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// JOURNEY card
// ════════════════════════════════════════════════════════════════════════════
function JourneyCard({ state, onOpen }: { state: JourneyState; onOpen: (p: string) => void }) {
  const m = journeyModel(state);
  const meta = STAGE_META[m.nextStage];
  const gate = Math.round(gateFor(m.nextStage));
  const doneCount = Object.keys(m.completed).length;

  const cta = state === "new" ? "Start your journey" : m.resume ? "Resume attempt" : `Play stage ${m.nextStage}`;

  return (
    <section className="hv2-journey" aria-labelledby="hv2j-title">
      {/* Header */}
      <div className="hv2j-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/levels_large.webp" alt="" width={64} height={64} decoding="async" className="hv2j-headIcon" />
        <div className="hv2j-headTxt">
          <span className="hv2j-kicker">YOUR JOURNEY</span>
          <h2 id="hv2j-title" className="hv2j-sub">How far can you time travel?</h2>
        </div>
        <div className="hv2j-prog">
          <MiniRing44 done={doneCount} />
          <span className="hv2j-progNum">{doneCount}/100</span>
        </div>
      </div>

      {/* Tier path — route-map style ported from prototype/home-v3 */}
      <button type="button" className="hv2j-path" onClick={() => onOpen("/journey")} aria-label="View journey">
        <span className="hv2j-pathRow">
          {m.pathStages.map((s, i) => {
            const acc = m.completed[s];
            const isDone = acc !== undefined;
            const isCur = s === m.nextStage;
            const badge = isDone ? badgeFor(acc, gateFor(s)) : null;
            return (
              <React.Fragment key={s}>
                {i > 0 && <span className={`hv2j-seg ${m.pathStages[i - 1] < m.nextStage ? "hv2j-segFill" : ""}`} />}
                <span className="hv2j-node">
                  <span className="hv2j-nodeTop">
                    {isDone ? (
                      <span className="hv2j-nodeIcon" style={{ borderColor: badge ? BADGE_COLORS[badge] : "#c4b5fd" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={rankIcon(Math.floor((s - 1) / 5))} alt="" width={40} height={40} decoding="async" className="hv2j-nodeIconImg" />
                        <span className="hv2j-nodeNum">{s}</span>
                        {badge && badge !== "completion" && (
                          <Medal size={10} className="hv2j-nodeMedal" style={{ color: BADGE_COLORS[badge] }} />
                        )}
                      </span>
                    ) : isCur ? (
                      <span className="hv2j-nodeCur">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={rankIcon(Math.floor((s - 1) / 5))} alt="" width={46} height={46} decoding="async" className="hv2j-nodeCurIcon" />
                        <span className="hv2j-nodeNum">{s}</span>
                      </span>
                    ) : (
                      <span className="hv2j-nodeIcon hv2j-nodeIconLock">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={rankIcon(Math.floor((s - 1) / 5))} alt="" width={40} height={40} decoding="async" className="hv2j-nodeIconImg" />
                        <span className="hv2j-nodeLockOver"><Lock size={14} /></span>
                      </span>
                    )}
                  </span>
                  <span className={`hv2j-nodeCap ${isDone ? "hv2j-nodeAcc" : isCur ? "hv2j-nodeCapCur" : ""}`}>
                    {isDone ? `${acc}%` : isCur ? `Stage ${s}` : s}
                  </span>
                </span>
              </React.Fragment>
            );
          })}
          <span className="hv2j-seg" />
          <span className="hv2j-node">
            <span className="hv2j-nodeTop">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rankIcon(m.tierIdx + 1)} alt="" width={40} height={40} decoding="async" className="hv2j-ghostIcon" />
            </span>
            <span className="hv2j-nodeCap hv2j-ghostCap">Stage {m.pathStages[4] + 1}</span>
          </span>
        </span>
      </button>

      {/* Up next */}
      <div className="hv2j-up">
        <div className="hv2j-iconWrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={rankIcon(m.tierIdx)} alt="" width={96} height={96} decoding="async" className="hv2j-icon" />
        </div>
        <div className="hv2j-upInfo">
          <div className="hv2j-upTop">
            <span className="hv2j-upKicker">Up next</span>
            <span className="hv2j-stageLabel">STAGE {m.nextStage}</span>
          </div>
          <span className="hv2j-stageTitle">{meta.title}</span>
          <span className="hv2j-theme">{meta.theme}</span>
          <div className="hv2j-chips">
            <span className="hv2j-chip">5 rounds</span>
            <span className="hv2j-chip">Pass ≥ {gate}%</span>
            <span className="hv2j-chip">Difficulty {meta.difficulty}/10</span>
          </div>
        </div>
      </div>

      {m.resume && (
        <div className="hv2j-resume">
          <span className="hv2j-dots">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`hv2j-dot ${i < 2 ? "hv2j-dotDone" : i === 2 ? "hv2j-dotCur" : ""}`} />
            ))}
          </span>
          <span className="hv2j-resumeTxt">Round 3 of 5</span>
          <span className="hv2j-lastTry">Last try 64% · need {gate}%</span>
        </div>
      )}

      <div className="hv2j-ctaRow">
        <button type="button" className="hv2j-cta" onClick={() => onOpen(`/journey/${m.nextStage}`)}>
          <Play size={16} strokeWidth={2.5} /> {cta}
        </button>
        {m.resume && (
          <button type="button" className="hv2j-ctaGhost" onClick={() => onOpen(`/journey/${m.nextStage}`)}>
            Start new attempt
          </button>
        )}
      </div>

      {state === "new" && (
        <p className="hv2j-explainer">Each stage is 5 rounds. Hit the accuracy gate to unlock the next one.</p>
      )}

    </section>
  );
}

function MiniRing44({ done }: { done: number }) {
  const size = 44;
  const sw = 5;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const pct = done / 100;
  return (
    <span className="hv2j-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - pct * c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="hv2j-ringVal">{Math.round(pct * 100)}%</span>
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DAILY card
// ════════════════════════════════════════════════════════════════════════════
const STATUS_META: Record<DailyState, { label: string; color: string }> = {
  new: { label: "NEW", color: "#22c55e" },
  playing: { label: "IN PROGRESS", color: "#f59e0b" },
  done: { label: "DONE", color: "#60a5fa" },
};

function DailyCard({ state, onOpen }: { state: DailyState; onOpen: (p: string) => void }) {
  const { weekDays } = useToday();
  const status = STATUS_META[state];
  const streak = state === "done" ? DAILY_MOCK.streakBase + 1 : DAILY_MOCK.streakBase;
  const percentile = Math.ceil((DAILY_MOCK.doneRank / DAILY_MOCK.playingToday) * 100);

  return (
    <section className="hv2-daily" aria-labelledby="hv2d-title">
      <div className="hv2d-inner">
        {/* Header */}
        <div className="hv2d-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/daily_large.webp" alt="" width={64} height={64} decoding="async" className="hv2d-icon" />
          <div className="hv2d-headTxt">
            <h2 id="hv2d-title" className="hv2d-title">DAILY</h2>
            <span className="hv2d-date">same difficulty for everyone</span>
          </div>
          <div className="hv2d-headRight">
            {state !== "new" && (
              <span
                className="hv2d-status"
                style={{ color: status.color, background: "rgba(0,0,0,0.32)", borderColor: status.color }}
              >
                {status.label}
              </span>
            )}
            <DailyCountdown prefix={state === "done" ? "Next Daily in" : "Ends in"} />
          </div>
        </div>

        <div className="hv2d-body">
          <div className="hv2d-main">
            {state === "new" && (
              <>
                <button type="button" className="hv2d-cta" onClick={() => onOpen("/daily")}>
                  <Play size={16} strokeWidth={2.5} /> Play today&apos;s Daily
                </button>
              </>
            )}

            {state === "playing" && (
              <>
                <div className="hv2d-rounds">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={`hv2d-dot ${i < 2 ? "hv2d-dotDone" : i === 2 ? "hv2d-dotCur" : ""}`} />
                  ))}
                  <span className="hv2d-roundTxt">Round {DAILY_MOCK.roundInProgress} of 5</span>
                </div>
                <button type="button" className="hv2d-cta" onClick={() => onOpen("/daily")}>
                  <Play size={16} strokeWidth={2.5} /> Resume Daily
                </button>
              </>
            )}

            {state === "done" && (
              <>
                <div className="hv2d-result">
                  <span className="hv2d-resRing" style={{ borderColor: getAccuracyColor(DAILY_MOCK.doneAcc), color: getAccuracyColor(DAILY_MOCK.doneAcc) }}>
                    {DAILY_MOCK.doneAcc}%
                  </span>
                  <div className="hv2d-resTxt">
                    <span className="hv2d-resXp">+{DAILY_MOCK.doneXp} XP</span>
                    <span className="hv2d-resRank">#{DAILY_MOCK.doneRank} worldwide · Top {percentile}%</span>
                  </div>
                </div>
                <button type="button" className="hv2d-ctaOutline" onClick={() => onOpen("/daily/game/mock/results")}>
                  View results
                </button>
              </>
            )}

            {/* Streak + week on one line */}
            <div className="hv2d-streakRow">
              <div className="hv2d-streak">
                <span className="hv2d-streakBadge">🔥 {streak}</span>
                <span className="hv2d-streakTxt">streak</span>
              </div>
              <div className="hv2d-week">
                {weekDays === null
                  ? Array.from({ length: 7 }, (_, i) => <span key={i} className="hv2d-day hv2d-dayEmpty" />)
                  : weekDays.map((d, i) => (
                      <span
                        key={i}
                        className={`hv2d-day ${!d.today ? "hv2d-dayDone" : state === "done" ? "hv2d-dayDone" : "hv2d-dayToday"}`}
                      >
                        {d.initial}
                      </span>
                    ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CHALLENGE card — mirrors prod CompetePanel: 3 tabs, collapsed by default,
// click a tab title to expand its content. Mock data.
// ════════════════════════════════════════════════════════════════════════════
type ChallengeTab = "invitations" | "your_turn" | "completed";

const CHALLENGE_MOCK = {
  invitations: [
    { name: "Mina K.", mode: "Anytime", sub: "sent 2h ago" },
    { name: "Theo L.", mode: "Live", sub: "sent 5h ago" },
  ],
  your_turn: [
    { name: "Sara B.", mode: "Anytime", sub: "Round 3 of 5" },
    { name: "Mina K.", mode: "Live", sub: "Round 1 of 5" },
  ],
  completed: [
    { name: "Theo L.", mode: "Anytime", sub: "1d ago", acc: 92, rank: "#3" },
    { name: "Sara B.", mode: "Live", sub: "3d ago", acc: 78, rank: "#12" },
  ],
};

function ChallengeCard({ onOpen }: { onOpen: (p: string) => void }) {
  const [openTabs, setOpenTabs] = useState<ChallengeTab[]>([]);
  // Desktop only: invitations + your turn expanded by default (mobile stays collapsed)
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setOpenTabs(["invitations", "your_turn"]);
  }, []);
  const tabs: { key: ChallengeTab; title: string; count: number }[] = [
    { key: "invitations", title: "Invitations", count: CHALLENGE_MOCK.invitations.length },
    { key: "your_turn", title: "Your turn", count: CHALLENGE_MOCK.your_turn.length },
    { key: "completed", title: "Completed", count: CHALLENGE_MOCK.completed.length },
  ];
  const initialsOf = (name: string) => name.split(" ").map((w) => w[0]).join("");

  return (
    <section className="hv2-challenge" aria-labelledby="hv2c-title">
      <div className="hv2c-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/compete_large.webp" alt="" width={64} height={64} decoding="async" className="hv2c-icon" />
        <div className="hv2c-headTxt">
          <h2 id="hv2c-title" className="hv2c-title">CHALLENGE</h2>
          <span className="hv2c-sub">Play with friends</span>
        </div>
        <button type="button" className="hv2c-create" onClick={() => onOpen("/compete")}>
          <Plus size={16} strokeWidth={2.5} /> Create
        </button>
      </div>

      <div className="hv2c-tabs">
        {tabs.map((t) => {
          const openT = openTabs.includes(t.key);
          return (
            <div className="hv2c-tab" key={t.key}>
              <button
                type="button"
                className="hv2c-tabHead"
                onClick={() => setOpenTabs((prev) => openT ? prev.filter((k) => k !== t.key) : [...prev, t.key])}
                aria-expanded={openT}
              >
                <span className="hv2c-tabTitle">{t.title}</span>
                {t.count > 0 && <span className="hv2c-tabCount">{t.count}</span>}
                <ChevronRight size={16} className={`hv2c-tabChev ${openT ? "hv2c-tabChevOpen" : ""}`} />
              </button>

              {openT && t.key === "invitations" && (
                <div className="hv2c-tabBody">
                  {CHALLENGE_MOCK.invitations.map((r) => (
                    <div className="hv2c-row" key={r.name}>
                      <span className="hv2c-av">{initialsOf(r.name)}</span>
                      <div className="hv2c-info">
                        <span className="hv2c-name">{r.name}</span>
                        <span className="hv2c-rowSub"><span className="hv2c-mode">{r.mode}</span> {r.sub}</span>
                      </div>
                      <button type="button" className="hv2c-go" onClick={() => onOpen("/compete")} aria-label="Play"><Play size={14} strokeWidth={2.5} /></button>
                      <button type="button" className="hv2c-del" aria-label="Delete"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}

              {openT && t.key === "your_turn" && (
                <div className="hv2c-tabBody">
                  {CHALLENGE_MOCK.your_turn.map((r) => (
                    <div className="hv2c-row" key={r.name}>
                      <span className="hv2c-av">{initialsOf(r.name)}</span>
                      <div className="hv2c-info">
                        <span className="hv2c-name">{r.name}</span>
                        <span className="hv2c-rowSub"><span className="hv2c-mode">{r.mode}</span> {r.sub}</span>
                      </div>
                      <button type="button" className="hv2c-go" onClick={() => onOpen("/compete")} aria-label="Play"><Play size={14} strokeWidth={2.5} /></button>
                    </div>
                  ))}
                </div>
              )}

              {openT && t.key === "completed" && (
                <div className="hv2c-tabBody">
                  {CHALLENGE_MOCK.completed.map((r) => (
                    <div className="hv2c-row" key={r.name}>
                      <span className="hv2c-av">{initialsOf(r.name)}</span>
                      <div className="hv2c-info">
                        <span className="hv2c-name">{r.name}</span>
                        <span className="hv2c-rowSub"><span className="hv2c-mode">{r.mode}</span> {r.sub}</span>
                      </div>
                      <span className="hv2c-acc" style={{ color: getAccuracyColor(r.acc) }}>{r.acc}%</span>
                      <span className="hv2c-rank">{r.rank}</span>
                      <button type="button" className="hv2c-del" aria-label="Delete"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PRACTICE card
// ════════════════════════════════════════════════════════════════════════════
function PracticeCard({ state, onOpen }: { state: PracticeState; onOpen: (p: string) => void }) {
  const playing = state === "playing";
  const timerSec = PRACTICE_MOCK.timerSec;
  const timerLabel = timerSec === 0 ? "off" : `${Math.floor(timerSec / 60)}m ${String(timerSec % 60).padStart(2, "0")}s`;
  return (
    <section className="hv2-more">
      <div
        className="hv2m-tile"
        style={{ background: "linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/practice_large.webp" alt="" width={64} height={64} decoding="async" loading="lazy" />
        <span className="hv2m-txt">
          <span className="hv2m-name">Practice</span>
          <span className="hv2m-desc">Play solo · unlimited</span>
          {playing && (
            <span className="hv2m-rounds">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`hv2m-dot ${i < PRACTICE_MOCK.roundInProgress - 1 ? "hv2m-dotDone" : i === PRACTICE_MOCK.roundInProgress - 1 ? "hv2m-dotCur" : ""}`} />
              ))}
              <span className="hv2m-roundTxt">Round {PRACTICE_MOCK.roundInProgress} of 5</span>
            </span>
          )}
          {/* Desktop only — settings of the game (timer, eras, regions) */}
          <span className="hv2m-settings">
            <span className="hv2m-chip">⏱ {timerLabel}</span>
            <span className="hv2m-chip">{PRACTICE_MOCK.eras}/{PRACTICE_MOCK.erasTotal} eras</span>
            <span className="hv2m-chip">{PRACTICE_MOCK.regions}/{PRACTICE_MOCK.regionsTotal} regions</span>
          </span>
        </span>
        <button type="button" className="hv2m-play" onClick={() => onOpen("/practice")}>
          <Play size={13} strokeWidth={2.5} /> {playing ? "Resume" : "Play"}
        </button>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CSS
// ════════════════════════════════════════════════════════════════════════════
const CSS = `
  html, body { margin: 0; padding: 0; background: #0a0a0a; }

  .hv2-root {
    --hv2-gold: #f0c060;
    --hv2-silver: #cbd5e1;
    --hv2-bronze: #d97706;
    --hv2-completion: #c4b5fd;
    --hv2-daily: #ef4444;
    --hv2-glass: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    --hv2-border: rgba(255,255,255,0.10);
    min-height: 100vh; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    position: relative;
    /* Prod TopBar is position:fixed (~56px + safe-area) — reserve space below it. */
    padding-top: calc(56px + env(safe-area-inset-top, 0px));
    box-sizing: border-box;
  }
  .hv2-bg {
    position: fixed; inset: 0; z-index: -2;
    background: url("/home_background.webp") center / cover no-repeat;
  }
  .hv2-scrim {
    position: fixed; inset: 0; z-index: -1;
    background: linear-gradient(180deg, rgba(8,12,20,0.78) 0%, rgba(8,12,20,0.92) 100%);
  }
  @media (min-width: 768px) {
    .hv2-bg { background-image: url("/desktop-home_background.webp"); }
  }

  /* ── Proto controls ── */
  .hv2-proto {
    background: rgba(147,51,234,0.12);
    border-bottom: 1px solid rgba(147,51,234,0.3);
    font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6);
  }
  .hv2-protoInner {
    max-width: 1200px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
    padding: 8px 16px;
  }
  @media (min-width: 640px) { .hv2-protoInner { padding: 8px 24px; } }
  @media (min-width: 1024px) { .hv2-protoInner { padding: 8px 32px; } }
  .hv2-protoGroups { display: flex; flex-wrap: wrap; gap: 10px; }
  .hv2-seg {
    display: inline-flex; align-items: center; gap: 2px;
    padding: 2px; border-radius: 999px; background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
  }
  .hv2-segName { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; padding: 0 6px 0 8px; color: rgba(255,255,255,0.5); }
  .hv2-segBtn {
    border: 0; padding: 4px 12px; border-radius: 999px; cursor: pointer;
    font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); background: transparent;
  }
  .hv2-segOn { background: linear-gradient(135deg, #9333ea, #6b21a8); color: #fff; }

  /* ── Layout ── */
  .hv2-wrap { max-width: 1200px; margin: 0 auto; padding: 16px; }
  @media (min-width: 640px) { .hv2-wrap { padding: 24px; } }
  @media (min-width: 1024px) { .hv2-wrap { padding: 32px; } }
  .hv2-hello { margin: 8px 0 18px; font-size: clamp(22px, 2.6vw, 30px); font-weight: 800; letter-spacing: -0.02em; text-align: center; }

  .hv2-grid { display: flex; flex-direction: column; gap: 14px; }
  @media (min-width: 640px) and (max-width: 1023px) {
    .hv2-grid { max-width: 720px; margin: 0 auto; }
  }
  @media (min-width: 1024px) {
    .hv2-grid {
      display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: 20px; align-items: stretch;
    }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  /* ── Journey card ── */
  .hv2-journey {
    container-type: inline-size; container-name: hv2journey;
    border-radius: 20px; padding: 20px; position: relative; overflow: hidden;
    background: linear-gradient(135deg, #3b0764 0%, #6b21a8 55%, #9333ea 100%);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 12px 40px rgba(59,7,100,0.45);
    display: flex; flex-direction: column;
  }
  .hv2j-head { display: flex; align-items: center; gap: 12px; }
  .hv2j-headIcon { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.35)); }
  .hv2j-headTxt { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .hv2j-kicker { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
  .hv2j-sub { margin: 3px 0 0; font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); }
  .hv2j-prog { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
  .hv2j-progNum { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.75); }
  .hv2j-ring { position: relative; display: inline-flex; align-items: center; justify-content: center; }
  .hv2j-ringVal { position: absolute; font-size: 9px; font-weight: 800; }

  .hv2j-up {
    display: flex; align-items: center; gap: 16px; margin-top: 18px;
    padding: 14px; border-radius: 16px;
    background: rgba(0,0,0,0.16); border: 1px solid rgba(255,255,255,0.10);
  }
  .hv2j-upTop { display: flex; align-items: baseline; gap: 8px; }
  .hv2j-upKicker { font-size: 9px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #d8b4fe; }
  .hv2j-iconWrap {
    position: relative; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    width: 88px; height: 88px;
  }
  .hv2j-iconWrap::before {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%);
  }
  .hv2j-icon { width: 72px; height: 72px; object-fit: contain; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.4)); }
  .hv2j-upInfo { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .hv2j-stageLabel { font-size: 10px; font-weight: 900; letter-spacing: 1.4px; color: rgba(255,255,255,0.6); }
  .hv2j-stageTitle { font-size: 22px; font-weight: 800; line-height: 1.1; }
  .hv2j-theme { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); }
  .hv2j-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .hv2j-chip {
    font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
    background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.18);
  }

  .hv2j-resume { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .hv2j-dots { display: flex; gap: 4px; }
  .hv2j-dot {
    width: 8px; height: 8px; border-radius: 999px;
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2);
  }
  .hv2j-dotDone { background: #fff; border-color: #fff; }
  .hv2j-dotCur { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.35); }
  .hv2j-resumeTxt { font-size: 12px; font-weight: 800; }
  .hv2j-lastTry { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.55); }

  .hv2j-ctaRow { display: flex; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
  .hv2j-cta {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 0 22px; border-radius: 999px; border: 0; cursor: pointer;
    background: #fff; color: #6b21a8; font-size: 14px; font-weight: 900; flex: 1;
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  }
  .hv2j-ctaGhost {
    min-height: 44px; padding: 0 14px; border-radius: 999px; cursor: pointer;
    background: transparent; border: 1px solid rgba(255,255,255,0.35);
    color: #fff; font-size: 12px; font-weight: 700;
  }
  .hv2j-explainer { margin: 10px 0 0; font-size: 11.5px; color: rgba(255,255,255,0.6); }

  .hv2j-path {
    display: block; width: 100%; margin-top: 20px; padding: 0;
    border: 0; background: transparent; cursor: pointer; color: inherit; font: inherit;
  }
  .hv2j-pathRow { display: flex; align-items: flex-start; }
  .hv2j-seg { flex: 1; min-width: 6px; height: 56px; display: flex; align-items: center; }
  .hv2j-seg::before {
    content: ""; display: block; width: 100%; height: 3px; border-radius: 999px;
    background: rgba(255,255,255,0.14);
  }
  .hv2j-segFill::before { background: linear-gradient(90deg, rgba(168,85,247,0.85), rgba(255,255,255,0.85)); }
  .hv2j-node { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
  .hv2j-nodeTop { height: 56px; display: flex; align-items: center; justify-content: center; }
  .hv2j-nodeIcon {
    position: relative; width: 44px; height: 44px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid transparent;
  }
  .hv2j-nodeIconImg { width: 40px; height: 40px; object-fit: contain; }
  .hv2j-nodeNum {
    position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%);
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
    background: #fff; color: #4c1d95; font-size: 10px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
  }
  .hv2j-nodeMedal { position: absolute; top: -4px; right: -7px; }
  .hv2j-nodeCur {
    position: relative; width: 56px; height: 56px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(168,85,247,0.16); border: 2px solid #a855f7;
    animation: hv2PulsePurple 2s ease-out infinite;
  }
  .hv2j-nodeCurIcon { width: 38px; height: 38px; object-fit: contain; }
  @keyframes hv2PulsePurple {
    0% { box-shadow: 0 0 0 0 rgba(168,85,247,0.55); }
    70% { box-shadow: 0 0 0 14px rgba(168,85,247,0); }
    100% { box-shadow: 0 0 0 0 rgba(168,85,247,0); }
  }
  .hv2j-nodeIconLock .hv2j-nodeIconImg { opacity: 0.25; filter: grayscale(0.6); }
  .hv2j-nodeLockOver {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.55);
  }
  .hv2j-nodeCap { margin-top: 5px; font-size: 9px; font-weight: 800; color: rgba(255,255,255,0.4); white-space: nowrap; }
  .hv2j-nodeAcc { color: rgba(255,255,255,0.85); }
  .hv2j-nodeCapCur { color: #d8b4fe; }
  .hv2j-ghostIcon { filter: grayscale(1); opacity: 0.4; width: 40px; height: 40px; }
  .hv2j-ghostCap { color: rgba(255,255,255,0.4); }

  @container hv2journey (min-width: 560px) {
    .hv2j-icon { width: 96px; height: 96px; }
    .hv2j-iconWrap { width: 112px; height: 112px; }
    .hv2j-cta { width: auto; }
    .hv2j-nodeTop, .hv2j-seg { height: 68px; }
    .hv2j-nodeIcon { width: 52px; height: 52px; }
    .hv2j-nodeIconImg { width: 48px; height: 48px; }
    .hv2j-nodeCur { width: 68px; height: 68px; }
    .hv2j-nodeCurIcon { width: 46px; height: 46px; }
  }

  /* ── Daily card ── */
  .hv2-daily {
    container-type: inline-size; container-name: hv2daily;
    border-radius: 20px; overflow: hidden; position: relative;
    background: linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 12px 40px rgba(200,24,24,0.35);
    display: flex; flex-direction: column;
  }
  .hv2d-inner { padding: 18px; display: flex; flex-direction: column; flex: 1; }
  .hv2d-head { display: flex; align-items: center; gap: 12px; }
  .hv2d-icon { width: 64px; height: 64px; object-fit: contain; display: block; }
  .hv2d-headTxt { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .hv2d-title { margin: 0; font-size: 18px; font-weight: 900; letter-spacing: 1px; }
  .hv2d-date { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); }
  .hv2d-status {
    font-size: 9px; font-weight: 900; letter-spacing: 1px; padding: 4px 10px;
    border-radius: 999px; border: 1px solid; flex-shrink: 0;
  }
  .hv2d-headRight { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
  .hv2d-countBadge {
    font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 999px;
    background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.22);
    color: rgba(255,255,255,0.9); white-space: nowrap;
  }
  .hv2d-body { display: flex; flex-direction: column; gap: 14px; flex: 1; margin-top: 14px; }
  .hv2d-main { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; min-width: 0; flex: 1; }

  .hv2d-cta, .hv2d-ctaOutline {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 0 20px; border-radius: 999px; cursor: pointer;
    font-size: 14px; font-weight: 900; flex: 1 1 160px;
  }
  .hv2d-cta {
    border: 0; color: #b01010;
    background: #fff;
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  }
  .hv2d-ctaOutline { background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #fff; }



  .hv2d-rounds { display: flex; align-items: center; gap: 6px; }
  .hv2d-dot {
    width: 10px; height: 10px; border-radius: 999px;
    background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.2);
  }
  .hv2d-dotDone { background: var(--hv2-daily); border-color: var(--hv2-daily); }
  .hv2d-dotCur { border-color: var(--hv2-daily); box-shadow: 0 0 0 2px rgba(239,68,68,0.35); }
  .hv2d-roundTxt { margin-left: 6px; font-size: 12px; font-weight: 800; }

  .hv2d-result { display: flex; align-items: center; gap: 12px; }
  .hv2d-resRing {
    width: 56px; height: 56px; border-radius: 999px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 4px solid; font-size: 15px; font-weight: 900;
  }
  .hv2d-resTxt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .hv2d-resXp { font-size: 15px; font-weight: 900; color: var(--hv2-gold); }
  .hv2d-resRank { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); }

  .hv2d-streakRow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .hv2d-streak { display: flex; align-items: center; gap: 7px; }
  /* Same streak badge as profile-v2 hChipStreak */
  .hv2d-streakBadge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 999px;
    background: rgba(251,146,60,0.2); border: 1px solid rgba(251,146,60,0.55);
    font-size: 10px; font-weight: 800; color: #fb923c;
  }
  .hv2d-streakTxt { font-size: 13px; font-weight: 800; }
  .hv2d-week { display: flex; gap: 6px; }
  .hv2d-day {
    width: 26px; height: 26px; border-radius: 999px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800;
  }
  .hv2d-dayDone { background: var(--hv2-daily); color: #fff; }
  .hv2d-dayToday {
    border: 1px solid var(--hv2-daily); color: var(--hv2-daily);
    animation: hv2PulseRed 2s ease-out infinite;
  }
  .hv2d-dayEmpty { border: 1px solid rgba(255,255,255,0.12); }
  @keyframes hv2PulseRed {
    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
    70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }

  /* ── Challenge card (prod CompetePanel tabs, collapsed → expand on click) ── */
  .hv2-challenge {
    border-radius: 20px; padding: 18px; position: relative; overflow: hidden;
    background: linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 12px 40px rgba(8,145,178,0.35);
    display: flex; flex-direction: column;
  }
  .hv2c-head { display: flex; align-items: center; gap: 12px; }
  .hv2c-icon { width: 64px; height: 64px; object-fit: contain; display: block; }
  .hv2c-headTxt { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .hv2c-title { margin: 0; font-size: 18px; font-weight: 900; letter-spacing: 1px; }
  .hv2c-sub { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); }
  .hv2c-create {
    display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
    min-height: 40px; padding: 0 16px; border-radius: 999px; border: 0; cursor: pointer;
    background: #fff; color: #0369a1; font-size: 13px; font-weight: 900;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  }

  .hv2c-tabs { display: flex; flex-direction: column; gap: 2px; margin-top: 14px; }
  .hv2c-tabHead {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 9px 12px; border-radius: 10px; cursor: pointer;
    background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.10);
    color: #fff; font-size: 12px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase;
  }
  .hv2c-tabCount {
    font-size: 9px; font-weight: 900; padding: 1px 7px; border-radius: 999px;
    background: #ef4444; color: #fff;
  }
  .hv2c-tabChev { margin-left: auto; transition: transform 0.15s ease; opacity: 0.7; }
  .hv2c-tabChevOpen { transform: rotate(90deg); }
  .hv2c-tabBody { display: flex; flex-direction: column; gap: 1px; padding: 6px 2px 2px; }
  .hv2c-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 10px;
    background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.10);
  }
  .hv2c-av {
    width: 26px; height: 26px; border-radius: 999px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 900; background: rgba(255,255,255,0.18);
  }
  .hv2c-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .hv2c-name { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hv2c-rowSub { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.6); }
  .hv2c-mode {
    display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px;
    border-radius: 999px; background: rgba(255,255,255,0.14); letter-spacing: 0.3px;
  }
  .hv2c-go {
    display: flex; align-items: center; justify-content: center;
    width: 40px; height: 28px; border-radius: 999px; border: 0; cursor: pointer;
    background: #22c55e; color: #fff; flex-shrink: 0;
  }
  .hv2c-del {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 999px; border: 0; cursor: pointer;
    background: #ef4444; color: #fff; flex-shrink: 0;
  }
  .hv2c-acc { font-size: 12px; font-weight: 900; }
  .hv2c-rank {
    font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px;
    background: rgba(45,212,191,0.18); color: #2dd4bf; white-space: nowrap;
  }

  /* ── Practice card ── */
  .hv2m-tile {
    display: flex; align-items: center; gap: 12px; min-height: 72px;
    width: 100%; height: 100%;
    padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.14);
    text-align: left; color: #fff; position: relative;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  .hv2m-tile img { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35)); }
  .hv2m-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .hv2m-name { font-size: 18px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
  .hv2m-desc { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); }
  .hv2m-rounds { display: flex; align-items: center; gap: 5px; margin-top: 5px; }
  .hv2m-dot {
    width: 9px; height: 9px; border-radius: 999px;
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22);
  }
  .hv2m-dotDone { background: #fff; border-color: #fff; }
  .hv2m-dotCur { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.35); }
  .hv2m-roundTxt { margin-left: 4px; font-size: 11px; font-weight: 800; }
  .hv2m-settings { display: none; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
  .hv2m-chip {
    font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
    background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.18); white-space: nowrap;
  }
  @media (min-width: 1024px) {
    .hv2m-settings { display: flex; }
  }
  .hv2m-play {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0;
    min-height: 40px; padding: 0 16px; border-radius: 999px; border: 0; cursor: pointer;
    background: #fff; color: #c05010; font-size: 13px; font-weight: 900;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  }

  /* Card-head icons sit on a semi-transparent tile (prod .cardIconThumb port) */
  .hv2j-headIcon, .hv2d-icon, .hv2c-icon, .hv2m-tile img {
    box-sizing: border-box; padding: 6px; border-radius: 16px;
    background: rgba(255,255,255,0.15);
  }

  /* ── Toast ── */
  .hv2-toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 80;
    padding: 10px 18px; border-radius: 999px;
    background: rgba(20,20,26,0.95); border: 1px solid rgba(147,51,234,0.5);
    color: #e9d5ff; font-size: 12px; font-weight: 700; white-space: nowrap;
    animation: hv2ToastIn 0.25s ease;
  }
  @keyframes hv2ToastIn {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  /* Mobile: card CTAs take the whole width of the card; streak line centered
     & distributed. (Placed at end of the CSS so these overrides win on cascade.) */
  @media (max-width: 1023px) {
    .hv2j-cta { flex: 1 1 100%; }
    .hv2d-cta, .hv2d-ctaOutline { flex: 1 1 100%; }
    .hv2d-streakRow { width: 100%; justify-content: space-between; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hv2-root *, .hv2-root *::before, .hv2-root *::after {
      animation: none !important;
      transition: none !important;
    }
  }
`;
