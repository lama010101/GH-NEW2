import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import { getUsernameGradientStyle, shortId } from "@/core/competeUtils";
import PlayerAvatar from "@/components/compete/PlayerAvatar";

interface LobbySectionProps {
  snapshot: CompeteSessionSnapshot;
  viewer: SessionPlayer | null;
  busy: boolean;
  error: string | null;
  onToggleReady: () => void;
  onStartGame: () => void;
}

export default function LobbySection({
  snapshot,
  viewer,
  busy,
  error,
  onToggleReady,
  onStartGame,
}: LobbySectionProps) {
  const renderError = error ? <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p> : null;

  return (
    <section className="card stack">
      <h2>Lobby</h2>
      <div className="stack">
        {snapshot.players.length === 0 ? (
          <p className="small">No players yet.</p>
        ) : (
          snapshot.players.map((p) => (
            <div key={p.playerId} className="row">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <PlayerAvatar avatarUrl={p.avatarUrl} displayName={p.displayName || shortId(p.playerId)} />
                <span style={getUsernameGradientStyle(p.playerId)}>{p.displayName || shortId(p.playerId)}</span>
              </span>
              {p.isHost ? <span className="badge">Host</span> : null}
              <span className="small">{p.ready ? "Ready" : "Not ready"}</span>
            </div>
          ))
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
        Round timer:{" "}
        <strong>
          {snapshot.config.roundTimerSec >= 60
            ? `${Math.floor(snapshot.config.roundTimerSec / 60)}m${snapshot.config.roundTimerSec % 60 > 0 ? ` ${snapshot.config.roundTimerSec % 60}s` : ""}` 
            : `${snapshot.config.roundTimerSec}s`}
        </strong>
      </p>
      <div className="row">
        <button
          type="button"
          className="button secondary"
          onClick={onToggleReady}
          disabled={busy || Boolean(viewer?.ready)}
        >
          {viewer?.ready ? "Ready ✓" : "Ready"}
        </button>
        {viewer?.isHost ? (
          <button type="button" className="button" onClick={onStartGame} disabled={busy || !snapshot.allPlayersReady}>
            Start Game
          </button>
        ) : (
          <span className="small">Waiting for host to start…</span>
        )}
      </div>
      {renderError}
    </section>
  );
}
