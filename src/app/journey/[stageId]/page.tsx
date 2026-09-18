"use client";

// Historian's Journey — stage detail / play entry / completion recap
// (HJ-BUILD-JOURNEYUI-001).
//
// This page is the SINGLE owner of journey completion on the client:
//   pending playthrough (sessionStorage marker, or DB fallback via
//   journey_playthroughs.completed_at IS NULL) → check session status via
//   GET /api/compete/{gameId} → SESSION_COMPLETE → POST /api/journey/complete
//   → Journey recap view (server-returned accuracyPct/badgeAwarded verbatim,
//   never recomputed client-side).
// An "already completed" 400 (double-invoke / storage loss after a prior
// completion) reconstructs the recap from the journey_playthroughs row —
// DB is the source of truth.
//
// Round-by-round play is NOT re-implemented here: Start routes into the
// existing /practice/[gameId] flow (journey sessions are mode='practice'
// with the host session_player ready=true, so its LOBBY auto-start works
// unchanged). playthroughId is threaded via sessionStorage.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useIdentity } from "@/hooks/useIdentity";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import {
  bootstrapIdentity,
  subscribeToIdentityChanges,
  forceClearAuthStorage,
  type IdentityState,
} from "@/core/identity";
import type { CompleteJourneyPlaythroughResult } from "@/server/journeyCore";
import { JourneyBadge } from "../_components/JourneyBadge";
import {
  clearActivePlaythrough,
  readActivePlaythrough,
  writeActivePlaythrough,
  type JourneyProgressRow,
  type JourneyStageRow,
} from "../_components/journeyStorage";
import pageStyles from "./page.module.css";

type PendingAttempt = { playthroughId: string; gameId: string };

