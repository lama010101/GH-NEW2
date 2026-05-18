"use client";

import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import dynamic from "next/dynamic";
import { useState, useRef } from "react";
import { useGesture } from "@use-gesture/react";
import { YearPicker } from "@/components/YearPicker";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

interface RoundActiveSectionProps {
  snapshot: CompeteSessionSnapshot;
  playerId: string | null;
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
  timeRemaining: number | null;
}


export default function RoundActiveSection({
  snapshot,
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
  timeRemaining,
}: RoundActiveSectionProps) {
  const currentEvent = snapshot.rounds?.[snapshot.currentRoundIndex];
  const guessLocation =
    guessLat !== null && guessLng !== null
      ? { lat: guessLat, lng: guessLng }
      : null;

  const [minimapExpanded, setMinimapExpanded] = useState(false);
  // Fullscreen map: width = 100vw, height = 100vw (square)
  const mapSize = minimapExpanded
    ? { width: "100vw", height: "100vw", bottom: 0, right: 0, borderRadius: 0 }
    : { width: 120, height: 120, bottom: 200, right: 12, borderRadius: 12 };

  const [imgOffsetX, setImgOffsetX] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  const yearMin = snapshot.config.yearMin;
  const yearMax = snapshot.config.yearMax;

  const isLocked = busy || hasSubmitted || localSubmitted;
  const canSubmit = !isLocked && guessYear !== null && guessLocation !== null;

  const handleMapSetLocation = (location: { lat: number; lng: number }) => {
    if (!isLocked) {
      onSetLocation(location);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const bindImageDrag = useGesture(
    {
      onDrag: ({ movement: [mx], memo, first }) => {
        const startOffset = first ? imgOffsetX : (memo as number);
        const container = imgContainerRef.current;
        const img = imgRef.current;
        if (!container || !img) return startOffset;
        // Natural image width at full viewport height
        const containerH = container.clientHeight;
        const naturalW = (containerH * 16) / 9;
        const containerW = container.clientWidth;
        // Max pan: only if image is wider than container
        const maxPan = Math.max(0, (naturalW - containerW) / 2);
        const next = startOffset + mx;
        const clamped = Math.max(-maxPan, Math.min(maxPan, next));
        setImgOffsetX(clamped);
        return startOffset;
      },
    },
    { drag: { axis: "x", filterTaps: true } }
  );

  return (
    <section
      style={{
        height: "100dvh",
        width: "100vw",
        background: "#111",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 30,
      }}
    >
      <style>{`
        .minimap-container .leaflet-control-zoom {
          display: none !important;
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .minimap-fullscreen .leaflet-container {
          border-radius: 0 !important;
        }
        .minimap-fullscreen > div {
          border-radius: 0 !important;
        }
      `}</style>

      {/* IMAGE CONTAINER — full section size, clips overflow */}
      <div
        ref={imgContainerRef}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          touchAction: "pan-y",
        }}
        {...bindImageDrag()}
      >
        {currentEvent?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={currentEvent.imageUrl}
            alt="Historical event"
            draggable={false}
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: `translateX(calc(-50% + ${imgOffsetX}px))`,
              height: "100%",
              width: "auto",
              minWidth: "100%",
              objectFit: "cover",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#222" }} />
        )}
      </div>

      {timeRemaining !== null && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 15,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 14,
            fontWeight: 700,
            color: timeRemaining <= 10 ? "#ef4444" : "#ffffff",
            fontVariantNumeric: "tabular-nums",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {formatTime(timeRemaining)}
        </div>
      )}

      {/* MINIMAP overlay */}
      <div
        className="minimap-container"
        style={{
          position: "absolute",
          bottom: mapSize.bottom,
          right: mapSize.right,
          width: mapSize.width,
          height: mapSize.height,
          borderRadius: mapSize.borderRadius,
          overflow: "hidden",
          border: minimapExpanded ? "none" : "2px solid rgba(255,255,255,0.2)",
          boxShadow: minimapExpanded ? "none" : "0 2px 12px rgba(0,0,0,0.5)",
          transition: "width 0.25s ease, height 0.25s ease, border-radius 0.25s ease",
          zIndex: minimapExpanded ? 25 : 21,
          cursor: "pointer",
          display: minimapExpanded ? "none" : "block",
        }}
        onClick={() => setMinimapExpanded((v) => !v)}
      >
        <GameMap
          guessLocation={guessLocation}
          onSetLocation={handleMapSetLocation}
        />
      </div>

      {minimapExpanded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            background: "#111",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px 10px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#ffae42" }}>Where?</span>
            </div>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
              {guessLocation ? "Location selected ✓" : "Choose a location"}
            </span>
          </div>

          {/* Map — fills remaining height */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: "relative",
            }}
          >
            <div
              className="minimap-container minimap-fullscreen"
              style={{ width: "100%", height: "100%" }}
            >
              <GameMap
                guessLocation={guessLocation}
                onSetLocation={(loc) => {
                  handleMapSetLocation(loc);
                }}
              />
            </div>
            {/* Tap outside map to close — invisible backdrop behind map */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: -1,
              }}
              onClick={() => setMinimapExpanded(false)}
            />
          </div>

          {/* Bottom nav row — same as main bottom nav */}
          <div
            style={{
              flexShrink: 0,
              background: "rgba(17,17,17,0.95)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              padding: "12px 16px calc(20px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={() => { window.location.href = "/"; }}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.55)",
                fontSize: 22,
                cursor: "pointer",
                padding: "8px 12px",
                lineHeight: 1,
              }}
              aria-label="Home"
            >
              ⌂
            </button>
            <button
              type="button"
              onClick={() => { setMinimapExpanded(false); onSubmit(); }}
              disabled={!canSubmit}
              style={{
                flex: 1,
                maxWidth: 220,
                height: 48,
                borderRadius: 999,
                border: "none",
                background: canSubmit
                  ? "linear-gradient(135deg, #ff8a00, #ffae42)"
                  : "rgba(255,255,255,0.1)",
                color: canSubmit ? "#17110a" : "rgba(255,255,255,0.3)",
                fontSize: 15,
                fontWeight: 700,
                cursor: canSubmit ? "pointer" : "not-allowed",
                letterSpacing: "0.4px",
                margin: "0 12px",
              }}
            >
              {busy ? "Submitting…" : hasSubmitted || localSubmitted ? "Submitted ✓" : "Make Guess"}
            </button>
            <button
              type="button"
              onClick={onOpenHints}
              disabled={isLocked}
              style={{
                background: "transparent",
                border: "none",
                color: isLocked ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.55)",
                fontSize: 13,
                fontWeight: 600,
                cursor: isLocked ? "not-allowed" : "pointer",
                padding: "8px 12px",
                letterSpacing: "0.3px",
              }}
            >
              Hints
            </button>
          </div>
        </div>
      )}

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
          padding: "16px 16px calc(28px + env(safe-area-inset-bottom))",
          zIndex: 20,
        }}
      >
        {/* YEAR INPUT ROW */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <input
            type="number"
            min={yearMin}
            max={yearMax}
            value={guessYear ?? ""}
            placeholder="Year"
            disabled={isLocked}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onSetYear(null);
                guessYearRef.current = null;
                return;
              }
              const parsed = parseInt(raw, 10);
              if (!isNaN(parsed)) {
                const clamped = Math.max(yearMin, Math.min(yearMax, parsed));
                onSetYear(clamped);
                guessYearRef.current = clamped;
              }
            }}
            style={{
              width: 100,
              height: 40,
              borderRadius: 10,
              border: "1.5px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.07)",
              color: guessYear !== null ? "#ffae42" : "rgba(255,255,255,0.4)",
              fontSize: 18,
              fontWeight: 700,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              outline: "none",
              padding: "0 8px",
              MozAppearance: "textfield",
            } as React.CSSProperties}
          />
        </div>

        <YearPicker
          value={guessYear ?? Math.round((yearMin + yearMax) / 2)}
          onChange={(year) => {
            onSetYear(year);
            guessYearRef.current = year;
          }}
          min={yearMin}
          max={yearMax}
          defaultScale="century"
          valueIsCommitted={guessYear !== null}
          className="w-full"
        />

        {/* BOTTOM NAV ROW — no background, 3 elements */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            paddingTop: 4,
          }}
        >
          {/* Home button — left */}
          <button
            type="button"
            onClick={() => { window.location.href = "/"; }}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.55)",
              fontSize: 22,
              cursor: "pointer",
              padding: "8px 12px",
              lineHeight: 1,
            }}
            aria-label="Home"
          >
            ⌂
          </button>

          {/* Make Guess button — center, primary CTA */}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1,
              maxWidth: 220,
              height: 48,
              borderRadius: 999,
              border: "none",
              background: canSubmit
                ? "linear-gradient(135deg, #ff8a00, #ffae42)"
                : "rgba(255,255,255,0.1)",
              color: canSubmit ? "#17110a" : "rgba(255,255,255,0.3)",
              fontSize: 15,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
              letterSpacing: "0.4px",
              margin: "0 12px",
            }}
          >
            {busy ? "Submitting…" : hasSubmitted || localSubmitted ? "Submitted ✓" : "Make Guess"}
          </button>

          {/* Hints button — right */}
          <button
            type="button"
            onClick={onOpenHints}
            disabled={isLocked}
            style={{
              background: "transparent",
              border: "none",
              color: isLocked ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.55)",
              fontSize: 13,
              fontWeight: 600,
              cursor: isLocked ? "not-allowed" : "pointer",
              padding: "8px 12px",
              letterSpacing: "0.3px",
            }}
          >
            Hints
          </button>
        </div>
      </div>
    </section>
  );
}
