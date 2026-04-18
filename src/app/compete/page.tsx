"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCompeteSessionRequest,
  joinCompeteSessionRequest
} from "@/core/competeApi";

type Mode = "create" | "join";

export default function CompeteEntryPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [displayName, setDisplayName] = useState("");
  const [gameId, setGameId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistAndRedirect = (targetGameId: string, playerId: string, name: string) => {
    try {
      sessionStorage.setItem(`compete_player_id_${targetGameId}`, playerId);
      sessionStorage.setItem(`compete_display_name_${targetGameId}`, name);
    } catch {
      // ignore storage errors
    }
    router.push(`/compete/${targetGameId}`);
  };

  const handleCreate = async () => {
    setError(null);
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    setLoading(true);
    try {
      const snapshot = await createCompeteSessionRequest({
        displayName: displayName.trim(),
        mode: "sync",
        totalRounds: 5
      });
      if (!snapshot.viewerPlayerId) {
        throw new Error("Server did not return a viewer player id");
      }
      persistAndRedirect(snapshot.gameId, snapshot.viewerPlayerId, displayName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    if (!gameId.trim() || !displayName.trim()) {
      setError("Game ID and display name are required");
      return;
    }
    setLoading(true);
    try {
      const snapshot = await joinCompeteSessionRequest({
        gameId: gameId.trim(),
        displayName: displayName.trim()
      });
      if (!snapshot.viewerPlayerId) {
        throw new Error("Server did not return a viewer player id");
      }
      persistAndRedirect(snapshot.gameId, snapshot.viewerPlayerId, displayName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join game");
      setLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <span className="badge">Compete</span>
          <h1>Multiplayer Sync Game</h1>
          <p>Create a new 5-round sync session or join an existing one by game ID.</p>
        </section>

        <section className="card stack">
          <div className="row">
            <button
              type="button"
              className={mode === "create" ? "button" : "button secondary"}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
              disabled={loading}
            >
              Create
            </button>
            <button
              type="button"
              className={mode === "join" ? "button" : "button secondary"}
              onClick={() => {
                setMode("join");
                setError(null);
              }}
              disabled={loading}
            >
              Join
            </button>
          </div>

          {mode === "create" ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="create-name">Display Name</label>
                <input
                  id="create-name"
                  className="input"
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={loading}
                  placeholder="Your name"
                />
              </div>
              <button
                type="button"
                className="button"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? "Creating…" : "Create Game"}
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="field">
                <label htmlFor="join-game-id">Game ID</label>
                <input
                  id="join-game-id"
                  className="input"
                  type="text"
                  value={gameId}
                  onChange={(event) => setGameId(event.target.value)}
                  disabled={loading}
                  placeholder="game-id"
                />
              </div>
              <div className="field">
                <label htmlFor="join-name">Display Name</label>
                <input
                  id="join-name"
                  className="input"
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={loading}
                  placeholder="Your name"
                />
              </div>
              <button
                type="button"
                className="button"
                onClick={handleJoin}
                disabled={loading}
              >
                {loading ? "Joining…" : "Join Game"}
              </button>
            </div>
          )}

          {error ? (
            <p style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
