import type { Badge, EventRecord, LatLng } from "@/core/types";
import { GameMap } from "@/components/GameMap";

type MetricItem = {
  label: string;
  value: string | number;
};

export function formatLatLng(location: LatLng) {
  return `${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}`;
}

export function getEventCoordinates(event: EventRecord): LatLng {
  const { lat, lng } = event.location;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("[GEO_HARD_FAIL] Invalid geo coordinates from API - location.lat or location.lng is not finite");
  }

  return { lat, lng };
}

export function formatEventGeoLabel(event: EventRecord) {
  return event.location.name;
}

export function formatAccuracy(value: number) {
  return `${value}%`;
}

export function PersistenceErrorCard({ message }: { message: string }) {
  return (
    <section className="card" style={{ background: "rgba(239, 68, 68, 0.08)" }}>
      <h3>Persistence failed</h3>
      <p className="small">{message}</p>
    </section>
  );
}

export function BadgePills({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) {
    return <p className="small">No badges this round.</p>;
  }

  return (
    <div className="row">
      {badges.map((badge) => (
        <span className="badge" key={`${badge.dimension}-${badge.tier}`}>
          {badge.dimension} · {badge.tier} · {badge.accuracy}%
        </span>
      ))}
    </div>
  );
}

export function EventRevealCard({
  activeEvent,
  revealLabel,
  disablePointerEvents = false
}: {
  activeEvent: EventRecord;
  revealLabel: string;
  disablePointerEvents?: boolean;
}) {
  const geoLabel = formatEventGeoLabel(activeEvent);

  return (
    <article className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2>{activeEvent.title}</h2>
          <p>{activeEvent.description}</p>
          <p className="small" style={{ marginTop: 8 }}>
            📍 {geoLabel} · {activeEvent.region}
          </p>
        </div>
        <span className="badge">{activeEvent.region}</span>
      </div>
      <div className="card" style={{ marginTop: 16, background: "rgba(0, 0, 0, 0.18)" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="badge">{revealLabel}</span>
          <span className="small">{activeEvent.imageUrl ? "Real historical image" : "No image available"}</span>
        </div>
        <div className="map-grid" style={{ marginTop: 16, height: 260, cursor: "default", position: "relative", overflow: "hidden" }}>
          {activeEvent.imageUrl ? (
            <img
              src={activeEvent.imageUrl}
              alt={activeEvent.title}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                ...(disablePointerEvents ? { pointerEvents: "none" as const } : {})
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted)",
                textAlign: "center",
                padding: 20,
                ...(disablePointerEvents ? { pointerEvents: "none" as const } : {})
              }}
            >
              🖼️ No image available for this event
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function GuessLocationCard({
  guessLocation,
  onSetLocation
}: {
  guessLocation: LatLng | null;
  onSetLocation: (location: LatLng) => void;
}) {
  console.log("[GUESS_LOCATION_CARD_RENDER]", {
    guessLocation,
    timestamp: Date.now()
  });

  return (
    <article className="card">
      <h3>Guess location</h3>
      <p>Click the map to place a marker. Re-clicking moves the marker.</p>
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 10",
          borderRadius: "20px",
          overflow: "hidden",
          border: "1px solid var(--border)"
        }}
      >
        <GameMap guessLocation={guessLocation} onSetLocation={onSetLocation} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <span className="small">
          {guessLocation ? formatLatLng(guessLocation) : "No location selected"}
        </span>
      </div>
    </article>
  );
}

export function GuessYearCard({
  guessYear,
  onSetYear
}: {
  guessYear: number | null;
  onSetYear: (year: number | null) => void;
}) {
  return (
    <article className="card">
      <h3>Guess year</h3>
      <div className="field">
        <label htmlFor="year-guess">Enter a year</label>
        <input
          id="year-guess"
          className="input"
          type="number"
          step={1}
          placeholder="Choose a year"
          value={guessYear ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            onSetYear(value === "" ? null : Number(value));
          }}
        />
      </div>
      <p className="small" style={{ marginTop: 10 }}>
        The year starts empty, so the player must choose it explicitly.
      </p>
    </article>
  );
}

export function RoundActionsCard({
  isSubmitDisabled,
  onSubmit,
  onRestart
}: {
  isSubmitDisabled: boolean;
  onSubmit: () => void;
  onRestart: () => void;
}) {
  return (
    <article className="card">
      <h3>Actions</h3>
      <div className="row">
        <button type="button" className="button" disabled={isSubmitDisabled} onClick={onSubmit}>
          Submit Guess
        </button>
        <button type="button" className="button secondary" onClick={onRestart}>
          Restart
        </button>
      </div>
      <p className="small" style={{ marginTop: 10 }}>
        Submit is enabled only when both year and location exist.
      </p>
    </article>
  );
}

export function RoundStatusCard({
  hasPassedPreflight,
  roundsCompleted
}: {
  hasPassedPreflight: boolean;
  roundsCompleted: number;
}) {
  return (
    <article className="card">
      <h3>Round status</h3>
      <p className="small">Preflight passed: {hasPassedPreflight ? "yes" : "no"}</p>
      <p className="small">Rounds completed: {roundsCompleted}</p>
      <p className="small">Locked submission window: no</p>
    </article>
  );
}

export function MetricsGrid({ items }: { items: MetricItem[] }) {
  return (
    <div className="results-grid" style={{ marginTop: 16 }}>
      {items.map((item) => (
        <div className="metric" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function LoadingScreen({ message = "Loading game session..." }: { message?: string }) {
  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="card">
          <span className="badge">Loading</span>
          <h1>{message}</h1>
          <p>Reconstructing the authoritative session projection from durable server data.</p>
        </section>
      </div>
    </main>
  );
}
