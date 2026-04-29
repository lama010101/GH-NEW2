import dotenv from "dotenv";
import { submitGuess } from "../src/server/sessionCore";
import { dbPool } from "../src/server/db";

dotenv.config({ path: '.env.local' });

async function main() {
  console.log("=== DIAGNOSTIC SCRIPT: submitGuess execution trace ===\n");

  try {
    console.log("[DB] Using dbPool from src/server/db.ts\n");

    // Step c: Query most recent session
    console.log("--- STEP C: Most recent session ---");
    const sessionResult = await dbPool.query(
      `SELECT game_id, mode, round_timer_sec, total_rounds, year_min, year_max, session_deadline, created_at FROM sessions ORDER BY created_at DESC LIMIT 1`
    );
    if (sessionResult.rows.length === 0) {
      console.log("No sessions found in database");
      return;
    }
    const session = sessionResult.rows[0];
    console.log("Session:", JSON.stringify(session, null, 2));
    const gameId = session.game_id;
    console.log(`game_id: ${gameId}\n`);

    // Step d: Query session_players
    console.log("--- STEP D: Session players ---");
    const playersResult = await dbPool.query(
      `SELECT player_id, display_name, left_at, ready, is_host FROM session_players WHERE game_id = $1 ORDER BY joined_at ASC`,
      [gameId]
    );
    console.log("Players:", JSON.stringify(playersResult.rows, null, 2));
    const activePlayers = playersResult.rows.filter((p: any) => p.left_at === null);
    console.log(`Active players (left_at IS NULL): ${activePlayers.length}`);
    if (activePlayers.length === 0) {
      console.log("No active players found - cannot submit guess");
      return;
    }
    const playerId = activePlayers[0].player_id;
    console.log(`Using player_id: ${playerId}\n`);

    // Step e: Query round_events
    console.log("--- STEP E: Round events ---");
    const eventsResult = await dbPool.query(
      `SELECT id, round_index, event_type, payload, created_at FROM round_events WHERE game_id = $1 ORDER BY id ASC`,
      [gameId]
    );
    console.log("Round events:", JSON.stringify(eventsResult.rows, null, 2));
    console.log(`Total events: ${eventsResult.rows.length}\n`);

    // Step f: Query round_commits
    console.log("--- STEP F: Round commits ---");
    const commitsResult = await dbPool.query(
      `SELECT game_id, player_id, round_index, submitted_at, year_guess, location_lat, location_lng, hints_used, score FROM round_commits WHERE game_id = $1 ORDER BY round_index ASC, submitted_at ASC`,
      [gameId]
    );
    console.log("Round commits:", JSON.stringify(commitsResult.rows, null, 2));
    console.log(`Total commits: ${commitsResult.rows.length}\n`);

    // Step g: Call submitGuess
    console.log("--- STEP G: Calling submitGuess() ---");
    console.log("Parameters:");
    console.log(`  gameId: ${gameId}`);
    console.log(`  playerId: ${playerId}`);
    console.log(`  roundIndex: 0`);
    console.log(`  yearGuess: 1900`);
    console.log(`  locationGuess: { lat: 48.8566, lng: 2.3522 }`);
    console.log(`  hintsUsed: []`);
    console.log(`  _executionContext: "api"\n`);

    const snapshot = await submitGuess({
      gameId,
      playerId,
      roundIndex: 0,
      yearGuess: 1900,
      locationGuess: { lat: 48.8566, lng: 2.3522 },
      hintsUsed: [],
      _executionContext: "api"
    });

    // Step h: Log returned snapshot
    console.log("--- STEP H: Returned snapshot ---");
    console.log(JSON.stringify(snapshot, null, 2));
    console.log(`\nSnapshot status: ${snapshot.status}\n`);

    // Step i: Re-query round_commits and round_events
    console.log("--- STEP I: Post-call DB state ---");

    const newCommitsResult = await dbPool.query(
      `SELECT game_id, player_id, round_index, submitted_at, year_guess, location_lat, location_lng, hints_used, score FROM round_commits WHERE game_id = $1 ORDER BY round_index ASC, submitted_at ASC`,
      [gameId]
    );
    console.log("Round commits after:", JSON.stringify(newCommitsResult.rows, null, 2));
    console.log(`Total commits after: ${newCommitsResult.rows.length}\n`);

    const newEventsResult = await dbPool.query(
      `SELECT id, round_index, event_type, payload, created_at FROM round_events WHERE game_id = $1 ORDER BY id ASC`,
      [gameId]
    );
    console.log("Round events after:", JSON.stringify(newEventsResult.rows, null, 2));
    console.log(`Total events after: ${newEventsResult.rows.length}\n`);

    console.log("=== DIAGNOSTIC COMPLETE ===");

  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error);
    if (error instanceof Error) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
