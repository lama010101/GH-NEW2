// AIP-BUILD-AITIMERWORKERS-1011-004
// Single source of truth for the AI-player per-event answer timer.
// Matches the live Daily timer (90s) confirmed in
// src/server/sessionCore.ts createDailySession.
export const AI_PLAYER_TIMER_SECONDS = 90;
export const AI_PLAYER_TIMER_MS = AI_PLAYER_TIMER_SECONDS * 1000;
