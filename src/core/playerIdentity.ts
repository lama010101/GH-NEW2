import type { Pool } from "pg";

export type PlayerIdentity = {
  player_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_ai: boolean;
};

/**
 * Resolve display identity for a batch of player IDs.
 * Humans come from `profiles`, AI players come from `ai_players`.
 * The returned rows always include an explicit `is_ai` discriminator.
 */
export async function resolvePlayerIdentities(
  pool: Pick<Pool, "query">,
  playerIds: string[]
): Promise<Map<string, PlayerIdentity>> {
  const result = new Map<string, PlayerIdentity>();
  if (playerIds.length === 0) return result;

  const { rows } = await pool.query<PlayerIdentity>(
    `SELECT
       id AS player_id,
       display_name,
       avatar_url,
       false AS is_ai
     FROM profiles
     WHERE id = ANY($1::uuid[])
     UNION ALL
     SELECT
       id AS player_id,
       name AS display_name,
       avatar_url,
       true AS is_ai
     FROM ai_players
     WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [playerIds]
  );

  // In the extremely unlikely event an id exists in both tables, the human
  // profiles row (is_ai = false) takes precedence.
  for (const row of rows) {
    const existing = result.get(row.player_id);
    if (!existing || row.is_ai === false) {
      result.set(row.player_id, row);
    }
  }

  return result;
}

/**
 * SQL fragment for the player identity UNION. Useful when the identity CTE
 * must be embedded directly inside a larger query (e.g. leaderboard ranking).
 */
export function playerIdentityCTE(): string {
  return `(
    SELECT
      id AS player_id,
      display_name,
      avatar_url,
      false AS is_ai
    FROM profiles
    UNION ALL
    SELECT
      id AS player_id,
      name AS display_name,
      avatar_url,
      true AS is_ai
    FROM ai_players
    WHERE is_active = true
  )`;
}
