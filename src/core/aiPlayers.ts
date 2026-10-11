// AIP-BUILD-AITIMERWORKERS-1011-004
// Single source of truth for the AI-player per-event answer timer.
// Matches the live Daily timer (90s) confirmed in
// src/server/sessionCore.ts createDailySession.
export const AI_PLAYER_TIMER_SECONDS = 90;
export const AI_PLAYER_TIMER_MS = AI_PLAYER_TIMER_SECONDS * 1000;

// AIP-FIX-AITIMERKILL-1011-008: the daily-autoplay hard-kill budget must cover
// the full worker lifecycle — answer timer + critique turn + DB writes — so a
// worker is never SIGKILLed before its answer/timeout row exists. Single
// source for both the worker cap and the supervisor grace constants.
export const AI_WORKER_CRITIQUE_CAP_MS = 30_000;
export const AI_WORKER_DB_GRACE_MS = 30_000;
