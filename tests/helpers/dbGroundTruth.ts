import { Pool, type QueryResult, type PoolConfig } from 'pg';

// ─────────────────────────────────────────────────────────────────────
// DB ground-truth helpers for Relax 6-player QA
//
// Reads authoritative rows from Supabase PostgreSQL so Playwright tests can
// assert that scores, ranks, badges, MVP, and end-of-session stats are
// computed server-side and match the DB state.
// ─────────────────────────────────────────────────────────────────────

const connectionString =
  process.env.SUPABASE_DB_CONNECTION ||
  process.env.DATABASE_URL ||
  '';

const ssl: PoolConfig['ssl'] = connectionString.includes('sslmode=require')
  ? { rejectUnauthorized: false }
  : undefined;

const pool = new Pool({
  connectionString,
  ssl,
  max: 5,
} as PoolConfig);

export async function closeGroundTruthPool(): Promise<void> {
  await pool.end();
}

async function query<T extends { [column: string]: any } = any>(
  sql: string,
  params: any[],
): Promise<QueryResult<T>> {
  return pool.query<T>(sql, params);
}

export interface RoundCommitRow {
  game_id: string;
  player_id: string;
  round_index: number;
  submitted_at: string;
  year_guess: number | null;
  location_lat: number | null;
  location_lng: number | null;
  hints_used: number | null;
  score: number | null;
  acc_penalty: number;
  verification_token: string;
}

export interface RoundResultRow {
  game_id: string;
  round_index: number;
  player_id: string;
  score: number | null;
  rank: number | null;
  distance_km: number | null;
  year_diff: number | null;
  location_score: number | null;
  time_score: number | null;
  verification_token: string;
}

export interface SessionPlayerRow {
  game_id: string;
  player_id: string;
  joined_at: string;
  left_at: string | null;
  display_name: string;
  ready: boolean;
  is_host: boolean;
  avatar_url: string | null;
  kicked: boolean;
}

export interface SessionRow {
  game_id: string;
  mode: string;
  round_timer_sec: number;
  total_rounds: number;
  year_min: number;
  year_max: number;
  session_deadline: string | null;
  created_at: string;
  seed: number;
  room_code: string;
  results_auto_advance_sec: number;
  scoring_reference_year: number;
}

export interface RoundEventRow {
  id: number;
  game_id: string;
  round_index: number | null;
  event_type: string;
  payload: any;
  created_at: string;
  verification_token: string;
}

export interface PlayerRoundEventRow {
  id: number;
  game_id: string;
  player_id: string;
  round_index: number;
  event_type: string;
  payload: any;
  occurred_at: string;
  verification_token: string;
}

export interface PlayerGlobalStatsRow {
  player_id: string;
  rounds_played: number;
  games_played: number;
  avg_accuracy: number;
  total_xp: number;
  rounds_won: number;
  updated_at: string;
}

export async function getSession(gameId: string): Promise<SessionRow | undefined> {
  const res = await query<SessionRow>(
    'SELECT * FROM public.sessions WHERE game_id = $1 LIMIT 1',
    [gameId],
  );
  return res.rows[0];
}

export async function getSessionPlayers(gameId: string): Promise<SessionPlayerRow[]> {
  const res = await query<SessionPlayerRow>(
    'SELECT * FROM public.session_players WHERE game_id = $1 ORDER BY player_id',
    [gameId],
  );
  return res.rows;
}

export async function getRoundCommits(
  gameId: string,
  roundIndex?: number,
): Promise<RoundCommitRow[]> {
  const sql = roundIndex !== undefined
    ? 'SELECT * FROM public.round_commits WHERE game_id = $1 AND round_index = $2 ORDER BY player_id'
    : 'SELECT * FROM public.round_commits WHERE game_id = $1 ORDER BY round_index, player_id';
  const params = roundIndex !== undefined ? [gameId, roundIndex] : [gameId];
  const res = await query<RoundCommitRow>(sql, params);
  return res.rows;
}

export async function getRoundResults(
  gameId: string,
  roundIndex?: number,
): Promise<RoundResultRow[]> {
  const sql = roundIndex !== undefined
    ? 'SELECT * FROM public.round_results WHERE game_id = $1 AND round_index = $2 ORDER BY player_id'
    : 'SELECT * FROM public.round_results WHERE game_id = $1 ORDER BY round_index, player_id';
  const params = roundIndex !== undefined ? [gameId, roundIndex] : [gameId];
  const res = await query<RoundResultRow>(sql, params);
  return res.rows;
}

export async function getRoundEvents(
  gameId: string,
  roundIndex?: number,
  eventType?: string,
): Promise<RoundEventRow[]> {
  const conditions = ['game_id = $1'];
  const params: any[] = [gameId];
  if (roundIndex !== undefined) {
    conditions.push(`round_index = $${params.length + 1}`);
    params.push(roundIndex);
  }
  if (eventType) {
    conditions.push(`event_type = $${params.length + 1}`);
    params.push(eventType);
  }
  const sql = `SELECT * FROM public.round_events WHERE ${conditions.join(' AND ')} ORDER BY id`;
  const res = await query<RoundEventRow>(sql, params);
  return res.rows;
}

export async function getPlayerRoundEvents(
  gameId: string,
  playerId?: string,
  roundIndex?: number,
  eventType?: string,
): Promise<PlayerRoundEventRow[]> {
  const conditions = ['game_id = $1'];
  const params: any[] = [gameId];
  if (playerId) {
    conditions.push(`player_id = $${params.length + 1}`);
    params.push(playerId);
  }
  if (roundIndex !== undefined) {
    conditions.push(`round_index = $${params.length + 1}`);
    params.push(roundIndex);
  }
  if (eventType) {
    conditions.push(`event_type = $${params.length + 1}`);
    params.push(eventType);
  }
  const sql = `SELECT * FROM public.player_round_events WHERE ${conditions.join(' AND ')} ORDER BY id`;
  const res = await query<PlayerRoundEventRow>(sql, params);
  return res.rows;
}

