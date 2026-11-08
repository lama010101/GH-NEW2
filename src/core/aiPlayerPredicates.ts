// Single source of truth for "which AI players count" in read surfaces.
// The ai_players table alias in these queries must be `ap`.
export const AI_PLAYER_LIVE_SQL = "ap.is_active = true AND ap.deleted_at IS NULL";
export const AI_PLAYER_DAILY_SQL = "ap.is_active_daily = true AND ap.is_active = true AND ap.deleted_at IS NULL";
