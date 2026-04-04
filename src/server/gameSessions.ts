import { isPersistedGameState } from "@/core/gamePersistence";
import type { GameState } from "@/core/types";
import { dbPool } from "@/server/db";

type GameSessionRow = {
  state: unknown;
};

export async function loadPersistedGameState(gameId: string): Promise<GameState | null> {
  const result = await dbPool.query<GameSessionRow>(
    "SELECT state FROM game_sessions WHERE game_id = $1 LIMIT 1",
    [gameId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (!isPersistedGameState(row.state) || row.state.gameId !== gameId) {
    throw new Error(`Stored game state is invalid for ${gameId}`);
  }

  return row.state;
}

export async function savePersistedGameState(state: GameState): Promise<void> {
  await dbPool.query(
    `
      INSERT INTO game_sessions (game_id, state, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (game_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = now()
    `,
    [state.gameId, JSON.stringify(state)]
  );
}
