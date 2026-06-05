"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createCompeteSessionRequest
} from "@/core/competeApi";
import { useIdentity } from "@/hooks/useIdentity";

type Mode = "create" | "join";

export default function CompeteEntryPage() {
  const router = useRouter();
  
  // Redirect to home page - this route is deprecated
  useEffect(() => {
    router.push("/");
  }, [router]);
  const { playerId, isReady, isLoading: identityLoading, error: identityError } = useIdentity();
  const [mode, setMode] = useState<Mode>("create");
  const [gameId, setGameId] = useState("");
  const [roundTimerSec, setRoundTimerSec] = useState<number>(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectWithIdentity = (targetGameId: string, name: string) => {
    try {
      sessionStorage.setItem(`compete_display_name_${targetGameId}`, name);
    } catch {
      // ignore storage errors
    }
    router.push(`/compete/${targetGameId}`);
  };

  const handleCreate = async () => {
    setError(null);
    if (!playerId) {
      setError("Identity not ready — please wait");
      return;
    }
    setLoading(true);
    try {
      const snapshot = await createCompeteSessionRequest({
        mode: "sync",
        totalRounds: 5,
        roundTimerSec,
        playerId
      });
      redirectWithIdentity(snapshot.gameId, "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    if (!playerId) {
      setError("Identity not ready — please wait");
      return;
    }
    const code = gameId.trim().toUpperCase();
    if (code.length === 0) {
      setError("Room code is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/compete/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to join game");
      }
      const data = await res.json() as { gameId?: string };
      const resolvedGameId = data.gameId;
      if (!resolvedGameId) {
        throw new Error("Invalid response from server");
      }
      redirectWithIdentity(resolvedGameId, "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join game");
      setLoading(false);
    }
  };

  const blocked = identityLoading || !isReady;

  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <span className="badge">Compete</span>
          <h1>Multiplayer Sync Game</h1>
          <p>Create a new 5-round sync session or join an existing one by game ID.</p>
        </section>

        <section className="card stack">
          {identityLoading ? (
            <p className="small">Establishing identity…</p>
          ) : identityError ? (
            <p style={{ color: "#ff6b6b", margin: 0 }}>Identity error: {identityError}</p>
          ) : null}
          <div className="row">
            <button
              type="button"
              className={mode === "create" ? "button" : "button secondary"}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
              disabled={blocked || loading}
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
              disabled={blocked || loading}
            >
              Join
            </button>
          </div>

          {mode === "create" ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="timer-slider">
                  Round Timer: {roundTimerSec >= 60
                    ? `${Math.floor(roundTimerSec / 60)}m ${roundTimerSec % 60 > 0 ? `${roundTimerSec % 60}s` : ""}`.trim()
                    : `${roundTimerSec}s`}
                </label>
                <input
                  id="timer-slider"
                  type="range"
                  min={5}
                  max={300}
                  step={5}
                  value={roundTimerSec}
                  onChange={(e) => setRoundTimerSec(Number(e.target.value))}
                  disabled={blocked || loading}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--gh-text-muted)" }}>
                  <span>5s</span>
                  <span>5m</span>
                </div>
              </div>
              <button
                type="button"
                className="button"
                onClick={handleCreate}
                disabled={blocked || loading}
              >
                {loading ? "Creating…" : "Create Game"}
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="field">
                <label htmlFor="join-game-id">Room Code</label>
                <input
                  id="join-game-id"
                  className="input"
                  type="text"
                  value={gameId.toUpperCase()}
                  onChange={(event) => setGameId(event.target.value)}
                  disabled={blocked || loading}
                  placeholder="e.g. SSJC5Q"
                />
              </div>
              <button
                type="button"
                className="button"
                onClick={handleJoin}
                disabled={blocked || loading}
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
