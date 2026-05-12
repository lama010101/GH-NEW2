"use client";

import PlayerAvatar from "@/components/compete/PlayerAvatar";
import { getUsernameGradientStyle } from "@/core/competeUtils";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";

interface Hint {
  id: string;
  type: string;
  tier: number;
  content: string;
}

interface WhenCardProps {
  roundResults: RoundResult[] | null;
  playerId: string | null;
  correctYear: number;
  whenAccPenalty: number;
  whenLbExpanded: boolean;
  setWhenLbExpanded: (v: boolean) => void;
  whenCluesExpanded: boolean;
  setWhenCluesExpanded: (v: boolean) => void;
  roundHints: Hint[];
  snapshotPlayers: SessionPlayer[];
}

export default function WhenCard({
  roundResults,
  playerId,
  correctYear,
  whenAccPenalty,
  whenLbExpanded,
  setWhenLbExpanded,
  whenCluesExpanded,
  setWhenCluesExpanded,
  roundHints,
  snapshotPlayers,
}: WhenCardProps) {
  // Compute whenRows
  const whenRows = snapshotPlayers
    .map(p => {
      const resultRow = roundResults?.find(r => r.playerId === p.playerId);
      const theirGuessYear = resultRow?.guessYear ?? null;
      const acc = resultRow?.timeScore ?? null;
      const diff = theirGuessYear != null && correctYear != null
        ? Math.abs(theirGuessYear - correctYear)
        : null;
      return {
        playerId: p.playerId,
        displayName: p.displayName || p.playerId.slice(0, 8),
        guessYear: theirGuessYear,
        acc,
        diff,
        isMe: p.playerId === playerId,
      };
    })
    .sort((a, b) => {
      if (a.acc == null && b.acc == null) return 0;
      if (a.acc == null) return 1;
      if (b.acc == null) return -1;
      return b.acc - a.acc;
    });

  return (
    <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#f97316" }}>When</span>
        </div>
        {(() => {
          const myWhenRow = whenRows.find(r => r.isMe);
          const myWhenAcc = myWhenRow?.acc ?? null;
          const myResult = roundResults?.find(r => r.playerId === playerId);
          if (myResult == null || !myResult.didSubmit) {
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 19, fontWeight: 700, color: "#666" }}>—</span>
              </div>
            );
          }
          return myWhenAcc != null ? (() => {
            const whenScore = Math.round(myWhenAcc);
            const whenHue = Math.round((Math.max(0, Math.min(100, whenScore)) / 100) * 120);
            const whenColor = `hsl(${whenHue}, 100%, 50%)`;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{ fontSize: 19, fontWeight: 700, color: whenColor }}>{whenScore}</span>
                  <span style={{ fontSize: 7, fontWeight: 600, color: "#ffffff" }}>%</span>
                </div>
              </div>
            );
          })() : null;
        })()}
      </div>
      {whenAccPenalty > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center",
            fontSize: 10, color: "#fca5a5", fontWeight: 600,
            background: "#7f1d1d",
            borderRadius: 999,
            padding: "2px 8px",
          }}>
            −{Math.round(whenAccPenalty)}<span style={{ fontSize: "50%", color: "#ffffff" }}>%</span> hints
          </span>
        </div>
      )}
      <div style={{ fontSize: 13, color: "#fff", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
        <span>Correct:</span>
        <span style={{ color: "#f97316" }}>{correctYear}</span>
      </div>
      {/* Year timeline */}
      <div style={{ width: "100%", height: 96, position: "relative", margin: "12px 0", background: "#1a1a2a", borderRadius: 8, padding: "0 16px", boxSizing: "border-box" }}>
        {/* Horizontal gradient bar */}
        <div style={{
          position: "absolute",
          top: "50%",
          height: 4,
          left: 16,
          right: 16,
          background: "#555555",
          borderRadius: 3,
          transform: "translateY(-50%)",
        }} />
        {/* Correct year marker */}
        <div style={{
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 4,
          height: 32,
          background: "#f97316",
          borderRadius: 2,
          left: "50%",
        }}>
          <div style={{
            position: "absolute",
            top: -20,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 9,
            color: "#888",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}>
            Correct
          </div>
          <div style={{
            position: "absolute",
            top: 32,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            color: "#f97316",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}>
            {correctYear}
          </div>
        </div>
        {/* Player guess markers */}
        {(() => {
          const allYears = [correctYear, ...whenRows.map(r => r.guessYear).filter((y): y is number => y != null)];
          const maxDelta = allYears.reduce((max, y) => Math.max(max, Math.abs(y - correctYear)), 0);
          const minSpread = maxDelta === 0 ? 20 : maxDelta;
          const padding = Math.max(10, Math.ceil(minSpread / 10) * 10 - minSpread + 10);
          const timelineMin = Math.floor((Math.min(...allYears) - padding) / 10) * 10;
          const timelineMax = Math.ceil((Math.max(...allYears) + padding) / 10) * 10;
          const timelineRange = timelineMax - timelineMin;
          const yearCounts = new Map<number, number>();
          // Decade tick marks
          const ticks: { year: number; isMajor: boolean; xPercent: number }[] = [];
          for (let year = timelineMin; year <= timelineMax; year += 10) {
            const xPercent = ((year - timelineMin) / timelineRange) * 100;
            ticks.push({ year, isMajor: year % 50 === 0, xPercent });
          }
          whenRows.forEach(row => {
            if (row.guessYear != null) {
              yearCounts.set(row.guessYear, (yearCounts.get(row.guessYear) || 0) + 1);
            }
          });
          return (
            <>
              {/* Decade tick marks */}
              {ticks.map((tick) => {
                const isNearCorrect = Math.abs(tick.xPercent - 50) < 8;
                return (
                  <div key={tick.year} style={{
                    position: "absolute",
                    top: "50%",
                    left: `${tick.xPercent}%`,
                    width: 2,
                    height: tick.isMajor ? 14 : 8,
                    background: "#aaa",
                    transform: "translateY(-50%)",
                  }}>
                    {tick.isMajor && !isNearCorrect && (
                      <div style={{
                        position: "absolute",
                        top: 18,
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontSize: 8,
                        color: "#999",
                        whiteSpace: "nowrap",
                      }}>
                        {tick.year}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Player guess markers */}
              {whenRows.map((row) => {
                if (row.guessYear == null) return null;
                const xPercent = ((row.guessYear - timelineMin) / timelineRange) * 100;
                const clampedXPercent = Math.max(0, Math.min(100, xPercent));
                const sameYearPlayers = whenRows.filter(r => r.guessYear === row.guessYear);
                const groupIndex = sameYearPlayers.findIndex(r => r.playerId === row.playerId);
                const verticalOffset = groupIndex * 22;
                return (
                  <div key={row.playerId} style={{
                    position: "absolute",
                    top: "50%",
                    transform: `translate(-50%, calc(-50% - ${verticalOffset}px))`,
                    left: `${clampedXPercent}%`,
                  }}>
                    <div style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: row.isMe ? "#f97316" : "#60a5fa",
                      border: "2px solid #fff",
                    }} />
                    <div style={{
                      position: "absolute",
                      top: 18,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 10,
                      color: row.isMe ? "#f97316" : "#60a5fa",
                      whiteSpace: "nowrap",
                      textAlign: "center",
                    }}>
                      {row.guessYear}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
      <div style={{ marginTop: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
        <div
          onClick={() => setWhenLbExpanded(!whenLbExpanded)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {whenLbExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Leaderboard
            </span>
          </div>
          {(() => {
            const myRank = roundResults?.find(r => r.playerId === playerId)?.rank ?? null;
            return myRank != null ? (
              <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>
                #{myRank}
              </span>
            ) : null;
          })()}
        </div>
        {whenLbExpanded && (
          <div style={{ padding: "0 4px 8px" }}>
            {whenRows.map((row, idx) => {
              const hue = row.acc != null ? Math.round((row.acc / 100) * 120) : null;
              const accColor = hue != null ? `hsl(${hue}, 100%, 50%)` : "#888";
              const resultRow = roundResults?.find(r => r.playerId === row.playerId);
              const rank = resultRow?.rank ?? null;
              const avatarUrl = snapshotPlayers.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
              return (
                <div key={row.playerId} style={{
                  display: "flex", alignItems: "center", padding: "7px 8px", gap: 6,
                  borderRadius: 6,
                  background: row.isMe ? "rgba(255,255,255,0.06)" : "transparent",
                  borderBottom: idx < whenRows.length - 1 ? "1px solid #333" : "none",
                }}>
                  <span style={{ minWidth: 20, color: "#888", fontSize: 13, fontWeight: 600 }}>
                    {rank ?? "—"}
                  </span>
                  <span style={{ flex: 1, fontSize: 15 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} />
                      <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                        {row.displayName}
                      </span>
                    </span>
                    {row.isMe && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                  </span>
                  <span style={{ color: "#bbb", fontSize: 11, fontWeight: 600 }}>
                    {row.diff != null ? `${row.diff} yrs off` : "—"}
                  </span>
                  <span style={{ background: "#2a2a2a", color: accColor, borderRadius: 999, padding: "2px 8px", fontSize: 13, fontWeight: 600 }}>
                    {row.acc != null ? (
                      <>
                        <span style={{ color: "#ffffff", fontSize: "var(--font-base)" }}>{row.acc}</span>
                        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "var(--font-xs)" }}>%</span>
                      </>
                    ) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ marginTop: 6, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
        <div
          onClick={() => setWhenCluesExpanded(!whenCluesExpanded)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {whenCluesExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Clues
            </span>
          </div>
          {(() => {
            const myResult = roundResults?.find(r => r.playerId === playerId);
            const xp = myResult?.timeScore ?? null;
            return xp != null ? (
              <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600 }}>
                {xp} XP
              </span>
            ) : null;
          })()}
        </div>
        {whenCluesExpanded && (
          <div style={{ padding: "0 12px 12px" }}>
            {(() => {
              const whenHints = (roundHints ?? [])
                .filter(h => h.type === "when")
                .sort((a, b) => a.tier - b.tier);
              if (whenHints.length === 0) return (
                <div style={{ fontSize: 12, color: "#555", fontStyle: "italic" }}>
                  No time clues available for this event.
                </div>
              );
              const labelMap: Record<number, string> = {
                1: "Century", 2: "Historical Event", 3: "Decade",
                4: "Contemporary Event", 5: "Visual Clues"
              };
              return whenHints.map((hint, idx) => (
                <div key={hint.id} style={{
                  padding: "8px 0",
                  borderBottom: idx < whenHints.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {labelMap[hint.tier] ?? `Tier ${hint.tier}`}
                    </span>
                    <span style={{ fontSize: 10, color: "#e84422", fontWeight: 600 }}>
                      -{[0,10,20,30,40,50][hint.tier] ?? 0}%
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.4 }}>
                    {hint.content}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
