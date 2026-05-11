"use client";

import { useRouter } from "next/navigation";
import RainbowRing from "@/components/compete/RainbowRing";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import WhereCard from "@/components/compete/WhereCard";
import WhenCard from "@/components/compete/WhenCard";
import type { CompeteSessionSnapshot } from "@/core/types";
import type { RoundResult } from "@/core/competeTypes";
import { getUsernameGradientStyle, haversineKm } from "@/core/competeUtils";

interface RoundCompleteSectionProps {
  snapshot: CompeteSessionSnapshot;
  roundResults: RoundResult[] | null;
  playerId: string | null;
  guessLat: number | null;
  guessLng: number | null;
  submittedHintPenaltyRef: React.MutableRefObject<{
    accPenalty: number;
    xpPenalty: number;
    purchasedIds: string[];
    whereAccPenalty: number;
    whenAccPenalty: number;
  }>;
  descriptionExpanded: boolean;
  setDescriptionExpanded: (v: boolean) => void;
  whereLbExpanded: boolean;
  setWhereLbExpanded: (v: boolean) => void;
  whenLbExpanded: boolean;
  setWhenLbExpanded: (v: boolean) => void;
  whereCluesExpanded: boolean;
  setWhereCluesExpanded: (v: boolean) => void;
  whenCluesExpanded: boolean;
  setWhenCluesExpanded: (v: boolean) => void;
  resultSecsLeft: number | null;
  onAdvanceRound: () => void;
}

