"use client";

// ============================================================================
// STANDALONE PROTOTYPE — WHEN Timeline (4 players simulation)
// Route: /prototype/when-timeline   (direct access, fully self-contained)
//
// - Visual language follows the prototype family: dark background image + scrim,
//   proto bar, rounded glass cards, violet (WHEN) accent, self-contained <style jsx>.
// - All data is MOCK. Shows 4 players with different year guesses on a timeline.
// - Interactive: change your year to see your marker move relative to opponents.
//
// Does NOT touch or import any existing app files.
// ============================================================================

import { useState } from "react";

type TimelinePlayer = { id: string; name: string; year: number; isMe: boolean };

const OPPONENTS: Omit<TimelinePlayer, "isMe">[] = [
  { id: "p2", name: "Mina Kovač", year: 1969 },
  { id: "p3", name: "Theo Lambert", year: 1994 },
  { id: "p4", name: "Sara Bianchi", year: 1951 },
];

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

function MiniAvatar({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className="tlAvatar"
      style={{ background: gradientFor(id), width: size, height: size, fontSize: size * 0.38 }}
    >
      {initialsOf(name)}
    </span>
  );
}

// WHEN timeline (mock) — ticks + correct marker + player markers.
function WhenTimeline({ rows, correctYear }: { rows: TimelinePlayer[]; correctYear: number }) {
  const years = [correctYear, ...rows.map((r) => r.year)];
  const minY = Math.floor((Math.min(...years) - 10) / 10) * 10;
  const maxY = Math.ceil((Math.max(...years) + 10) / 10) * 10;
  const range = maxY - minY || 1;
  const pct = (y: number) => ((y - minY) / range) * 100;
  const ticks: number[] = [];
  for (let y = minY; y <= maxY; y += 10) ticks.push(y);

  return (
    <div className="tl">
      <div className="tlBar" />
      {ticks.map((y) => (
        <div key={y} className="tlTick" style={{ left: `${pct(y)}%` }}>
          {y % 20 === 0 && <span className="tlTickLabel">{y}</span>}
        </div>
      ))}
      <div className="tlCorrectMarker" style={{ left: `${pct(correctYear)}%` }}>
        <span className="tlCorrectFlag">Correct</span>
        <span className="tlCorrectYear">{correctYear}</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className="tlPlayer"
          style={{ left: `${Math.max(4, Math.min(96, pct(r.year)))}%`, transform: `translate(-50%, ${-(i % 2) * 26}px)` }}
        >
          <MiniAvatar id={r.id} name={r.name} size={24} />
          <span className="tlYear" style={{ fontWeight: r.isMe ? 700 : 400 }}>{r.year}</span>
        </div>
      ))}
    </div>
  );
}

