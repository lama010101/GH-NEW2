"use client";

// Historian's Journey — stage list (HJ-BUILD-JOURNEYUI-001).
// Lists live journey_stages joined with this player's journey_player_progress
// (client-side supabaseBrowser read — the same direct-read pattern
// src/app/practice/[gameId]/page.tsx uses for player_global_stats/profiles;
// journey_stages + journey_player_progress both have authenticated SELECT
// policies). Zero live stages (current prod state: all 'draft') renders the
// "coming soon" empty state — an expected state, not an error.
//
// Completion hand-off: this page never calls /api/journey/complete itself —
// the stage detail page is the single owner of completion+recap. If a pending
// playthrough marker exists and its session is SESSION_COMPLETE, we route to
// that stage's detail page which performs the complete call and recap.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useIdentity } from "@/hooks/useIdentity";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import {
  bootstrapIdentity,
  subscribeToIdentityChanges,
  forceClearAuthStorage,
  type IdentityState,
} from "@/core/identity";
import { JourneyBadge } from "./_components/JourneyBadge";
import {
  findAnyActivePlaythrough,
  type JourneyProgressRow,
  type JourneyStageRow,
} from "./_components/journeyStorage";
import pageStyles from "./page.module.css";

type DerivedStatus = "locked" | "unlocked" | "completed";

