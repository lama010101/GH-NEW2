"use client";

// Shared journey completion for /practice/[gameId]
// (HJ-BUILD-STAGERESULT-THRESHOLDGAUGE-011).
//
// DB is the source of truth: a practice session is a Journey attempt iff a
// journey_playthroughs row carries its session_id. An "already completed" 400
// reconstructs the result from the playthrough + stage rows (select-own RLS),
// mirroring reconstructRecap in src/app/journey/[stageId]/page.tsx.

import { supabaseBrowser } from "@/core/supabaseBrowser";
import type { CompleteJourneyPlaythroughResult } from "@/server/journeyCore";

export type JourneyAttemptRef = {
  playthroughId: string;
  stageId: string;
};

export async function findJourneyAttemptForSession(
  sessionId: string
): Promise<JourneyAttemptRef | null> {
  const { data } = await supabaseBrowser
    .from("journey_playthroughs")
    .select("id,stage_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  const row = data as { id?: string; stage_id?: string } | null;
  if (!row?.id || !row.stage_id) return null;
  return { playthroughId: row.id, stageId: row.stage_id };
}

export async function completeJourneyAttempt(
  attempt: JourneyAttemptRef
): Promise<CompleteJourneyPlaythroughResult> {
  const res = await fetch("/api/journey/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playthroughId: attempt.playthroughId }),
  });
  if (res.ok) {
    return (await res.json()) as CompleteJourneyPlaythroughResult;
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  const message = typeof data.error === "string" ? data.error : "";
  if (message.includes("already completed")) {
    const reconstructed = await reconstructJourneyResult(attempt);
    if (reconstructed) return reconstructed;
  }
  throw new Error(message || "journey completion failed");
}

// The playthrough row holds accuracy_pct/badge_awarded after completion and
// journey_stages holds stage_number/min_accuracy_pct — both browser-readable.
async function reconstructJourneyResult(
  attempt: JourneyAttemptRef
): Promise<CompleteJourneyPlaythroughResult | null> {
  const [ptRes, stageRes] = await Promise.all([
    supabaseBrowser
      .from("journey_playthroughs")
      .select("accuracy_pct,badge_awarded")
      .eq("id", attempt.playthroughId)
      .maybeSingle(),
    supabaseBrowser
      .from("journey_stages")
      .select("stage_number,min_accuracy_pct")
      .eq("id", attempt.stageId)
      .maybeSingle(),
  ]);
  const pt = ptRes.data as { accuracy_pct?: number | string | null; badge_awarded?: string | null } | null;
  const stage = stageRes.data as { stage_number?: number | string; min_accuracy_pct?: number | string } | null;
  if (!pt || pt.accuracy_pct == null || !stage) return null;
  const badge = pt.badge_awarded as CompleteJourneyPlaythroughResult["badgeAwarded"];
  return {
    playthroughId: attempt.playthroughId,
    stageId: attempt.stageId,
    stageNumber: Number(stage.stage_number),
    accuracyPct: Number(pt.accuracy_pct),
    badgeAwarded: badge,
    gatePassed: badge !== null,
    minAccuracyPct: Number(stage.min_accuracy_pct),
  };
}
