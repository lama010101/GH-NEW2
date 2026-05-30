"use client";

import dynamic from "next/dynamic";
import { getUsernameGradientStyle, haversineKm } from "@/core/competeUtils";
import type { RoundResult } from "@/core/competeTypes";
import type { SessionPlayer } from "@/core/types";

const StaticResultMap = dynamic(
  () => import("@/components/StaticResultMap").then((m) => m.StaticResultMap),
  { ssr: false }
);

interface Hint {
  id: string;
  type: string;
  tier: number;
  content: string;
}

interface WhereCardProps {
  roundResults: RoundResult[] | null;
  playerId: string | null;
  correctLat: number | null;
  correctLng: number | null;
  correctName: string | null;
  whereAccPenalty: number;
  guessLat: number | null;
  guessLng: number | null;
  myDistanceKm: number | null;
  whereLbExpanded: boolean;
  setWhereLbExpanded: (v: boolean) => void;
  whereCluesExpanded: boolean;
  setWhereCluesExpanded: (v: boolean) => void;
  roundHints: Hint[];
  snapshotPlayers: SessionPlayer[];
  currentRoundIndex: number;
}

export default function WhereCard({
  roundResults,
  playerId,
  correctLat,
  correctLng,
  correctName,
  whereAccPenalty,
  guessLat,
  guessLng,
  myDistanceKm,
  whereLbExpanded,
  setWhereLbExpanded,
  whereCluesExpanded,
  setWhereCluesExpanded,
  roundHints,
  snapshotPlayers,
  currentRoundIndex,
}: WhereCardProps) {
  const myResult = roundResults?.find(r => r.playerId === playerId);

  return (
    <div style={{ background: "#333", borderRadius: 12, padding: 16, marginBottom: "10px" }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badges/where.webp" alt="where" width={36} height={36} style={{ objectFit: "contain" }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>Where</span>
        </div>
        {(() => {
          if (myResult == null || !myResult.didSubmit) {
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 19, fontWeight: 700, color: "#666" }}>—</span>
              </div>
            );
          }
          const locScore = Math.round(myResult.locationScore);
          const locHue = Math.round((Math.max(0, Math.min(100, locScore)) / 100) * 120);
          const locColor = `hsl(${locHue}, 100%, 50%)`;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: 25, fontWeight: 700, color: locColor }}>{locScore}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>%</span>
              </div>
            </div>
          );
        })()}
      </div>
      {whereAccPenalty > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center",
            fontSize: 10, color: "#fca5a5", fontWeight: 600,
            background: "#7f1d1d",
            borderRadius: 999,
            padding: "2px 8px",
          }}>
            −{Math.round(whereAccPenalty / 2)}<span style={{ fontSize: "50%", color: "#ffffff" }}>%</span> hints
          </span>
        </div>
      )}
      <div style={{ fontSize: 15, color: "#fff", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>Correct:</span>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>{correctName}</span>
      </div>
      {(() => {
        if (myResult == null || !myResult.didSubmit) {
          return (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 15, color: "#666" }}>No guess</span>
            </div>
          );
        }
        if (myDistanceKm != null) {
          return (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: "#fff" }}>{Math.round(myDistanceKm)} km away</span>
            </div>
          );
        }
        return null;
      })()}
      <div style={{ borderRadius: 8, overflow: "hidden", height: 200 }}>
        {correctLat != null && correctLng != null && (
          <StaticResultMap
            key={`result-map-${currentRoundIndex}`}
            correctLat={correctLat}
            correctLng={correctLng}
            guessLat={guessLat}
            guessLng={guessLng}
            playerGuesses={roundResults
              ?.filter(r => r.didSubmit && r.guessLat != null && r.guessLng != null && r.playerId !== playerId)
              .map(r => {
                const player = snapshotPlayers.find(p => p.playerId === r.playerId);
                return {
                  playerId: r.playerId,
                  lat: r.guessLat!,
                  lng: r.guessLng!,
                  label: player?.displayName ?? r.playerId.slice(0, 8),
                  color: r.playerId === playerId ? "#f97316" : undefined,
                  avatarUrl: player?.avatarUrl ?? null,
                };
              }) ?? undefined}
            ownAvatarUrl={snapshotPlayers.find(p => p.playerId === playerId)?.avatarUrl ?? null}
            ownLabel={snapshotPlayers.find(p => p.playerId === playerId)?.displayName ?? ""}
          />
        )}
      </div>
      <div style={{ marginTop: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
        <div
          onClick={() => setWhereLbExpanded(!whereLbExpanded)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {whereLbExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
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
        {whereLbExpanded && (
          <div style={{ padding: "0 4px 8px" }}>
            {(roundResults ?? [])
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((r, idx) => {
                const distanceKm = r.guessLat != null && r.guessLng != null && correctLat != null && correctLng != null
                  ? haversineKm(r.guessLat, r.guessLng, correctLat, correctLng)
                  : null;
                const locationAcc = r.locationScore;
                const locHue = locationAcc != null ? Math.round((locationAcc / 100) * 120) : null;
                const locAccColor = locHue != null ? `hsl(${locHue}, 100%, 50%)` : "#888";
                return (
                  <div key={r.playerId} style={{
                    display: "flex", alignItems: "center", padding: "7px 8px", gap: 6,
                    borderRadius: 6,
                    background: r.playerId === playerId ? "rgba(255,255,255,0.06)" : "transparent",
                    borderBottom: idx < (roundResults?.length ?? 0) - 1 ? "1px solid #333" : "none",
                  }}>
                    <span style={{ minWidth: 20, color: "#888", fontSize: 13, fontWeight: 600 }}>
                      {r.rank ?? "—"}
                    </span>
                    <span style={{ flex: 1, fontSize: 15 }}>
                      <span style={{ ...getUsernameGradientStyle(r.playerId), fontWeight: r.playerId === playerId ? 600 : 400 }}>
                        {snapshotPlayers.find(p => p.playerId === r.playerId)?.displayName || r.playerId.slice(0, 8)}
                      </span>
                      {r.playerId === playerId && <span style={{ color: "#555", fontSize: 11, marginLeft: 4 }}>(you)</span>}
                    </span>
                    <span style={{ color: "#bbb", fontSize: 13, fontWeight: 600 }}>
                      {distanceKm != null ? `${Math.round(distanceKm)} km away` : "—"}
                    </span>
                    {locationAcc != null && (
                      <span style={{ background: "#2a2a2a", color: locAccColor, borderRadius: 999, padding: "2px 8px", fontSize: 13, fontWeight: 600 }}>
                        <span style={{ color: locAccColor, fontSize: "var(--font-base)" }}>{locationAcc}</span>
                        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "var(--font-xs)" }}>%</span>
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
      <div style={{ marginTop: 6, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
        <div
          onClick={() => setWhereCluesExpanded(!whereCluesExpanded)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {whereCluesExpanded ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Hints
            </span>
          </div>
          {null}
        </div>
        {whereCluesExpanded && (
          <div style={{ padding: "0 12px 12px" }}>
            {(() => {
              const whereHints = (roundHints ?? [])
                .filter(h => h.type === "where")
                .sort((a, b) => a.tier - b.tier);
              if (whereHints.length === 0) return (
                <div style={{ fontSize: 12, color: "#555", fontStyle: "italic" }}>
                  No location clues available for this event.
                </div>
              );
              const labelMap: Record<number, string> = {
                1: "Continent", 2: "Remote Landmark", 3: "Region",
                4: "Nearby Landmark", 5: "Visual Clues"
              };
              return whereHints.map((hint, idx) => (
                <div key={hint.id} style={{
                  padding: "8px 0",
                  borderBottom: idx < whereHints.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {labelMap[hint.tier] ?? `Tier ${hint.tier}`}
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
