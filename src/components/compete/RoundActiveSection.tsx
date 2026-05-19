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
  hintsUsedCount?: number;
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
  hintsUsedCount,
}: RoundActiveSectionProps) {
  const currentEvent = snapshot.rounds?.[snapshot.currentRoundIndex];
  const guessLocation =
    guessLat !== null && guessLng !== null
      ? { lat: guessLat, lng: guessLng }
      : null;

  const [panelVisible, setPanelVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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


      {/* NEW BOTTOM PANEL */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
        }}
      >
        {/* HIDE/SHOW BUTTON */}
        <button
          type="button"
          onClick={() => setPanelVisible((v) => !v)}
          style={{
            position: "absolute",
            bottom: 72,
            left: "50%",
            transform: "translateX(-50%)",
            width: 32,
            height: 32,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "50%",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.6)",
            fontSize: 16,
            zIndex: 21,
          }}
          aria-label={panelVisible ? "Hide panel" : "Show panel"}
        >
          {panelVisible ? "▾" : "▴"}
        </button>

        {/* WHERE CARD */}
        {panelVisible && (
          <div
            style={{
              background: "#1a1714",
              borderRadius: "14px 14px 0 0",
              padding: "12px 16px 0",
            }}
          >
            {/* Header Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#fb923c" }}>Where?</span>
              </div>
              {guessLocation && (
                <span style={{ fontSize: 13, color: "#fb923c", fontWeight: 600 }}>Location set ✓</span>
              )}
            </div>

            {/* Search Field */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search a place (city, country)…"
              disabled={isLocked}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "rgba(255,255,255,0.55)",
                fontSize: 14,
                outline: "none",
                marginBottom: 8,
              }}
            />

            {/* Map */}
            <div
              style={{
                height: 180,
                width: "100%",
                borderRadius: 10,
                overflow: "hidden",
                marginBottom: 10,
              }}
            >
              <GameMap
                guessLocation={guessLocation}
                onSetLocation={handleMapSetLocation}
              />
            </div>
          </div>
        )}

        {/* WHEN CARD */}
        {panelVisible && (
          <div
            style={{
              background: "#1a1714",
              padding: "12px 16px 0",
            }}
          >
            {/* Header Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#fb923c" }}>When?</span>
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#fb923c", fontVariantNumeric: "tabular-nums" }}>
                {guessYear !== null ? guessYear : "--"}
              </span>
            </div>

            {/* Year Picker */}
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
          </div>
        )}

        {/* NAVBAR */}
        <div
          style={{
            background: "rgba(20,18,16,0.97)",
            padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Settings Button */}
          <button
            type="button"
            style={{
              width: 40,
              height: 40,
              background: "rgba(255,255,255,0.08)",
              border: "none",
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* Hints Pill Button */}
          <button
            type="button"
            onClick={onOpenHints}
            disabled={isLocked}
            style={{
              background: "linear-gradient(135deg, #a8edbc, #7dd8f0, #c4b5f7)",
              border: "none",
              borderRadius: 999,
              height: 40,
              padding: "0 20px",
              cursor: isLocked ? "not-allowed" : "pointer",
              opacity: isLocked ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: "#111", fontSize: 14, fontWeight: 700 }}>Hints</span>
            <span
              style={{
                background: "rgba(0,0,0,0.25)",
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: 700,
                color: "#111",
              }}
            >
              {hintsUsedCount ?? 0}/14
            </span>
          </button>

          {/* Make Guess Button */}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              height: 40,
              borderRadius: 999,
              padding: "0 20px",
              border: "none",
              background: busy || hasSubmitted || localSubmitted
                ? "rgba(255,255,255,0.10)"
                : canSubmit
                ? "linear-gradient(135deg, #ff8a00, #ffae42)"
                : "rgba(255,255,255,0.10)",
              color: busy || hasSubmitted || localSubmitted
                ? "rgba(255,255,255,0.5)"
                : canSubmit
                ? "#17110a"
                : "rgba(255,255,255,0.28)",
              fontSize: 14,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {!busy && !hasSubmitted && !localSubmitted && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
            {busy ? "Submitting…" : hasSubmitted || localSubmitted ? "Submitted ✓" : "Make Guess"}
          </button>
        </div>
      </div>
    </section>
  );
}
