"use client";

import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import dynamic from "next/dynamic";
import { useState } from "react";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

type YearScale = "century" | "decade" | "year";

interface RoundActiveSectionProps {
  snapshot: CompeteSessionSnapshot;
  playerId: string | null;
  timeRemaining: number | null;
  guessYear: number | null;
  guessLat: number | null;
  guessLng: number | null;
  hasSubmitted: boolean;
  localSubmitted: boolean;
  busy: boolean;
  onSetLocation: (location: { lat: number; lng: number }) => void;
  onSetYear: (year: number | null) => void;
  onSubmit: () => void;
  onOpenHints: () => void;
  guessYearRef: React.MutableRefObject<number | null>;
  viewer: SessionPlayer | null;
}

const SCALE_STEP: Record<YearScale, number> = {
  century: 100,
  decade: 10,
  year: 1,
};

export default function RoundActiveSection({
  snapshot,
  timeRemaining,
  guessYear,
  guessLat,
  guessLng,
  hasSubmitted,
  localSubmitted,
  busy,
  onSetLocation,
  onSetYear,
  onSubmit,
  onOpenHints,
  guessYearRef,
}: RoundActiveSectionProps) {
  const currentEvent = snapshot.rounds?.[snapshot.currentRoundIndex];
  const guessLocation =
    guessLat !== null && guessLng !== null
      ? { lat: guessLat, lng: guessLng }
      : null;

  const [minimapExpanded, setMinimapExpanded] = useState(false);
  const [yearScale, setYearScale] = useState<YearScale>("century");

  const yearMin = snapshot.config.yearMin;
  const yearMax = snapshot.config.yearMax;

  const isLocked = busy || hasSubmitted || localSubmitted;
  const canSubmit = !isLocked && guessYear !== null && guessLocation !== null;

  // Format timer
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Snap slider value to scale step
  const snapToScale = (raw: number, scale: YearScale): number => {
    const step = SCALE_STEP[scale];
    return Math.round(raw / step) * step;
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const snapped = snapToScale(raw, yearScale);
    const clamped = Math.max(yearMin, Math.min(yearMax, snapped));
    onSetYear(clamped);
    guessYearRef.current = clamped;
  };

  const handleScaleChange = (scale: YearScale) => {
    setYearScale(scale);
    // Re-snap current value to new scale
    if (guessYear !== null) {
      const snapped = snapToScale(guessYear, scale);
      const clamped = Math.max(yearMin, Math.min(yearMax, snapped));
      onSetYear(clamped);
      guessYearRef.current = clamped;
    }
  };

  const handleMapSetLocation = (location: { lat: number; lng: number }) => {
    if (!isLocked) {
      onSetLocation(location);
    }
  };

  return (
    <section
      style={{
        height: "100dvh",
        width: "100%",
        background: "#111",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        .minimap-container .leaflet-control-zoom {
          display: none !important;
        }
      `}</style>

      {/* IMAGE */}
      {currentEvent?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentEvent.imageUrl}
          alt="Historical event"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#222" }} />
      )}

      {/* MINIMAP overlay */}
      <div
        className="minimap-container"
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          width: minimapExpanded ? 220 : 120,
          height: minimapExpanded ? 220 : 120,
          borderRadius: 12,
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.2)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          transition: "width 0.2s ease, height 0.2s ease",
          zIndex: 10,
          cursor: "pointer",
        }}
        onClick={() => setMinimapExpanded((v) => !v)}
      >
        <GameMap
          guessLocation={guessLocation}
          onSetLocation={handleMapSetLocation}
        />
      </div>

      {/* FLOATING BOTTOM PANEL */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(17, 17, 17, 0.82)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          padding: "16px 16px 28px",
          zIndex: 20,
        }}
      >
        {/* Scale tabs */}
        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,0.07)",
            borderRadius: 999,
            padding: 3,
            marginBottom: 16,
          }}
        >
          {(["year", "decade", "century"] as YearScale[]).map((scale) => {
            const active = scale === yearScale;
            return (
              <button
                key={scale}
                type="button"
                onClick={() => handleScaleChange(scale)}
                disabled={isLocked}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  borderRadius: 999,
                  border: "none",
                  background: active ? "rgba(255,174,66,0.18)" : "transparent",
                  color: active ? "#ffae42" : "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  transition: "all 150ms ease",
                }}
              >
                {scale.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Year display */}
        <div
          style={{
            textAlign: "center",
            fontSize: 28,
            fontWeight: 700,
            color: guessYear !== null ? "#ffae42" : "rgba(255,255,255,0.25)",
            marginBottom: 12,
            fontVariantNumeric: "tabular-nums",
            minHeight: 36,
          }}
        >
          {guessYear !== null ? guessYear : "—"}
        </div>

        {/* Slider */}
        <input
          type="range"
          min={yearMin}
          max={yearMax}
          step={SCALE_STEP[yearScale]}
          value={guessYear ?? Math.round((yearMin + yearMax) / 2)}
          onChange={handleSliderChange}
          disabled={isLocked}
          style={{
            width: "100%",
            accentColor: "#ffae42",
            cursor: isLocked ? "not-allowed" : "pointer",
            height: 4,
            marginBottom: 8,
          }}
        />

        {/* Range labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            marginBottom: 16,
          }}
        >
          <span>{yearMin}</span>
          <span>{yearMax}</span>
        </div>

        {/* SUBMIT ROW */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={onOpenHints}
            disabled={isLocked}
            style={{
              width: 80,
              height: 52,
              borderRadius: 999,
              border: "1.5px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: isLocked ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
              fontSize: 14,
              fontWeight: 600,
              cursor: isLocked ? "not-allowed" : "pointer",
            }}
          >
            Hints
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              width: "100%",
              maxWidth: 240,
              height: 52,
              borderRadius: 999,
              border: "none",
              background: canSubmit
                ? "linear-gradient(135deg, #ff8a00, #ffae42)"
                : "rgba(255,255,255,0.1)",
              color: canSubmit ? "#17110a" : "rgba(255,255,255,0.4)",
              fontSize: 16,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: "0.5px",
            }}
          >
            {busy ? "Submitting…" : hasSubmitted || localSubmitted ? "Submitted ✓" : "Submit Guess"}
          </button>
        </div>
      </div>
    </section>
  );
}