export default function WhenTimelinePrototypePage() {
  const CORRECT_YEAR = 1902;
  const [myYear, setMyYear] = useState<number | null>(1855);
  const [yearEditValue, setYearEditValue] = useState("1855");

  return (
    <main className="screen">
      <div className="protoBar">
        <span className="protoTitle">WHEN Timeline — Prototype</span>
        <span className="protoHint">Mock data · 4 players · you = Alex</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="scroll">
        {/* ── Card ── */}
        <section className="card">
          <div className="cardHead">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badges/when.webp" alt="" className="headerIcon" />
            <span className="cardTitle">When</span>
          </div>

          <div className="breakHead">
            <span className="breakCorrect">
              Correct: <strong style={{ color: "#8b5cf6" }}>{CORRECT_YEAR}</strong>
            </span>
            <span className="breakScore">47%</span>
          </div>
          <span className="breakSub">You guessed {myYear} · {Math.abs(myYear ?? 0 - CORRECT_YEAR)} yrs off</span>

          <WhenTimeline
            rows={[
              ...OPPONENTS.map((o) => ({ ...o, isMe: false })),
              ...(myYear !== null ? [{ id: "me", name: "You", year: myYear, isMe: true }] : []),
            ]}
            correctYear={CORRECT_YEAR}
          />

          <div className="fieldWrap">
            <input
              type="number"
              value={yearEditValue}
              onChange={(e) => {
                setYearEditValue(e.target.value);
                const parsed = parseInt(e.target.value, 10);
                if (!isNaN(parsed)) {
                  setMyYear(Math.max(1850, Math.min(2025, parsed)));
                }
              }}
              onFocus={(e) => {
                setYearEditValue(myYear !== null ? String(myYear) : "");
                setTimeout(() => e.target.select(), 10);
              }}
              placeholder="Enter year (1850–2025)"
              min={1850}
              max={2025}
              className="field"
            />
          </div>
        </section>

        <div className="dockSpacer" />
      </div>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #0a0a0a; }
      `}</style>

      <style jsx>{`
        .screen {
          position: fixed; inset: 0; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff;
        }
        .bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .bgScrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,0.85); }

        .protoBar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; background: rgba(10,10,12,0.6); backdrop-filter: blur(8px); flex-wrap: wrap;
        }
        .protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.55; }

        .scroll {
          position: absolute; inset: 0; z-index: 2; overflow-y: auto;
          padding: 56px 16px calc(96px + env(safe-area-inset-bottom));
          display: flex; flex-direction: column; gap: 14px;
          max-width: 560px; margin: 0 auto; box-sizing: border-box;
        }

        /* ── Card ── */
        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.1); border-radius: 18px;
          backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        }
        .cardHead { display: flex; align-items: center; gap: 10px; padding: 16px 18px 10px; }
        .headerIcon { width: 36px; height: 36px; object-fit: contain; }
        .cardTitle { font-size: 16px; font-weight: 700; margin: 0; }

        /* ── WHEN timeline ── */
        .tl {
          position: relative; height: 110px; margin: 28px 18px 8px;
        }
        .tlBar {
          position: absolute; left: 0; right: 0; top: 62px; height: 3px;
          border-radius: 999px; background: rgba(255,255,255,0.18);
        }
        .tlTick {
          position: absolute; top: 58px; width: 1px; height: 10px;
          background: rgba(255,255,255,0.25); transform: translateX(-50%);
        }
        .tlTickLabel {
          position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
          font-size: 10px; color: rgba(255,255,255,0.4); white-space: nowrap;
        }
        .tlCorrectMarker {
          position: absolute; top: 40px; transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; z-index: 3;
        }
        .tlCorrectFlag {
          font-size: 9px; font-weight: 800; letter-spacing: 0.5px; color: #4ade80;
          background: rgba(74,222,128,0.15); padding: 2px 6px; border-radius: 6px;
        }
        .tlCorrectYear {
          font-size: 12px; font-weight: 700; color: #4ade80; margin-top: 2px;
        }
        .tlCorrectMarker::after {
          content: ""; width: 2px; height: 20px; background: #4ade80; margin-top: 2px;
        }
        .tlPlayer {
          position: absolute; top: 30px; display: flex; flex-direction: column;
          align-items: center; gap: 2px; z-index: 2;
        }
        .tlYear { font-size: 11px; color: rgba(255,255,255,0.8); }
        .tlAvatar {
          flex-shrink: 0; border-radius: 50%; display: inline-flex;
          align-items: center; justify-content: center;
          font-weight: 700; color: #fff; text-transform: uppercase;
        }

        /* ── Break head (correct + score) ── */
        .breakHead {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px 0;
        }
        .breakCorrect {
          font-size: 14px; color: rgba(255,255,255,0.7);
        }
        .breakScore { font-size: 22px; font-weight: 800; }
        .breakSub {
          display: block; font-size: 12px; color: rgba(255,255,255,0.5);
          padding: 2px 18px 0;
        }

        /* ── Field ── */
        .fieldWrap { position: relative; margin-top: 16px; }
        .field {
          width: 100%; box-sizing: border-box;
          background: rgba(255,255,255,0.12);
          border: 1.5px solid rgba(255,255,255,0.35);
          border-radius: 12px; color: #fff; font-size: 15px;
          padding: 12px 14px; outline: none;
        }
        .field::placeholder { color: rgba(255,255,255,0.5); }

        .dockSpacer { height: 2px; }
      `}</style>
    </main>
  );
}
