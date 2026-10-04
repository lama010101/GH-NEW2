"use client";

// Historian's Journey — stage list, single screen for all 100 stages
// (HJ-BUILD-LISTREDESIGN-032). Data = the same two direct supabaseBrowser
// reads as before (journey_stages + journey_player_progress — both have
// authenticated SELECT policies, no N+1); every per-stage display value is
// derived via src/core/journeyRules.ts (timer, recency window, era, tier
// icon — single source).
//
// Flow (intermediate /journey/[stageId] screen removed — it is now a thin
// redirect): Play/Retry POST /api/journey/start → sessionStorage marker →
// /practice/{gameId} directly. /practice/[gameId] is the single owner of
// journey completion+result — this page never calls /api/journey/complete.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, CalendarDays, Check, Clock, Layers, Lock, Target } from "lucide-react";
import { useIdentity } from "@/hooks/useIdentity";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import {
  bootstrapIdentity,
  subscribeToIdentityChanges,
  forceClearAuthStorage,
  type IdentityState,
} from "@/core/identity";
import { getAccuracyColor } from "@/core/accuracyColor";
import {
  journeyMinEventYear,
  journeyRoundCount,
  journeyRoundTimerSec,
  journeyStageEraKey,
  journeyStageIconFile,
  journeyYearLabel,
} from "@/core/journeyRules";
import TopBar from "@/components/layout/TopBar";
import { NavModal } from "@/components/NavModal";
import { MiniRing } from "@/components/compete/RoundCompleteSection";
import { JourneyBadge } from "./_components/JourneyBadge";
import { GuestConversionModal } from "./_components/GuestConversionModal";
import { startJourneyStage } from "./_components/journeyStart";
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
  const [pendingStage, setPendingStage] = useState<{
    stageId: string;
    gameId: string;
  } | null>(null);
  const [startingStageId, setStartingStageId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [gateStageNumber, setGateStageNumber] = useState<number | null>(null);
  const [showNavModal, setShowNavModal] = useState(false);
  const [accuracy, setAccuracy] = useState("--");
  const [xp, setXp] = useState("--");
  const [showLoadingTimeout, setShowLoadingTimeout] = useState(false);
  const markerCheckedRef = useRef(false);
  const currentCardRef = useRef<HTMLLIElement | null>(null);

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

  // Pending-playthrough marker: a still-playable session flags its card with
  // a Resume CTA; a session already at SESSION_COMPLETE routes straight into
  // /practice/{gameId} — the practice page is the single owner of journey
  // completion and renders the journey result screen there. (The old hand-off
  // that routed to /journey/{stageId} is gone — that route is a redirect.)
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
          router.replace(`/practice/${pending.gameId}`);
        } else {
          setPendingStage({ stageId: pending.stageId, gameId: pending.gameId });
        }
      } catch {
        // Snapshot unreachable — leave the list as-is.
      }
    })();
  }, [playerId, router]);

  // TopBar stats — the same player_global_stats read home/page.tsx performs;
  // displayName/avatarUrl/initials come from identity (already fetched).
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser
        .from("player_global_stats")
        .select("avg_accuracy,total_xp")
        .eq("player_id", playerId)
        .maybeSingle();
      if (cancelled || !data) return;
      const stats = data as { avg_accuracy?: number | string; total_xp?: number };
      setAccuracy(String(Math.round(Number(stats.avg_accuracy))));
      setXp(Number(stats.total_xp).toLocaleString("fr-FR"));
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

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

  const allStages = useMemo(() => stages ?? [], [stages]);

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

  const completedCount = allStages.filter(
    (s) => progressByStageId.get(s.id)?.status === "completed"
  ).length;

  // The single unlocked-but-not-completed stage is "current" (linear chain —
  // at most one exists at a time).
  const currentStageNumber = useMemo(() => {
    for (const s of allStages) {
      if (derivedStatus(s) !== "completed") return s.stage_number;
    }
    return null; // all 100 completed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStages, progressByStageId, completedStageNumbers]);

  // Auto-scroll the current stage into view once the list renders.
  useEffect(() => {
    currentCardRef.current?.scrollIntoView({ block: "center" });
  }, [currentStageNumber, stages]);

  const isAnonymous =
    identity.status === "ready" && identity.isAnonymous;
  // Once the guest converted via the modal this session, skip the client-side
  // gate (the server-side gate in startJourneyPlaythrough stays authoritative
  // and would still reject an unconverted caller).
  const [hasConverted, setHasConverted] = useState(false);

  // Play/Retry: guest tapping stage >=2 → registration modal (the server-side
  // gate in startJourneyPlaythrough stays authoritative); otherwise POST
  // /api/journey/start → marker → /practice/{gameId} directly.
  const handleStart = async (stage: JourneyStageRow) => {
    if (startingStageId) return;
    setStartError(null);
    if (stage.stage_number >= 2 && isAnonymous && !hasConverted) {
      setGateStageNumber(stage.stage_number);
      return;
    }
    setStartingStageId(stage.id);
    try {
      const started = await startJourneyStage(stage.id);
      router.push(`/practice/${started.gameId}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t("load_error"));
      setStartingStageId(null);
    }
  };

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

  const identityDisplayName =
    identity.status === "ready" ? identity.displayName : "";
  const identityAvatarUrl =
    identity.status === "ready" ? identity.avatarUrl : null;
  const initials = identityDisplayName
    ? identityDisplayName.slice(0, 2).toUpperCase()
    : "";
  const currentYear = new Date().getFullYear();

  return (
    <main className={`app-shell ${pageStyles.pageShell}`}>
      <div className={pageStyles.bgImage} />
      <div className={pageStyles.bgScrim} />
      <TopBar
        accuracy={accuracy}
        xp={xp}
        avatarUrl={identityAvatarUrl}
        initials={initials}
        onAvatarClick={() => setShowNavModal(true)}
      />
      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={identityAvatarUrl}
        initials={initials}
        displayName={identityDisplayName || initials}
      />
      <div className={pageStyles.pageContent}>
        <button
          type="button"
          className={pageStyles.backBtn}
          onClick={() => router.push("/home")}
          aria-label={tCommon("back_to_home")}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span>{tCommon("back_to_home")}</span>
        </button>

        <header className={pageStyles.header}>
          <div>
            <h1 className={pageStyles.title}>{t("title")}</h1>
            <p className={pageStyles.subtitle}>{t("subtitle")}</p>
          </div>
          {allStages.length > 0 && (
            <div className={pageStyles.progressBlock}>
              <span className={pageStyles.progressPill}>
                {t("stages_completed", {
                  completed: completedCount,
                  total: allStages.length,
                })}
              </span>
              <progress
                className={pageStyles.progressBar}
                value={completedCount}
                max={allStages.length}
                aria-label={t("stages_completed", {
                  completed: completedCount,
                  total: allStages.length,
                })}
              />
            </div>
          )}
        </header>

        {loadError && (
          <div className={pageStyles.errorCard} role="alert">
            {loadError}
          </div>
        )}
        {startError && (
          <div className={pageStyles.errorCard} role="alert">
            {startError}
          </div>
        )}

        {!loadError && allStages.length === 0 && (
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

        {allStages.length > 0 && (
          <ol className={pageStyles.stageList}>
            {allStages.map((stage) => {
              const status = derivedStatus(stage);
              const progress = progressByStageId.get(stage.id);
              const locked = status === "locked";
              const completed = status === "completed";
              const isCurrent = stage.stage_number === currentStageNumber;
              const pendingHere =
                pendingStage?.stageId === stage.id && !completed;
              const timerSec = journeyRoundTimerSec(stage.stage_number);
              const timerLabel = `${Math.floor(timerSec / 60)}:${String(
                timerSec % 60
              ).padStart(2, "0")}`;
              const yearFrom = journeyYearLabel(
                journeyMinEventYear(stage.stage_number, currentYear),
                tGame("bc_suffix")
              );
              const yearTo = journeyYearLabel(currentYear, tGame("bc_suffix"));
              // HJ-UI-POLISH-035 — title is "Stage N · <era name>"; the
              // curated stage title/theme (when one exists) drops to the
              // subtitle line instead of duplicating the era.
              const stageEra = tGame(
                journeyStageEraKey(stage.stage_number, currentYear)
              );
              const stageSubtitle = stage.title ?? stage.theme ?? null;
              const bestPct =
                progress?.best_accuracy_pct != null
                  ? Number(progress.best_accuracy_pct)
                  : null;
              // Locked cards are inert for registered users; for anonymous
              // guests every stage >=2 tap opens the registration modal (the
              // server-side gate stays authoritative).
              const CardTag = locked && isAnonymous ? "button" : "div";
              return (
                <li
                  key={stage.id}
                  ref={isCurrent ? currentCardRef : undefined}
                >
                  <CardTag
                    type={locked && isAnonymous ? "button" : undefined}
                    onClick={
                      locked && isAnonymous
                        ? () => setGateStageNumber(stage.stage_number)
                        : undefined
                    }
                    className={`${pageStyles.stageCard} ${
                      locked ? pageStyles.stageLocked : ""
                    } ${completed ? pageStyles.stageDone : ""} ${
                      isCurrent ? pageStyles.stageCurrent : ""
                    }`}
                    data-testid={`journey-stage-${stage.stage_number}`}
                  >
                    <span className={pageStyles.stageIconWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={journeyStageIconFile(stage.stage_number)}
                        alt=""
                        className={pageStyles.stageIcon}
                        draggable={false}
                      />
                      {completed && (
                        <span
                          className={pageStyles.doneCheck}
                          role="img"
                          aria-label={t("list_completed")}
                        >
                          <Check size={12} strokeWidth={3.5} aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className={pageStyles.stageBody}>
                      <span className={pageStyles.stageTitle}>
                        {t("list_stage_title", {
                          number: stage.stage_number,
                          era: stageEra,
                        })}
                      </span>
                      {stageSubtitle && (
                        <span className={pageStyles.stageSubtitle}>
                          {stageSubtitle}
                        </span>
                      )}
                      {/* HJ-UI-POLISH-035 — stats as a compact icon-chip row
                          (pass mark rounded to a whole %), not a sentence. */}
                      <span className={pageStyles.chipRow}>
                        <span className={pageStyles.chip}>
                          <Target size={12} aria-hidden="true" className={pageStyles.chipIcon} />
                          {t("list_pass_chip", {
                            pct: Math.round(Number(stage.min_accuracy_pct)),
                          })}
                        </span>
                        <span className={pageStyles.chip}>
                          <Clock size={12} aria-hidden="true" className={pageStyles.chipIcon} />
                          {timerLabel}
                        </span>
                        <span className={pageStyles.chip}>
                          <CalendarDays size={12} aria-hidden="true" className={pageStyles.chipIcon} />
                          {t("list_years", { from: yearFrom, to: yearTo })}
                        </span>
                        <span className={pageStyles.chip}>
                          <Layers size={12} aria-hidden="true" className={pageStyles.chipIcon} />
                          {t("rounds", {
                            count: journeyRoundCount(stage.stage_number),
                          })}
                        </span>
                      </span>
                      {locked && (
                        <span className={pageStyles.lockHint}>
                          <Lock size={11} aria-hidden="true" className={pageStyles.lockHintIcon} />
                          {t("unlock_hint", { number: stage.stage_number - 1 })}
                        </span>
                      )}
                    </span>
                    <span className={pageStyles.stageAside}>
                      {locked && (
                        <Lock
                          size={18}
                          aria-hidden="true"
                          className={pageStyles.lockIcon}
                        />
                      )}
                      {completed && (
                        <>
                          <span
                            className={pageStyles.bestRing}
                            role="img"
                            aria-label={t("list_best_aria", {
                              pct: Math.round(bestPct ?? 0),
                            })}
                          >
                            <MiniRing
                              value={bestPct ?? 0}
                              color={getAccuracyColor(bestPct ?? 0)}
                            />
                          </span>
                          <JourneyBadge
                            badge={progress?.best_badge ?? "completion"}
                          />
                          <button
                            type="button"
                            className={pageStyles.retryBtn}
                            disabled={startingStageId !== null}
                            onClick={() => void handleStart(stage)}
                          >
                            {startingStageId === stage.id
                              ? tCommon("loading")
                              : t("list_retry")}
                          </button>
                        </>
                      )}
                      {isCurrent && (
                        <>
                          {pendingHere ? (
                            <button
                              type="button"
                              className={pageStyles.playBtn}
                              onClick={() =>
                                router.push(`/practice/${pendingStage!.gameId}`)
                              }
                            >
                              {t("list_resume")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={pageStyles.playBtn}
                              disabled={startingStageId !== null}
                              onClick={() => void handleStart(stage)}
                            >
                              {startingStageId === stage.id
                                ? tCommon("loading")
                                : t("list_play")}
                            </button>
                          )}
                        </>
                      )}
                    </span>
                  </CardTag>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <GuestConversionModal
        isOpen={gateStageNumber !== null}
        stageNumber={gateStageNumber ?? 2}
        onClose={() => setGateStageNumber(null)}
        onConverted={() => {
          const n = gateStageNumber;
          setGateStageNumber(null);
          setHasConverted(true);
          const s = allStages.find((x) => x.stage_number === n);
          if (s) void handleStart(s);
        }}
      />
    </main>
  );
}
