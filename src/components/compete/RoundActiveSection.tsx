import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { YearPicker } from "@/components/game/YearPicker";
import type { YearPickerHandle, YearPickerScale } from "@/components/game/YearPicker";
import dynamic from "next/dynamic";
import { useState, useRef, useCallback } from "react";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

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
  viewer,
}: RoundActiveSectionProps) {
  const currentEvent = snapshot.rounds?.[snapshot.currentRoundIndex];
  const guessLocation = guessLat !== null && guessLng !== null
    ? { lat: guessLat, lng: guessLng }
    : null;

  const handleMapSetLocation = (location: { lat: number; lng: number }) => {
    onSetLocation(location);
  };

  const [minimapExpanded, setMinimapExpanded] = useState(false);
  const yearPickerRef = useRef<YearPickerHandle | null>(null);
  const [yearScale, setYearScale] = useState<YearPickerScale>('century');

  const effectiveMinYear = snapshot.config.yearMin;
  const effectiveMaxYear = snapshot.config.yearMax;
  const pickerValue = Math.min(Math.max(1950, effectiveMinYear), effectiveMaxYear);
  const selectedYear = guessYear;
  const isYearSelected = selectedYear !== null;

  const handleYearChange = useCallback((nextYear: number) => {
    guessYearRef.current = nextYear;
    onSetYear(nextYear);
  }, [guessYearRef, onSetYear]);

  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const canInteract = !(hasSubmitted || localSubmitted || busy);

  return (
    <section style={{
      position: "fixed",
      inset: 0,
      zIndex: 30,
      display: "flex",
      flexDirection: "column",
      background: "#000",
      overflow: "hidden",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>
      {/* Top overlay bar */}
      <div style={{
        height: 48,
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: "1px", textTransform: "uppercase" }}>
          Round {snapshot.currentRoundIndex + 1}
        </span>
        <span style={{
          fontSize: 15,
          fontWeight: 500,
          color: timeRemaining !== null && timeRemaining <= 10 ? "#ef4444" : "#fff",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.5px",
        }}>
          {timeRemaining === null ? "—" : formatTime(timeRemaining)}
        </span>
      </div>

      {/* Main image surface */}
      <div style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        minHeight: 0,
      }}>
        {currentEvent?.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={currentEvent.imageUrl}
            alt={currentEvent.title ?? "Historical image"}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div style={{
            width: "100%",
            height: "100%",
            background: "#0f0f0f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 14,
          }}>
            No image available
          </div>
        )}

        {/* Floating translucent minimap */}
        <div style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          width: minimapExpanded ? "min(300px, 60vw)" : "min(120px, 26vw)",
          height: minimapExpanded ? "min(220px, 35vh)" : "min(120px, 26vw)",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          transition: "width 0.3s ease, height 0.3s ease",
          zIndex: 5,
          pointerEvents: canInteract ? "auto" : "none",
        }}>
          <div style={{ width: "100%", height: "100%", filter: minimapExpanded ? "none" : "saturate(0.6) brightness(0.85)" }}>
            <GameMap
              guessLocation={guessLocation}
              onSetLocation={handleMapSetLocation}
              localPlayerAvatarUrl={viewer?.avatarUrl ?? null}
              localPlayerDisplayName={viewer?.displayName}
            />
          </div>

          {/* Compact overlay */}
          {!minimapExpanded && (
            <div
              onClick={() => setMinimapExpanded(true)}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.2)",
                cursor: "pointer",
                zIndex: 10,
              }}
            >
              <span style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.8)",
                fontWeight: 600,
                letterSpacing: "1px",
                textTransform: "uppercase",
                padding: "4px 8px",
                borderRadius: 4,
                background: "rgba(0,0,0,0.4)",
              }}>
                Map
              </span>
            </div>
          )}

          {/* Collapse button */}
          {minimapExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); setMinimapExpanded(false); }}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: 16,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 10,
                padding: 0,
              }}
              aria-label="Collapse map"
              type="button"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Persistent timeline */}
      <div
        style={{
          height: 104,
          background: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 10px 10px",
          flexShrink: 0,
          opacity: canInteract ? 1 : 0.5,
          pointerEvents: canInteract ? "auto" : "none",
        }}
      >
        <YearPicker
          ref={yearPickerRef}
          value={selectedYear ?? pickerValue}
          onChange={handleYearChange}
          min={effectiveMinYear}
          max={effectiveMaxYear}
          defaultScale={yearScale}
          onScaleChange={setYearScale}
          className="w-full"
          valueIsCommitted={isYearSelected}
        />
      </div>

      {/* Bottom action area */}
      <div style={{
        padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
        background: "rgba(0, 0, 0, 0.9)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || hasSubmitted || localSubmitted || guessYear === null || guessLocation === null}
          style={{
            width: "100%",
            maxWidth: 320,
            height: 52,
            borderRadius: 999,
            border: "none",
            background: busy || hasSubmitted || localSubmitted || guessYear === null || guessLocation === null
              ? "rgba(255,255,255,0.1)"
              : "linear-gradient(135deg, #ff8a00, #ffae42)",
            color: busy || hasSubmitted || localSubmitted || guessYear === null || guessLocation === null
              ? "rgba(255,255,255,0.4)"
              : "#17110a",
            fontSize: 16,
            fontWeight: 700,
            cursor: busy || hasSubmitted || localSubmitted || guessYear === null || guessLocation === null
              ? "not-allowed"
              : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: "0.5px",
          }}
        >
          {busy ? "Submitting…" : "Submit Guess"}
        </button>

        <button
          type="button"
          onClick={onOpenHints}
          disabled={busy || hasSubmitted || localSubmitted}
          style={{
            background: "transparent",
            border: "none",
            color: busy || hasSubmitted || localSubmitted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
            fontSize: 13,
            fontWeight: 500,
            cursor: busy || hasSubmitted || localSubmitted ? "not-allowed" : "pointer",
            padding: "8px 16px",
            letterSpacing: "0.5px",
          }}
        >
          Hints
        </button>
      </div>
    </section>
  );
}