export async function getPlayerGlobalStats(
  playerId: string,
): Promise<PlayerGlobalStatsRow | undefined> {
  const res = await query<PlayerGlobalStatsRow>(
    'SELECT * FROM public.player_global_stats WHERE player_id = $1 LIMIT 1',
    [playerId],
  );
  return res.rows[0];
}

export async function getAllPlayerGlobalStats(): Promise<PlayerGlobalStatsRow[]> {
  const res = await query<PlayerGlobalStatsRow>('SELECT * FROM public.player_global_stats', []);
  return res.rows;
}

// Closure check used by the server: all active (non-left, non-kicked) players
// have a round_results row for the given round.
function buildClosureCheckSql(gameIdRef: string, roundIndexRef: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM public.session_players sp
    WHERE sp.game_id = ${gameIdRef} AND sp.left_at IS NULL AND sp.kicked IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.round_results rrc
      WHERE rrc.game_id = ${gameIdRef} AND rrc.round_index = ${roundIndexRef} AND rrc.player_id = sp.player_id
    )
  )`;
}

export async function isRoundClosed(gameId: string, roundIndex: number): Promise<boolean> {
  const res = await query<{ is_closed: boolean }>(
    `SELECT ${buildClosureCheckSql('$1', '$2')} AS is_closed`,
    [gameId, roundIndex],
  );
  return res.rows[0]?.is_closed ?? false;
}

export interface FinalRoundResult extends RoundResultRow {
  rank_is_final: boolean;
}

export async function getFinalRoundResults(
  gameId: string,
  roundIndex: number,
): Promise<FinalRoundResult[]> {
  const closureSql = buildClosureCheckSql('$1', 'rr.round_index');
  const res = await query<FinalRoundResult>(
    `SELECT rr.*, (${closureSql}) AS rank_is_final
     FROM public.round_results rr
     WHERE rr.game_id = $1 AND rr.round_index = $2
     ORDER BY rr.player_id`,
    [gameId, roundIndex],
  );
  return res.rows;
}

export interface RoundsWonRow {
  player_id: string;
  rounds_won: number;
}

export async function getRoundsWon(gameId: string): Promise<RoundsWonRow[]> {
  // For each round, count a win only if the player is rank 1 and the round is
  // closed (all active players have a round_results row).
  const sql = `
    WITH closed_rounds AS (
      SELECT rr.round_index
      FROM public.round_results rr
      WHERE rr.game_id = $1
      GROUP BY rr.round_index
      HAVING ${buildClosureCheckSql('$1', 'rr.round_index')}
    )
    SELECT rr.player_id, COUNT(*)::int AS rounds_won
    FROM public.round_results rr
    JOIN closed_rounds cr ON cr.round_index = rr.round_index
    WHERE rr.game_id = $1 AND rr.rank = 1
    GROUP BY rr.player_id
    ORDER BY rr.player_id
  `;
  const res = await query<RoundsWonRow>(sql, [gameId]);
  return res.rows;
}

export async function getRoundsWonForPlayer(
  gameId: string,
  playerId: string,
): Promise<number> {
  const rows = await getRoundsWon(gameId);
  return rows.find((r) => r.player_id === playerId)?.rounds_won ?? 0;
}

export interface CumulativeScoreRow {
  player_id: string;
  total_score: number;
  avg_accuracy: number;
}

export interface RoundAnswer {
  roundIndex: number;
  eventId: string;
  year: number;
  latitude: number | null;
  longitude: number | null;
}

export async function getRoundEventAnswers(gameId: string): Promise<RoundAnswer[]> {
  const createdRes = await query<{ payload: { eventIds?: string[] } | null }>(
    `SELECT payload FROM public.round_events WHERE game_id = $1 AND event_type = 'SESSION_CREATED' ORDER BY id LIMIT 1`,
    [gameId],
  );
  const eventIds = createdRes.rows[0]?.payload?.eventIds ?? [];
  if (eventIds.length === 0) return [];

  const evRes = await query<{
    id: string;
    event_year: number;
    latitude: number | null;
    longitude: number | null;
  }>(
    `SELECT e.id, e.event_year, l.latitude, l.longitude
     FROM public.events e
     LEFT JOIN public.locations l ON l.event_id = e.id
     WHERE e.id = ANY($1::uuid[])`,
    [eventIds],
  );
  const byId = new Map(evRes.rows.map((r) => [r.id, r]));
  return eventIds.map((id, i) => {
    const r = byId.get(id);
    return {
      roundIndex: i,
      eventId: id,
      year: r?.event_year ?? 0,
      latitude: r?.latitude ?? null,
      longitude: r?.longitude ?? null,
    };
  });
}

export async function getCumulativeScores(gameId: string): Promise<CumulativeScoreRow[]> {
  const res = await query<CumulativeScoreRow>(
    `SELECT
       player_id,
       COALESCE(SUM(score), 0)::int AS total_score,
       COALESCE(AVG((COALESCE(location_score, 0) + COALESCE(time_score, 0)) / 2.0), 0)::numeric AS avg_accuracy
     FROM public.round_results
     WHERE game_id = $1
     GROUP BY player_id
     ORDER BY player_id`,
    [gameId],
  );
  return res.rows;
}
