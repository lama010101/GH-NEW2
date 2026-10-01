"use client";

// Journey stage result screen — pass-threshold gauge + confetti
// (HJ-BUILD-STAGERESULT-THRESHOLDGAUGE-011). Rendered by /practice/[gameId]
// once journeyComplete.ts produced a CompleteJourneyPlaythroughResult; all
// values are server-derived and rendered verbatim.
//
// Start flow mirrors startPlaythrough in src/app/journey/[stageId]/page.tsx:
// POST /api/journey/start {stageId} → writeActivePlaythrough marker →
// router.push(`/practice/${gameId}`). Guest gate mirrors that page too:
// target stage >= 2 + anonymous identity → GuestConversionModal first.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import {
  bootstrapIdentity,
  subscribeToIdentityChanges,
  type IdentityState,
} from "@/core/identity";
import { JOURNEY_TOTAL_STAGES } from "@/core/journeyConstants";
import type { CompleteJourneyPlaythroughResult } from "@/server/journeyCore";
import ConfettiCanvas, { type ConfettiHandle } from "@/components/compete/ConfettiCanvas";
import { JourneyBadge } from "./JourneyBadge";
import { GuestConversionModal } from "./GuestConversionModal";
import { writeActivePlaythrough } from "./journeyStorage";
import styles from "./JourneyStageResult.module.css";

const GAUGE_DURATION_MS = 1500;
const GAUGE_R = 80;
const GAUGE_C = 2 * Math.PI * GAUGE_R;

