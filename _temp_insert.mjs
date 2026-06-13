import pg from "pg";
import { config } from "dotenv";
import { randomUUID, randomBytes } from "crypto";
config({ path: ".env.local" });
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_CONNECTION });

function generateRoomCode(seed) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = Number(seed % BigInt(2 ** 31))
  let code = ''
  for (let i = 0; i < 6; i++) {
    s = (s * 1664525 + 1013904223) % (2 ** 32)
    code += chars[s % chars.length]
  }
  return code
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameId = randomUUID();
    const seed = BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");
    const roomCode = generateRoomCode(seed);
    
    console.log("Attempt 1", { gameId, roomCode });
    try {
      await client.query(
        `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, results_auto_advance_sec, seed, room_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [gameId, "sync", 60, 5, -400, 2026, 90, seed, roomCode]
      );
      console.log("Attempt 1 succeeded");
    } catch(err) {
      console.log("Attempt 1 error:", err.code, err.constraint, err.message);
      
      console.log("Attempt 2");
      try {
        await client.query(
          `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, results_auto_advance_sec, seed, room_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [gameId, "sync", 60, 5, -400, 2026, 90, seed, roomCode]
        );
      } catch (e2) {
         console.log("Attempt 2 error:", e2.code, e2.constraint, e2.message);
      }
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
    pool.end();
  }
}
run();