export default function RoundCompleteSection({
  snapshot,
  roundResults,
  playerId,
  guessLat,
  guessLng,
  submittedHintPenaltyRef,
  descriptionExpanded,
  setDescriptionExpanded,
  whereLbExpanded,
  setWhereLbExpanded,
  whenLbExpanded,
  setWhenLbExpanded,
  whereCluesExpanded,
  setWhereCluesExpanded,
  whenCluesExpanded,
  setWhenCluesExpanded,
  resultSecsLeft,
  onAdvanceRound,
}: RoundCompleteSectionProps) {
  const router = useRouter();

  return (
    <div style={{ padding: "0 12px", paddingBottom: "72px", maxWidth: "720px", margin: "0 auto", width: "100%" }}>
      <style>{`
        @media (min-width: 768px) {
          .round-complete-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .round-complete-desktop-bottom {
            position: static !important;
            display: flex;
            justify-content: flex-end;
            padding: 16px 0;
            background: transparent;
            border: none;
            height: auto;
          }
          .round-complete-event-image {
            height: 240px !important;
          }
        }
      `}</style>
      {(() => {
        const round = snapshot.rounds[snapshot.currentRoundIndex];
        if (!round) return null;
        const myResult = roundResults?.find(r => r.playerId === playerId);
        const accuracy = myResult?.accuracy ?? 0;
        const correctLat = round.latitude;
        const correctLng = round.longitude;
        const correctName = round.locationName;
        const correctYear = round.year;
        const myDistanceKm = (guessLat != null && guessLng != null)
          ? haversineKm(guessLat, guessLng, correctLat, correctLng)
          : null;
        const leaderboardRows = (roundResults ?? [])
          .slice()
          .sort((a, b) => b.score - a.score)
          .map((r, i) => ({
            playerId: r.playerId,
            rank: i + 1,
            displayName: snapshot.players.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8),
            accuracy: r.accuracy,
            isMe: r.playerId === playerId,
          }));
        return (
          <>
            {/* EVENT CARD */}
            <div style={{ background: "#333", borderRadius: 12, overflow: "hidden", marginBottom: "10px", minHeight: "50vh" }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", textAlign: "center", padding: "14px 16px 10px" }}>
                {round.title}
              </div>
              {round.imageUrl ? (
                <img
                  src={round.imageUrl}
                  alt={round.title}
                  style={{ width: "100%", height: "180px", objectFit: "cover", display: "block" }}
                  className="round-complete-event-image"
                />
              ) : (
                <div style={{ width: "100%", height: "180px", background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 12 }}>
                  No image available
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f97316", textAlign: "center", padding: "8px 16px" }}>
                {correctYear} · {correctName}
              </div>
              <div style={{ padding: "0 16px 8px" }}>
                <div style={{
                  fontSize: 15,
                  color: "#d1d5db",
                  lineHeight: 1.6,
                  display: descriptionExpanded ? "block" : "-webkit-box",
                  WebkitLineClamp: descriptionExpanded ? undefined : 3,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>
                  {round.description ?? "No description available"}
                </div>
                {!descriptionExpanded && (round.description?.length ?? 0) > 0 && (
                  <button
                    onClick={() => setDescriptionExpanded(true)}
                    style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 0, marginTop: 4, display: "block" }}
                  >
                    more
                  </button>
                )}
              </div>
              {(round as unknown as { sourceUrl?: string }).sourceUrl && (
                <div style={{ padding: "0 16px 16px" }}>
                  <button
                    onClick={() => window.open((round as unknown as { sourceUrl?: string }).sourceUrl, "_blank")}
                    style={{ background: "transparent", border: "1px solid #6b7280", color: "#9ca3af", fontSize: 12, borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
                  >
                    Source ↗
                  </button>
                </div>
              )}
            </div>
            {/* ACCURACY RING CARD */}
            <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RainbowRing value={accuracy} />
              </div>
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <span style={{ fontSize: 15, color: "#9ca3af" }}>{myResult?.score ?? 0} XP</span>
              </div>
              {submittedHintPenaltyRef.current.xpPenalty > 0 && (
                <div style={{ textAlign: "center", marginTop: 4 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    background: "#7f1d1d",
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 10,
                    color: "#fca5a5",
                    fontWeight: 600,
                  }}>
                    Hint penalties deducted
                  </span>
                </div>
              )}
            </div>
            {/* ROUND LEADERBOARD CARD */}
            <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Round leaderboard</div>
              {leaderboardRows.map(row => {
                const hue = Math.round((Math.max(0, Math.min(100, row.accuracy)) / 100) * 120);
                const accColor = `hsl(${hue}, 100%, 50%)`;
                const avatarUrl = snapshot.players.find(p => p.playerId === row.playerId)?.avatarUrl ?? null;
                return (
                  <div key={row.rank} style={{
                    display: "flex", alignItems: "center", padding: "7px 8px",
                    borderRadius: 8, marginBottom: 3, gap: 6,
                    background: row.isMe ? "#2e2e2e" : "transparent",
                  }}>
                    <span style={{ fontSize: 11, color: "#777", minWidth: 14 }}>{row.rank}</span>
                    <span style={{ flex: 1, fontSize: 15 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <PlayerAvatar avatarUrl={avatarUrl} displayName={row.displayName} />
                        <span style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}>
                          {row.displayName}
                        </span>
                      </span>
                      {row.isMe && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                    </span>
                    <span style={{ background: "#2a2a2a", color: accColor, borderRadius: 999, padding: "2px 9px", fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: "#ffffff", fontSize: "var(--font-base)" }}>{Math.round(row.accuracy)}</span>
                      <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "var(--font-xs)" }}>%</span>
                    </span>
                  </div>
                );
              })}
              {leaderboardRows.length === 0 && (
                snapshot.players.map((p) => {
                  const isMe = p.playerId === playerId;
                  return (
                    <div key={p.playerId} style={{
                      display: "flex", alignItems: "center", padding: "7px 8px",
                      borderRadius: 8, marginBottom: 3, gap: 6,
                      background: isMe ? "#2e2e2e" : "transparent",
                    }}>
                      <span style={{ fontSize: 11, color: "#777", minWidth: 14 }}>—</span>
                      <span style={{ flex: 1, fontSize: 15 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                          <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName || p.playerId.slice(0, 8)} />
                          <span style={{ ...getUsernameGradientStyle(p.playerId), fontWeight: isMe ? 700 : 500 }}>
                            {p.displayName || p.playerId.slice(0, 8)}
                          </span>
                        </span>
                        {isMe && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                        <span style={{ color: "#555", fontSize: 11, fontStyle: "italic", marginLeft: 4 }}>No guess</span>
                      </span>
                      <span style={{ background: "#2a2a2a", color: "#888", borderRadius: 999, padding: "2px 9px", fontSize: 13, fontWeight: 600 }}>
                        —
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="round-complete-grid">
            {/* WHERE CARD */}
            <WhereCard
              roundResults={roundResults}
              playerId={playerId}
              correctLat={correctLat}
              correctLng={correctLng}
              correctName={correctName}
              whereAccPenalty={submittedHintPenaltyRef.current.accPenalty}
              guessLat={guessLat}
              guessLng={guessLng}
              myDistanceKm={myDistanceKm}
              whereLbExpanded={whereLbExpanded}
              setWhereLbExpanded={setWhereLbExpanded}
              whereCluesExpanded={whereCluesExpanded}
              setWhereCluesExpanded={setWhereCluesExpanded}
              roundHints={snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? []}
              snapshotPlayers={snapshot.players}
              currentRoundIndex={snapshot.currentRoundIndex}
            />
            {/* WHEN CARD */}
            <WhenCard
              roundResults={roundResults}
              playerId={playerId}
              correctYear={correctYear}
              whenAccPenalty={submittedHintPenaltyRef.current.whenAccPenalty}
              whenLbExpanded={whenLbExpanded}
              setWhenLbExpanded={setWhenLbExpanded}
              whenCluesExpanded={whenCluesExpanded}
              setWhenCluesExpanded={setWhenCluesExpanded}
              roundHints={snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? []}
              snapshotPlayers={snapshot.players}
            />
            </div>
            {/* HINTS USED CARD */}
            {submittedHintPenaltyRef.current.purchasedIds.length > 0 && (() => {
              const usedHints = (snapshot?.rounds?.[snapshot.currentRoundIndex]?.hints ?? [])
                .filter(h => submittedHintPenaltyRef.current.purchasedIds.includes(h.id))
                .sort((a, b) => a.tier - b.tier);
              if (usedHints.length === 0) return null;
              return (
                <div style={{
                  background: "#333", borderRadius: 12, padding: 16,
                  marginBottom: "10px",
                }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: "#aaa",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    marginBottom: 10,
                  }}>
                    Hints used
                  </div>
                  {usedHints.map((hint, idx) => {
                    const tierPenaltyAcc = [0,10,20,30,40,50][hint.tier] ?? 0;
                    const meta = hint.metadata as { km?: number; years?: number | string } | null;
                    let revealedText = hint.content;
                    if (hint.type === "where" && (hint.tier === 2 || hint.tier === 4) && meta?.km != null) {
                      revealedText = `${hint.content} — ${meta.km} km away`;
                    } else if (hint.type === "when" && (hint.tier === 2 || hint.tier === 4) && meta?.years != null) {
                      revealedText = `${hint.content} — ${meta.years} years off`;
                    }
                    const labelMap: Record<string, Record<number, string>> = {
                      when: { 1: "Century", 2: "Historical Event", 3: "Decade", 4: "Contemporary Event", 5: "Visual Clues" },
                      where: { 1: "Continent", 2: "Remote Landmark", 3: "Region", 4: "Nearby Landmark", 5: "Visual Clues" },
                    };
                    const label = labelMap[hint.type]?.[hint.tier] ?? "Hint";
                    return (
                      <div key={hint.id} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 0",
                        borderBottom: idx < usedHints.length - 1 ? "1px solid #3a3a3a" : "none",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#ccc" }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#aaa", fontStyle: "italic", marginTop: 1 }}>
                            {revealedText}
                          </div>
                        </div>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          background: "rgba(232,68,34,0.12)",
                          border: "0.5px solid rgba(232,68,34,0.35)",
                          borderRadius: 999,
                          padding: "2px 7px",
                          fontSize: 10,
                          color: "#e84422",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}>
                          −{tierPenaltyAcc}<span style={{ fontSize: "50%", color: "#ffffff" }}>%</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {resultSecsLeft !== null && resultSecsLeft > 0 && (
              <div style={{ textAlign: "center", padding: "12px 0 4px", fontSize: 13, color: "#6b7280" }}>
                Auto-advancing in {resultSecsLeft}s
              </div>
            )}
            {snapshot.readyForNext && snapshot.readyForNext.length > 0 && (
              <div style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", paddingBottom: 8 }}>
                {snapshot.readyForNext.map(pid => {
                  const name = snapshot.players.find(p => p.playerId === pid)?.displayName ?? pid.slice(0, 8);
                  return <span key={pid} style={{ marginRight: 6 }}><span style={getUsernameGradientStyle(pid)}>{name}</span> ✓</span>;
                })}
              </div>
            )}
            {/* FIXED BOTTOM BAR */}
            <div className="round-complete-desktop-bottom" style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#111111",
              borderTop: "1px solid #222222",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              zIndex: 1000,
            }}>
              <button
                onClick={() => router.push("/")}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 8,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
                  <polyline points="9 21 9 12 15 12 15 21" />
                </svg>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {Array.from({ length: snapshot.rounds.length }).map((_, i) => {
                  const isDone = i < snapshot.currentRoundIndex;
                  const isCurrent = i === snapshot.currentRoundIndex;
                  return (
                    <div key={i} style={{
                      height: 4,
                      width: 28,
                      borderRadius: 2,
                      background: isDone ? "#f97316" : isCurrent ? "#fb923c" : "#374151",
                      opacity: isCurrent ? 0.7 : 1,
                    }} />
                  );
                })}
                <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                  Round {snapshot.currentRoundIndex + 1}/{snapshot.rounds.length}
                </span>
              </div>
              <button
                onClick={onAdvanceRound}
                disabled={snapshot.readyForNext?.includes(playerId ?? "")}
                style={{
                  background: "#f97316",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 18px",
                  cursor: snapshot.readyForNext?.includes(playerId ?? "") ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  opacity: snapshot.readyForNext?.includes(playerId ?? "") ? 0.5 : 1,
                }}
              >
                Next →
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