export function JourneyStageResult({
  result,
}: {
  result: CompleteJourneyPlaythroughResult;
}) {
  const t = useTranslations("journey");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const { stageNumber, accuracyPct, badgeAwarded, gatePassed, minAccuracyPct } = result;
  const lastStage = stageNumber >= JOURNEY_TOTAL_STAGES;
  const nextStageNumber = Math.min(stageNumber + 1, JOURNEY_TOTAL_STAGES);
  const iconSrc = `/icons/ranks/rank-${String(Math.floor((stageNumber - 1) / 5) + 1).padStart(2, "0")}.png`;
  const passDeg = (Math.max(0, Math.min(100, minAccuracyPct)) / 100) * 360;
  const shortBy = Math.max(0, minAccuracyPct - accuracyPct);

  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [displayed, setDisplayed] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [showGuestGate, setShowGuestGate] = useState(false);
  const [gateStageNumber, setGateStageNumber] = useState<number | null>(null);
  const confettiRef = useRef<ConfettiHandle>(null);
  const confettiFiredRef = useRef(false);
  const gaugeWrapRef = useRef<HTMLDivElement>(null);

  // Identity for the guest gate — mirrors [stageId]/page.tsx.
  useEffect(() => {
    bootstrapIdentity().then(setIdentity);
    return subscribeToIdentityChanges(setIdentity);
  }, []);

  // Gauge fill/count-up: 0 → accuracyPct over ~1.5s cubic ease-out. The ring
  // flips to the success color the moment the animated value crosses the pass
  // mark — a pass also fires the confetti burst exactly once at that moment.
  // prefers-reduced-motion: jump straight to the final state (ConfettiCanvas
  // no-ops internally in that mode).
  useEffect(() => {
    const target = Math.max(0, Math.min(100, accuracyPct));
    const fireConfetti = () => {
      if (confettiFiredRef.current || !gatePassed) return;
      confettiFiredRef.current = true;
      const rect = gaugeWrapRef.current?.getBoundingClientRect();
      confettiRef.current?.burst(
        rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
        { count: 200 }
      );
    };
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplayed(target);
      if (target >= minAccuracyPct) fireConfetti();
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / GAUGE_DURATION_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = target * eased;
      setDisplayed(value);
      if (value >= minAccuracyPct) fireConfetti();
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplayed(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [accuracyPct, gatePassed, minAccuracyPct]);

  const crossed = displayed >= minAccuracyPct;

  const startStageByNumber = useCallback(
    async (target: number) => {
      setStarting(true);
      setStartError(null);
      try {
        let stageId = result.stageId;
        if (target !== stageNumber) {
          const { data } = await supabaseBrowser
            .from("journey_stages")
            .select("id")
            .eq("stage_number", target)
            .maybeSingle();
          const row = data as { id?: string } | null;
          if (!row?.id) throw new Error(t("load_error"));
          stageId = row.id;
        }
        const res = await fetch("/api/journey/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? t("load_error"));
        }
        const started = (await res.json()) as {
          gameId: string;
          playthroughId: string;
        };
        writeActivePlaythrough({
          stageId,
          playthroughId: started.playthroughId,
          gameId: started.gameId,
        });
        router.push(`/practice/${started.gameId}`);
      } catch (err) {
        setStartError(err instanceof Error ? err.message : t("load_error"));
        setStarting(false);
      }
    },
    [result.stageId, stageNumber, router, t]
  );

  // Guest gate (mirrors [stageId]/page.tsx): anonymous players may only play
  // stage 1; any higher target stage opens the conversion modal first.
  const requestStageStart = useCallback(
    async (target: number) => {
      if (starting) return;
      if (target >= 2 && identity.status === "ready" && identity.isAnonymous) {
        setGateStageNumber(target);
        setShowGuestGate(true);
        return;
      }
      await startStageByNumber(target);
    },
    [starting, identity, startStageByNumber]
  );

  const primaryLabel = gatePassed
    ? lastStage
      ? t("back_to_journey")
      : t("result_play_stage", { number: nextStageNumber })
    : t("result_retry_stage", { number: stageNumber });

  const handlePrimary = () => {
    if (gatePassed && lastStage) {
      router.push("/journey");
      return;
    }
    void requestStageStart(gatePassed ? nextStageNumber : stageNumber);
  };

  return (
    <section className={styles.resultCard}>
      <div className={styles.stageCol}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rank icons are static assets, not optimizable */}
        <img src={iconSrc} alt="" className={styles.stageIcon} draggable={false} />
        <span className={styles.stageLabel}>
          {t("stage_label", { number: stageNumber })}
        </span>
      </div>

      <div
        className={styles.gaugeWrap}
        ref={gaugeWrapRef}
        role="img"
        aria-label={t("result_gauge_aria", {
          score: Math.round(displayed),
          pct: minAccuracyPct,
        })}
      >
        <svg viewBox="0 0 200 200" className={styles.gaugeSvg} aria-hidden="true">
          <circle cx="100" cy="100" r={GAUGE_R} className={styles.gaugeTrack} />
          <circle
            cx="100"
            cy="100"
            r={GAUGE_R}
            className={crossed ? styles.gaugeFillPassed : styles.gaugeFill}
            strokeDasharray={GAUGE_C}
            strokeDashoffset={
              GAUGE_C * (1 - Math.max(0, Math.min(100, displayed)) / 100)
            }
            transform="rotate(-90 100 100)"
          />
          <line
            x1="100"
            y1={100 - GAUGE_R - 4}
            x2="100"
            y2={100 - GAUGE_R + 12}
            className={styles.gaugeTick}
            transform={`rotate(${passDeg} 100 100)`}
          />
        </svg>
        <div className={styles.gaugeCenter}>
          <span className={styles.gaugeValue}>{Math.round(displayed)}%</span>
          <span className={styles.gaugePassMark}>
            {t("result_pass_mark", { pct: minAccuracyPct })}
          </span>
        </div>
      </div>

      {badgeAwarded && (
        <div className={styles.badgeRow}>
          <JourneyBadge badge={badgeAwarded} accuracyPct={accuracyPct} size="lg" />
        </div>
      )}

      <div aria-live="polite">
        <h1 className={styles.resultTitle}>
          {gatePassed
            ? lastStage
              ? t("result_journey_complete_title")
              : t("result_passed_title", { number: stageNumber })
            : t("recap_fail_title")}
        </h1>
        <p className={styles.resultBody}>
          {gatePassed
            ? lastStage
              ? t("result_journey_complete_body")
              : t("result_unlocked_line", { number: nextStageNumber })
            : t("result_short_by", {
                points: shortBy.toFixed(1),
                min: minAccuracyPct,
              })}
        </p>
      </div>

      <div className={styles.resultActions}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={starting}
          onClick={handlePrimary}
        >
          {starting ? tCommon("loading") : primaryLabel}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => router.push("/journey")}
        >
          {t("result_stages_button")}
        </button>
      </div>

      {startError && (
        <p className={styles.errorText} role="alert">
          {startError}
        </p>
      )}

      <ConfettiCanvas ref={confettiRef} />
      <GuestConversionModal
        isOpen={showGuestGate}
        stageNumber={gateStageNumber ?? stageNumber}
        onClose={() => setShowGuestGate(false)}
        onConverted={() => {
          setShowGuestGate(false);
          void startStageByNumber(gateStageNumber ?? stageNumber);
        }}
      />
    </section>
  );
}