export default function JourneyPage() {
  const router = useRouter();
  const t = useTranslations("journey");
  const tGame = useTranslations("game");
  const tCommon = useTranslations("common");

  const {
    playerId,
    isLoading: identityLoading,
    error: identityError,
  } = useIdentity();

  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [stages, setStages] = useState<JourneyStageRow[] | null>(null);
  const [progressRows, setProgressRows] = useState<JourneyProgressRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inProgressStageId, setInProgressStageId] = useState<string | null>(null);
  const [showLoadingTimeout, setShowLoadingTimeout] = useState(false);
  const markerCheckedRef = useRef(false);

  // Auth gate — mirrors src/app/home/page.tsx: unauthenticated → /login.
  useEffect(() => {
    bootstrapIdentity().then((state) => {
      setIdentity(state);
      if (state.status === "unauthenticated") {
        router.replace("/login?next=/journey");
      }
    });
    return subscribeToIdentityChanges((state) => {
      setIdentity(state);
      if (state.status === "unauthenticated") {
        router.replace("/login?next=/journey");
      }
    });
  }, [router]);

  // Escape hatch after 10s of continuous loading (practice page convention).
  useEffect(() => {
    if (identity.status === "ready") {
      setShowLoadingTimeout(false);
      return;
    }
    const timer = setTimeout(() => setShowLoadingTimeout(true), 10_000);
    return () => clearTimeout(timer);
  }, [identity.status]);

  // Load stages + this player's progress once identity is ready.
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;

    (async () => {
      try {
        const [stageRes, progressRes] = await Promise.all([
          supabaseBrowser
            .from("journey_stages")
            .select(
              "id,stage_number,title,theme,learning_objective,difficulty_rating,min_accuracy_pct,pool_size,status"
            )
            .order("stage_number", { ascending: true }),
          supabaseBrowser
            .from("journey_player_progress")
            .select(
              "id,player_id,stage_id,status,best_accuracy_pct,best_badge,attempts_count,first_completed_at,last_played_at"
            )
            .eq("player_id", playerId),
        ]);
        if (cancelled) return;
        if (stageRes.error) throw stageRes.error;
        if (progressRes.error) throw progressRes.error;
        setStages((stageRes.data ?? []) as JourneyStageRow[]);
        setProgressRows((progressRes.data ?? []) as JourneyProgressRow[]);
      } catch {
        if (!cancelled) setLoadError(t("load_error"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId, t]);

  // Pending-playthrough hand-off: if a session marker exists and its session
  // already reached SESSION_COMPLETE, the stage detail page owns completing
  // it — route there. If it's still playable, flag the slot as in-progress.
  useEffect(() => {
    if (!playerId || markerCheckedRef.current) return;
    const pending = findAnyActivePlaythrough();
    if (!pending) return;
    markerCheckedRef.current = true;

    (async () => {
      try {
        const res = await fetch(
          `/api/compete/${pending.gameId}?playerId=${playerId}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const snap = (await res.json()) as { status?: string };
        if (snap.status === "SESSION_COMPLETE") {
          router.replace(`/journey/${pending.stageId}`);
        } else {
          setInProgressStageId(pending.stageId);
        }
      } catch {
        // Snapshot unreachable — leave the list as-is.
      }
    })();
  }, [playerId, router]);

  const progressByStageId = useMemo(() => {
    const map = new Map<string, JourneyProgressRow>();
    for (const row of progressRows) map.set(row.stage_id, row);
    return map;
  }, [progressRows]);

  const stageNumberById = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stages ?? []) map.set(s.id, s.stage_number);
    return map;
  }, [stages]);

  const completedStageNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const row of progressRows) {
      if (row.status === "completed") {
        const n = stageNumberById.get(row.stage_id);
        if (typeof n === "number") set.add(n);
      }
    }
    return set;
  }, [progressRows, stageNumberById]);

  const liveStages = useMemo(
    () => (stages ?? []).filter((s) => s.status === "live"),
    [stages]
  );

  // Linear unlock derivation matching startJourneyPlaythrough's server rule:
  // stage 1 always unlocked; stage N>1 requires stage N-1 completed. A progress
  // row at 'unlocked'/'completed' also implies unlocked (it was created by a
  // start, which itself required the unlock).
  function derivedStatus(stage: JourneyStageRow): DerivedStatus {
    const progress = progressByStageId.get(stage.id);
    if (progress?.status === "completed") return "completed";
    if (stage.stage_number === 1) return "unlocked";
    if (progress?.status === "unlocked") return "unlocked";
    if (completedStageNumbers.has(stage.stage_number - 1)) return "unlocked";
    return "locked";
  }

  const completedCount = liveStages.filter(
    (s) => progressByStageId.get(s.id)?.status === "completed"
  ).length;

  const isLoading =
    identityLoading || identity.status === "loading" || (playerId !== null && stages === null && !loadError);

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

  return (
    <main className={`app-shell ${pageStyles.pageShell}`}>
      <div className={pageStyles.bgImage} />
      <div className={pageStyles.bgScrim} />
      <div className={pageStyles.pageContent}>
        <header className={pageStyles.header}>
          <div>
            <h1 className={pageStyles.title}>{t("title")}</h1>
            <p className={pageStyles.subtitle}>{t("subtitle")}</p>
          </div>
          {liveStages.length > 0 && (
            <span className={pageStyles.progressPill}>
              {t("stages_completed", {
                completed: completedCount,
                total: liveStages.length,
              })}
            </span>
          )}
        </header>

        {loadError && (
          <div className={pageStyles.errorCard} role="alert">
            {loadError}
          </div>
        )}

        {!loadError && liveStages.length === 0 && (
          <section className={pageStyles.emptyCard}>
            <div className={pageStyles.emptyLock} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <h2 className={pageStyles.emptyTitle}>{t("coming_soon_title")}</h2>
            <p className={pageStyles.emptyBody}>{t("coming_soon_body")}</p>
            <button
              type="button"
              className={pageStyles.secondaryButton}
              onClick={() => router.push("/home")}
            >
              {tCommon("back_to_home")}
            </button>
          </section>
        )}

        {liveStages.length > 0 && (
          <ol className={pageStyles.stageList}>
            {liveStages.map((stage) => {
              const status = derivedStatus(stage);
              const progress = progressByStageId.get(stage.id);
              const locked = status === "locked";
              const clickable = !locked;
              const inProgress = inProgressStageId === stage.id;
              return (
                <li key={stage.id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => clickable && router.push(`/journey/${stage.id}`)}
                    className={`${pageStyles.stageCard} ${
                      locked ? pageStyles.stageLocked : ""
                    } ${status === "completed" ? pageStyles.stageDone : ""}`}
                  >
                    <span className={pageStyles.stageNumber}>
                      {stage.stage_number}
                    </span>
                    <span className={pageStyles.stageBody}>
                      <span className={pageStyles.stageTitle}>
                        {stage.title ?? t("stage_default_title", { number: stage.stage_number })}
                      </span>
                      {stage.theme && (
                        <span className={pageStyles.stageTheme}>{stage.theme}</span>
                      )}
                      <span className={pageStyles.stageMeta}>
                        {t("min_accuracy", {
                          pct: Number(stage.min_accuracy_pct),
                        })}
                        {" · "}
                        {t("rounds", { count: stage.pool_size })}
                      </span>
                    </span>
                    <span className={pageStyles.stageAside}>
                      {status === "completed" && (
                        <JourneyBadge
                          badge={progress?.best_badge ?? "completion"}
                          accuracyPct={
                            progress?.best_accuracy_pct != null
                              ? Number(progress.best_accuracy_pct)
                              : null
                          }
                        />
                      )}
                      {inProgress && status !== "completed" && (
                        <span className={pageStyles.inProgressPill}>
                          {t("in_progress")}
                        </span>
                      )}
                      {locked && (
                        <span className={pageStyles.lockedPill}>
                          {t("locked")}
                        </span>
                      )}
                    </span>
                  </button>
                  {locked && (
                    <div className={pageStyles.lockHint}>
                      {t("unlock_hint", { number: stage.stage_number - 1 })}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
