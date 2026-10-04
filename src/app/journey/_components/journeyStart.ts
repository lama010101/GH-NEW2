"use client";

// Direct stage start (HJ-BUILD-LISTREDESIGN-032): POST /api/journey/start →
// sessionStorage marker → caller navigates to /practice/{gameId}. Same flow
// SessionComplete.tsx's JourneyResultActions ships inline (startStageByNumber,
// ~:1236-1267) — intentionally duplicated rather than shared across the
// protected boundary; flagged as follow-up debt to consolidate into a single
// shared helper once SessionComplete is editable.
import { writeActivePlaythrough } from "./journeyStorage";

export type StartJourneyStageResult = {
  gameId: string;
  playthroughId: string;
};

export async function startJourneyStage(
  stageId: string
): Promise<StartJourneyStageResult> {
  const res = await fetch("/api/journey/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stageId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "journey start failed");
  }
  const started = (await res.json()) as StartJourneyStageResult;
  writeActivePlaythrough({
    stageId,
    playthroughId: started.playthroughId,
    gameId: started.gameId,
  });
  return started;
}
