"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import {
  createCompeteSessionRequest
} from "@/core/competeApi";
import { useIdentity } from "@/hooks/useIdentity";
import btnStyles from "@/components/ui/Button.module.css";

type Mode = "create" | "join";

export default function CompeteEntryPage() {
  const router = useRouter();
  const t = useTranslations('compete_page');
  
  // Redirect to home page - this route is deprecated
  useEffect(() => {
    router.push("/home");
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
      setError(t('err_identity'));
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
      setError(err instanceof Error ? err.message : t('err_create'));
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    if (!playerId) {
      setError(t('err_identity'));
      return;
    }
    const code = gameId.trim().toUpperCase();
    if (code.length === 0) {
      setError(t('err_code_required'));
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
        throw new Error((data as { error?: string }).error ?? t('err_join'));
      }
      const data = await res.json() as { gameId?: string };
      const resolvedGameId = data.gameId;
      if (!resolvedGameId) {
        throw new Error(t('invalid_server_response'));
      }
      redirectWithIdentity(resolvedGameId, "");
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err_join'));
      setLoading(false);
    }
  };

  const blocked = identityLoading || !isReady;

  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <span className="badge">{t('badge')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </section>

        <section className="card stack">
          {identityLoading ? (
            <p className="small">{t('establishing_identity')}</p>
          ) : identityError ? (
            <p style={{ color: "var(--gh-danger)", margin: 0 }}>{t('identity_error')} {identityError}</p>
          ) : null}
          <div className="row">
            <button
              type="button"
              className={`${btnStyles.btn} ${mode === "create" ? btnStyles.primary : btnStyles.secondary}`}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
              disabled={blocked || loading}
            >
              {t('create')}
            </button>
            <button
              type="button"
              className={`${btnStyles.btn} ${mode === "join" ? btnStyles.primary : btnStyles.secondary}`}
              onClick={() => {
                setMode("join");
                setError(null);
              }}
              disabled={blocked || loading}
            >
              {t('join')}
            </button>
          </div>

          {mode === "create" ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="timer-slider">
                  {t('round_timer')}: {roundTimerSec >= 60
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
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-2xs)", color: "var(--gh-text-muted)" }}>
                  <span>{t('timer_5s')}</span>
                  <span>{t('timer_5m')}</span>
                </div>
              </div>
              <button
                type="button"
                className={`${btnStyles.btn} ${btnStyles.primary}`}
                onClick={handleCreate}
                disabled={blocked || loading}
              >
                {loading ? t('creating') : t('create_game')}
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="field">
                <label htmlFor="join-game-id">{t('room_code_label')}</label>
                <input
                  id="join-game-id"
                  className="input"
                  type="text"
                  value={gameId.toUpperCase()}
                  onChange={(event) => setGameId(event.target.value)}
                  disabled={blocked || loading}
                  placeholder={t('room_code_placeholder')}
                />
              </div>
              <button
                type="button"
                className={`${btnStyles.btn} ${btnStyles.primary}`}
                onClick={handleJoin}
                disabled={blocked || loading}
              >
                {loading ? t('joining') : t('join_game')}
              </button>
            </div>
          )}

          {error ? (
            <p style={{ color: "var(--gh-danger)", margin: 0 }}>{error}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
