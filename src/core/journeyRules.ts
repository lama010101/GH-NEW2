// Historian's Journey — pure stage-rule functions (HJ-BUILD-LISTREDESIGN-032).
// SINGLE SOURCE for journey stage math. Extracted from src/server/journeyCore.ts
// (behavior-preserving): journeyCore imports these; the /journey stage list uses
// them for per-stage display (timer, year range, tier icon). Isomorphic — no
// browser/server APIs, safe to import from either side.
//
// Locked rules (HJ-BUILD-STAGE100-NOAPPROVAL-001 / CTO spec):
//   Timer:   timerSec(N) = 300 - 270 * min(N-1, 49) / 49 → 300s at stage 1,
//            linear to 30s at stage 50, flat 30s at 51-100.
//   Recency: stage N eligible iff event_year >= currentYear - N*40
//            (INCLUSIVE lower bound — event_year = currentYear - N*40 is
//            eligible; matches journeyCore's minYear semantics before this
//            extraction and the spec's "last N*40 years" wording).
//   Icons:   100 stages = 20 rank tiers x 5 stages → /icons/ranks/rank-NN.png
//            with NN = floor((stage-1)/5)+1 zero-padded (same mapping as
//            src/components/home/StageCard.tsx).

export const JOURNEY_RECENCY_YEARS_PER_STAGE = 40;
export const JOURNEY_TIMER_MAX_SEC = 300;
export const JOURNEY_TIMER_RAMP_SPAN_SEC = 270;
export const JOURNEY_TIMER_RAMP_STAGES = 49;
export const JOURNEY_STAGES_PER_TIER = 5;

export function journeyRoundTimerSec(stageNumber: number): number {
  return Math.round(
    JOURNEY_TIMER_MAX_SEC -
      (JOURNEY_TIMER_RAMP_SPAN_SEC *
        Math.min(stageNumber - 1, JOURNEY_TIMER_RAMP_STAGES)) /
        JOURNEY_TIMER_RAMP_STAGES
  );
}

export function journeyMaxEventAgeYears(stageNumber: number): number {
  return stageNumber * JOURNEY_RECENCY_YEARS_PER_STAGE;
}

// Inclusive lower bound of the stage's eligible event-year window
// (see header). journeyCore maps this onto fetchRandomEventsForSession's
// minYear; the list page displays it as the range start.
export function journeyMinEventYear(
  stageNumber: number,
  currentYear: number
): number {
  return currentYear - journeyMaxEventAgeYears(stageNumber);
}

export function journeyStageTierIndex(stageNumber: number): number {
  return Math.floor((stageNumber - 1) / JOURNEY_STAGES_PER_TIER);
}

export function journeyStageIconFile(stageNumber: number): string {
  return `/icons/ranks/rank-${String(journeyStageTierIndex(stageNumber) + 1).padStart(2, "0")}.png`;
}

// BC-aware year label — semantics mirrored verbatim from the repo's existing
// formatter yearLabel() in src/components/YearPicker.tsx:72-75, which is
// private to that file (not exported) and outside this task's file allowlist,
// so it cannot be imported directly. Same rule: y > 0 → the bare year;
// y <= 0 → |y| (0 counts as 1) + the localized BC suffix (game.bc_suffix).
export function journeyYearLabel(year: number, bcSuffix: string): string {
  if (year > 0) return String(year);
  return `${Math.abs(year) === 0 ? 1 : Math.abs(year)} ${bcSuffix}`;
}

// Era key for a stage's recency window — used as the card's subtitle name when
// no stage theme exists. Thresholds mirror nForYear() inside
// src/components/compete/SessionComplete.tsx (protected file — mirrored, not
// imported). Returns a `game.era_*` i18n key.
export function journeyStageEraKey(
  stageNumber: number,
  currentYear: number
): "era_ancient" | "era_medieval" | "era_earlymodern" | "era_modern" | "era_contemporary" {
  const minYear = journeyMinEventYear(stageNumber, currentYear);
  if (minYear < 476) return "era_ancient";
  if (minYear < 1492) return "era_medieval";
  if (minYear < 1789) return "era_earlymodern";
  if (minYear < 1945) return "era_modern";
  return "era_contemporary";
}
