import { dbPool } from '../src/server/db';

async function main() {
  try {
    const result = await dbPool.query(
      'SELECT game_id, player_id, round_index, year_guess, location_lat, location_lng, score FROM round_commits ORDER BY game_id, round_index LIMIT 10'
    );
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await dbPool.end();
  }
}

main().catch(console.error);