export default function JourneyStagePage() {
  const router = useRouter();
  const params = useParams<{ stageId: string }>();
  const stageId = typeof params?.stageId === "string" ? params.stageId : "";

  const t = useTranslations("journey");
  const tGame = useTranslations("game");
  const tCommon = useTranslations("common");

  const {
    playerId,
    isLoading: identityLoading,
    error: identityError,
  } = useIdentity();

  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [stage, setStage] = useState<JourneyStageRow | null>(null);
  const [stageChecked, setStageChecked] = useState(false);
  const [progress, setProgress] = useState<JourneyProgressRow | null>(null);
  const [completedStageNumbers, setCompletedStageNumbers] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [pendingResolved, setPendingResolved] = useState(false);
  const [recap, setRecap] = useState<CompleteJourneyPlaythroughResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [showLoadingTimeout, setShowLoadingTimeout] = useState(false);
  const completingRef = useRef(false);
  const resolvingRef = useRef(false);

  // Auth gate — mirrors src/app/home/page.tsx.
  useEffect(() => {
    bootstrapIdentity().then((state) => {
      setIdentity(state);
      if (state.status === "unauthenticated") {
        router.replace(`/login?next=${encodeURIComponent(`/journey/${stageId}`)}`);
      }
    });
    return subscribeToIdentityChanges((state) => {
      setIdentity(state);
      if (state.status === "unauthenticated") {
        router.replace(`/login?next=${encodeURIComponent(`/journey/${stageId}`)}`);
      }
    });
  }, [router, stageId]);

  useEffect(() => {
    if (identity.status === "ready") {
      setShowLoadingTimeout(false);
      return;
    }
    const timer = setTimeout(() => setShowLoadingTimeout(true), 10_000);
    return () => clearTimeout(timer);
  }, [identity.status]);

  const loadProgress = useCallback(async () => {
    if (!playerId) return;
    const { data } = await supabaseBrowser
      .from("journey_player_progress")
      .select(
        "id,player_id,stage_id,status,best_accuracy_pct,best_badge,attempts_count,first_completed_at,last_played_at,journey_stages(stage_number)"
      )
      .eq("player_id", playerId);
    const rows = (data ?? []) as (JourneyProgressRow & {
      journey_stages: { stage_number: number } | { stage_number: number }[] | null;
    })[];
    setProgress(rows.find((r) => r.stage_id === stageId) ?? null);
    const completed = new Set<number>();
    for (const r of rows) {
      const stageNumber = Array.isArray(r.journey_stages)
        ? r.journey_stages[0]?.stage_number
        : r.journey_stages?.stage_number;
      if (r.status === "completed" && stageNumber != null) {
        completed.add(stageNumber);
      }
    }
    setCompletedStageNumbers(completed);
  }, [playerId, stageId]);

  // Load the stage row + this player's progress rows.
  useEffect(() => {
    if (!playerId || !stageId) return;
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from("journey_stages")
          .select(
            "id,stage_number,title,theme,learning_objective,difficulty_rating,min_accuracy_pct,pool_size,status"
          )
          .eq("id", stageId)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        setStage((data ?? null) as JourneyStageRow | null);
        await loadProgress();
      } catch {
        if (!cancelled) setActionError(t("load_error"));
      } finally {
        if (!cancelled) setStageChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId, stageId, loadProgress, t]);

  // Reconstruct a recap result from the DB when /api/journey/complete answers
  // "already completed" — the playthrough row holds accuracy_pct/badge_awarded
  // (select-own policy), so the recap is still fully server-derived.
  const reconstructRecap = useCallback(
    async (playthroughId: string): Promise<CompleteJourneyPlaythroughResult | null> => {
      const { data } = await supabaseBrowser
        .from("journey_playthroughs")
        .select("accuracy_pct,badge_awarded")
        .eq("id", playthroughId)
        .maybeSingle();
      if (!data || data.accuracy_pct == null || !stage) return null;
      const badge = data.badge_awarded as CompleteJourneyPlaythroughResult["badgeAwarded"];
      return {
        playthroughId,
        stageId: stage.id,
        stageNumber: stage.stage_number,
        accuracyPct: Number(data.accuracy_pct),
        badgeAwarded: badge,
        gatePassed: badge !== null,
        minAccuracyPct: Number(stage.min_accuracy_pct),
      };
    },
    [stage]
  );

  const runCompletion = useCallback(
    async (attempt: PendingAttempt) => {
      if (completingRef.current) return;
      completingRef.current = true;
      try {
        const res = await fetch("/api/journey/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playthroughId: attempt.playthroughId }),
        });
        if (res.ok) {
          const result = (await res.json()) as CompleteJourneyPlaythroughResult;
          setRecap(result);
          setPending(null);
          clearActivePlaythrough(stageId);
          void loadProgress();
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const message = typeof data.error === "string" ? data.error : "";
        if (message.includes("already completed")) {
          const reconstructed = await reconstructRecap(attempt.playthroughId);
          if (reconstructed) {
            setRecap(reconstructed);
            setPending(null);
            clearActivePlaythrough(stageId);
            void loadProgress();
            return;
          }
        }
        setActionError(message || t("load_error"));
      } catch {
        setActionError(t("load_error"));
      } finally {
        completingRef.current = false;
      }
    },
    [stageId, loadProgress, reconstructRecap, t]
  );

  // Resolve the pending attempt: sessionStorage marker fast-path first, then
  // the DB fallback (latest journey_playthroughs row with completed_at NULL —
  // covers sessionStorage loss / a second device).
  useEffect(() => {
    if (!playerId || !stage || stage.status !== "live" || pendingResolved || recap) return;
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    let cancelled = false;

    (async () => {
      let candidate: PendingAttempt | null = readActivePlaythrough(stageId);
      if (!candidate) {
        const { data } = await supabaseBrowser
          .from("journey_playthroughs")
          .select("id,session_id")
          .eq("stage_id", stageId)
          .is("completed_at", null)
          .order("created_at", { ascending: false })
          .limit(1);
        const row = (data ?? [])[0] as { id: string; session_id: string | null } | undefined;
        if (row?.session_id) {
          candidate = { playthroughId: row.id, gameId: row.session_id };
          // Self-heal the marker so later visits take the fast path.
          writeActivePlaythrough({ stageId, ...candidate });
        }
      }
      if (!candidate) {
        if (!cancelled) setPendingResolved(true);
        return;
      }
      try {
        const res = await fetch(
          `/api/compete/${candidate.gameId}?playerId=${playerId}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("snapshot");
        const snap = (await res.json()) as { status?: string };
        if (cancelled) return;
        if (snap.status === "SESSION_COMPLETE") {
          await runCompletion(candidate);
        } else {
          setPending(candidate);
        }
      } catch {
        // Snapshot unreachable — still offer resume; /practice/[gameId]
        // resolves the session state itself.
        if (!cancelled) setPending(candidate);
      } finally {
        if (!cancelled) setPendingResolved(true);
      }
    })();

    return () => {
      cancelled = true;
      resolvingRef.current = false;
    };
  }, [playerId, stage, stageId, pendingResolved, recap, runCompletion]);

  const isUnlocked =
    stage !== null &&
    (stage.stage_number === 1 ||
      progress?.status === "unlocked" ||
      progress?.status === "completed" ||
      completedStageNumbers.has(stage.stage_number - 1));

  const handleStart = useCallback(async () => {
    if (!stage || starting) return;
    setStarting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/journey/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: stage.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t("load_error"));
      }
      const result = (await res.json()) as {
        gameId: string;
        playthroughId: string;
      };
      writeActivePlaythrough({
        stageId: stage.id,
        playthroughId: result.playthroughId,
        gameId: result.gameId,
      });
      router.push(`/practice/${result.gameId}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("load_error"));
      setStarting(false);
    }
  }, [stage, starting, router, t]);

  const isLoading =
    identityLoading || identity.status === "loading" || (playerId !== null && !stageChecked);

  if (isLoading || identityError) {
    return (
      <div className={pageStyles.loadingScreen}>
        <div className={pageStyles.loadingBg} aria-hidden="true" />
        <div className={pageStyles.loadingScrim} aria-hidden="true" />
        <div className={pageStyles.loadingContent}>
          <div className={pageStyles.loadingSpinner} />
          <span className={pageStyles.loadingLabel}>
            {identityError ? tGame("identity_error") : tCommon("loading")}
          </span>
          {identity.status !== "ready" && showLoadingTimeout && (
            <>
              <div className={pageStyles.loadingHint}>{tGame("taking_too_long")}</div>
              <button
                type="button"
                onClick={() => {
                  forceClearAuthStorage();
                  window.location.replace("/login");
                }}
                className={pageStyles.escapeButton}
              >
                {tGame("clear_session_restart")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Recap view — accuracyPct/badgeAwarded rendered verbatim from
  // completeJourneyPlaythrough()'s return (single source of truth).
  if (recap) {
    const lastStage = recap.stageNumber >= 10;
    return (
      <main className={`app-shell ${pageStyles.pageShell}`}>
        <div className={pageStyles.bgImage} />
        <div className={pageStyles.bgScrim} />
        <div className={pageStyles.pageContent}>
          <section className={pageStyles.recapCard}>
            <span className={pageStyles.recapStage}>
              {t("stage_label", { number: recap.stageNumber })}
            </span>
            <JourneyBadge
              badge={recap.badgeAwarded}
              accuracyPct={recap.accuracyPct}
              size="lg"
            />
            <h1 className={pageStyles.recapTitle}>
              {recap.gatePassed
                ? lastStage
                  ? t("recap_journey_complete_title")
                  : t("recap_pass_title")
                : t("recap_fail_title")}
            </h1>
            <p className={pageStyles.recapBody}>
              {recap.gatePassed
                ? lastStage
                  ? t("recap_journey_complete_body")
                  : t("recap_pass_body", { pct: recap.minAccuracyPct })
                : t("recap_fail_body", {
                    acc: recap.accuracyPct.toFixed(1),
                    min: recap.minAccuracyPct,
                  })}
            </p>
            <div className={pageStyles.recapActions}>
              <button
                type="button"
                className={pageStyles.primaryButton}
                onClick={() => router.push("/journey")}
              >
                {t("back_to_journey")}
              </button>
              <button
                type="button"
                className={pageStyles.secondaryButton}
                disabled={starting}
                onClick={handleStart}
              >
                {starting ? tCommon("loading") : t("replay_stage")}
              </button>
            </div>
            {actionError && (
              <p className={pageStyles.errorText} role="alert">
                {actionError}
              </p>
            )}
          </section>
        </div>
      </main>
    );
  }

  // Stage missing or not live (all current rows are 'draft' — expected state).
  if (!stage || stage.status !== "live") {
    return (
      <main className={`app-shell ${pageStyles.pageShell}`}>
        <div className={pageStyles.bgImage} />
        <div className={pageStyles.bgScrim} />
        <div className={pageStyles.pageContent}>
          <section className={pageStyles.detailCard}>
            <h1 className={pageStyles.detailTitle}>{t("stage_unavailable")}</h1>
            <div className={pageStyles.detailActions}>
              <button
                type="button"
                className={pageStyles.primaryButton}
                onClick={() => router.push("/journey")}
              >
                {t("back_to_journey")}
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const stageTitle = stage.title ?? t("stage_default_title", { number: stage.stage_number });

  return (
    <main className={`app-shell ${pageStyles.pageShell}`}>
      <div className={pageStyles.bgImage} />
      <div className={pageStyles.bgScrim} />
      <div className={pageStyles.pageContent}>
        <button
          type="button"
          className={pageStyles.backLink}
          onClick={() => router.push("/journey")}
        >
          ← {t("back_to_journey")}
        </button>

        <section className={pageStyles.detailCard}>
          <span className={pageStyles.recapStage}>
            {t("stage_label", { number: stage.stage_number })}
          </span>
          <h1 className={pageStyles.detailTitle}>{stageTitle}</h1>
          {stage.theme && <p className={pageStyles.detailTheme}>{stage.theme}</p>}
          {stage.learning_objective && (
            <p className={pageStyles.detailObjective}>
              <span className={pageStyles.objectiveLabel}>
                {t("learning_objective_label")}
              </span>
              {stage.learning_objective}
            </p>
          )}

          <dl className={pageStyles.factGrid}>
            <div className={pageStyles.fact}>
              <dt className={pageStyles.factLabel}>{t("gate_label")}</dt>
              <dd className={pageStyles.factValue}>
                {t("min_accuracy", { pct: Number(stage.min_accuracy_pct) })}
              </dd>
            </div>
            <div className={pageStyles.fact}>
              <dt className={pageStyles.factLabel}>{t("rounds_label")}</dt>
              <dd className={pageStyles.factValue}>
                {t("rounds", { count: stage.pool_size })}
              </dd>
            </div>
            {stage.difficulty_rating != null && (
              <div className={pageStyles.fact}>
                <dt className={pageStyles.factLabel}>{t("difficulty_label")}</dt>
                <dd className={pageStyles.factValue}>
                  {t("difficulty_value", { rating: stage.difficulty_rating })}
                </dd>
              </div>
            )}
            {progress && progress.attempts_count > 0 && (
              <div className={pageStyles.fact}>
                <dt className={pageStyles.factLabel}>{t("attempts_label")}</dt>
                <dd className={pageStyles.factValue}>
                  {t("attempts", { count: progress.attempts_count })}
                </dd>
              </div>
            )}
          </dl>

          {progress?.status === "completed" && (
            <div className={pageStyles.bestRow}>
              <JourneyBadge
                badge={progress.best_badge ?? "completion"}
                accuracyPct={
                  progress.best_accuracy_pct != null
                    ? Number(progress.best_accuracy_pct)
                    : null
                }
              />
            </div>
          )}

          {actionError && (
            <p className={pageStyles.errorText} role="alert">
              {actionError}
            </p>
          )}

          <div className={pageStyles.detailActions}>
            {pending ? (
              <>
                <button
                  type="button"
                  className={pageStyles.primaryButton}
                  onClick={() => router.push(`/practice/${pending.gameId}`)}
                >
                  {t("resume_attempt")}
                </button>
                <button
                  type="button"
                  className={pageStyles.secondaryButton}
                  disabled={starting}
                  onClick={handleStart}
                >
                  {starting ? tCommon("loading") : t("start_new_attempt")}
                </button>
              </>
            ) : isUnlocked ? (
              <button
                type="button"
                className={pageStyles.primaryButton}
                disabled={starting}
                onClick={handleStart}
              >
                {starting
                  ? tCommon("loading")
                  : progress?.status === "completed"
                    ? t("replay_stage")
                    : t("start_stage")}
              </button>
            ) : (
              <p className={pageStyles.lockedNote}>{t("stage_locked")}</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
