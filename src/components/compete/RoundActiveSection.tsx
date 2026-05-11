import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import dynamic from "next/dynamic";

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

  return (
    <section className="card stack">
      {currentEvent ? (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 500, fontSize: 15, marginBottom: 8 }}>
            {currentEvent.title}
          </p>
          {currentEvent.imageUrl ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentEvent.imageUrl}
                alt={currentEvent.title}
                style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 8, display: "block" }}
              />
            </div>
          ) : (
            <div style={{
              width: "100%", height: 200, background: "var(--color-background-secondary)",
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-text-secondary)", fontSize: 14
            }}>
              No image available
            </div>
          )}
        </div>
      ) : null}
      <h2>Round {snapshot.currentRoundIndex + 1}</h2>
      <p>
        Time remaining: <strong>{timeRemaining === null ? "—" : `${Math.max(0, Math.floor(timeRemaining))}s`}</strong>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: 6 }}>
          / {snapshot.config.roundTimerSec}s
        </span>
      </p>
      <div className="row">
        <div className="metric">
          <span className="small">Submitted</span>
          <strong>
            {snapshot.players.filter((p) => p.hasSubmitted && p.leftAt === null).length}
            {" / "}
            {snapshot.players.filter((p) => p.leftAt === null).length}
          </strong>
        </div>
      </div>
      <div className="stack">
        <div className="field">
          <label htmlFor="guess-year">Year</label>
          <input
            id="guess-year"
            className="input"
            type="number"
            placeholder={guessYear === null ? "— not set —" : undefined}
            value={guessYear ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                guessYearRef.current = null;
                onSetYear(null);
              } else {
                const num = Number(v);
                if (!Number.isNaN(num)) {
                  guessYearRef.current = num;
                  onSetYear(num);
                }
              }
            }}
            disabled={busy || hasSubmitted}
          />
          <input
            type="range"
            min={-3000}
            max={new Date().getFullYear()}
            // TODO: wire min/max from session config when available
            value={guessYear ?? Math.floor((-3000 + new Date().getFullYear()) / 2)}
            onChange={(e) => {
              guessYearRef.current = Number(e.target.value);
              onSetYear(Number(e.target.value));
            }}
            disabled={busy || hasSubmitted}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ width: "100%", height: "320px", borderRadius: "20px", overflow: "hidden", pointerEvents: (hasSubmitted || localSubmitted) ? "none" : "auto" }}>
          <GameMap
            guessLocation={guessLocation}
            onSetLocation={handleMapSetLocation}
            localPlayerAvatarUrl={viewer?.avatarUrl ?? null}
            localPlayerDisplayName={viewer?.displayName}
          />
        </div>
        <button
          type="button"
          className="button"
          onClick={onSubmit}
          disabled={
            busy ||
            hasSubmitted ||
            localSubmitted ||
            guessYear === null ||
            guessLocation === null
          }
        >
          {busy ? "Submitting…" : "Submit Guess"}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={onOpenHints}
          disabled={busy || hasSubmitted || localSubmitted}
        >
          Hints
        </button>
      </div>
    </section>
  );
}
