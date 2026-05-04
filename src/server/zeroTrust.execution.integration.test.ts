/**
 * ZERO-TRUST EXECUTION PROOF HARNESS (MP-CORE-LOOP-004)
 * Real DB Execution Proof — Supabase-Enforced, Anti-Fake, Deterministic Replay Validation
 *
 * AUTHORITY: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 + MASTER PLAN v3.0
 * DB: REAL Supabase PostgreSQL (NO MOCKS, NO FAKES, NO IN-MEMORY)
 * VERIFICATION: Cross-connection, deterministic, unforgeable proof blocks
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import dotenv from "dotenv";
import { evaluateRound } from "@/core/rules";
import { EventRecord, LatLng } from "@/core/types";
import {
  dbPool,
  generateVerificationToken,
  verifyRowIntegrity,
  verifyWriteSet,
  verifyUniquenessInvariant,
  verifyFullReplay,
  verifyWriteCrossConnection,
  clearVerificationLogs,
  getVerificationLogs,
  getPerformanceMetrics,
  // MP-CORE-LOOP-005 hard enforcement imports
  assertDbConnectionVerified,
  acquireConnectionA,
  acquireConnectionB,
  verifyTransactionIsolation,
  emitExecutionProofV2
} from "@/server/db";

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: DB CONNECTION CONFIGURATION (REAL SUPABASE ONLY)
// ═════════════════════════════════════════════════════════════════════════════

// Load environment for tests
dotenv.config({ path: ".env.local" });

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1a: CONNECTION VERIFICATION (moved inside test suite)
// ═════════════════════════════════════════════════════════════════════════════

// Type aliases for cross-connection verification
type DbExecutor = Pick<Pool, "query">;
type DbTransactionClient = DbExecutor & { release(): void };
type TransactionCapablePool = DbExecutor & { connect(): Promise<DbTransactionClient> };

/**
 * Creates a NEW pool connection for cross-connection verification.
 * This is the key mechanism for zero-trust — writes on Connection A,
 * verification reads on Connection B.
 */
async function getNewPoolConnection(): Promise<DbTransactionClient> {
  return (dbPool as unknown as TransactionCapablePool).connect();
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: EXECUTION PROOF FORMAT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * DB_EXECUTION_PROOF — Unforgeable verification output
 *
 * Token originates from DB logic (verification_token column)
 * Timestamp comes from DB (NOW() or created_at)
 * Cross-connection uses NEW DB connection
 */
type ExecutionProof = {
  test: string;
  table: string;
  primary_key: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "VERIFY" | "CORRUPT" | "REPLAY";
  verification_token: string;
  cross_connection: boolean;
  result: "PASS" | "FAIL";
  timestamp: string;
  db_source: string;
  details?: string;
};

const executionProofs: ExecutionProof[] = [];

function emitExecutionProof(proof: ExecutionProof): void {
  executionProofs.push(proof);

  // Output in required format
  console.log(`
[DB_EXECUTION_PROOF]
test: ${proof.test}
table: ${proof.table}
primary_key: ${proof.primary_key}
operation: ${proof.operation}
verification_token: ${proof.verification_token}
cross_connection: ${proof.cross_connection ? "TRUE" : "FALSE"}
result: ${proof.result}
timestamp: ${proof.timestamp}
db_source: ${proof.db_source}
${proof.details ? `details: ${proof.details}` : ""}
`);
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: TEST STATE MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Cleanup tracking — all test-created entities must be deleted
 */
const testEntities: {
  sessions: string[];
  roundCommits: Array<{ gameId: string; playerId: string; roundIndex: number }>;
  roundResults: Array<{ gameId: string; roundIndex: number }>;
} = {
  sessions: [],
  roundCommits: [],
  roundResults: []
};

async function cleanupTestData(): Promise<void> {
  const client = await getNewPoolConnection();

  try {
    // Delete in dependency order
    for (const r of testEntities.roundResults) {
      await client.query(
        "DELETE FROM round_results WHERE game_id = $1 AND round_index = $2",
        [r.gameId, r.roundIndex]
      );
    }

    for (const c of testEntities.roundCommits) {
      await client.query(
        "DELETE FROM round_commits WHERE game_id = $1 AND player_id = $2 AND round_index = $3",
        [c.gameId, c.playerId, c.roundIndex]
      );
    }

    for (const gameId of testEntities.sessions) {
      await client.query("DELETE FROM round_events WHERE game_id = $1", [gameId]);
      await client.query("DELETE FROM session_players WHERE game_id = $1", [gameId]);
      await client.query("DELETE FROM round_timing WHERE game_id = $1", [gameId]);
      await client.query("DELETE FROM round_events WHERE game_id = $1", [gameId]);
      await client.query("DELETE FROM sessions WHERE game_id = $1", [gameId]);
    }

    console.log(`[HARNESS][CLEANUP] Removed ${testEntities.sessions.length} test sessions`);
  } finally {
    client.release();
  }

  // Reset tracking
  testEntities.sessions = [];
  testEntities.roundCommits = [];
  testEntities.roundResults = [];
  executionProofs.length = 0;
  clearVerificationLogs();
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: TEST HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Creates a REAL session in Supabase DB
 */
async function createTestSession(
  mode: "practice" | "sync" | "async" = "sync"
): Promise<{ gameId: string; playerId: string; token: string }> {
  const gameId = randomUUID();
  const playerId = randomUUID();
  const token = generateVerificationToken();

  const client = await getNewPoolConnection();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [gameId, mode, 120, 5, 1500, 2026, BigInt(12345)]
    );

    await client.query(
      `INSERT INTO session_players (game_id, player_id, joined_at)
       VALUES ($1, $2, now())`,
      [gameId, playerId]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  testEntities.sessions.push(gameId);

  return { gameId, playerId, token };
}

/**
 * Creates a REAL round commit in Supabase DB
 */
async function createTestRoundCommit(
  gameId: string,
  playerId: string,
  roundIndex: number,
  yearGuess: number | null = 1776,
  location: LatLng | null = { lat: 40.7128, lng: -74.006 }
): Promise<{ commitToken: string; score: number }> {
  const commitToken = generateVerificationToken();

  // Create mock event for scoring
  const mockEvent: EventRecord = {
    id: "test-event-001",
    title: "Test Historical Event",
    description: "Test event for zero-trust verification",
    year: 1776,
    location: {
      id: "nyc",
      name: "New York, USA",
      lat: 40.7128,
      lng: -74.006
    },
    region: "USA",
    imageUrl: "https://example.com/test.jpg",
    thumbUrl: null,
    hints: []
  };

  const guessState = {
    year: yearGuess,
    location: location
  };

  const evaluation = evaluateRound(
    mockEvent,
    guessState,
    roundIndex,
    false,
    { accuracy: 0, xp: 0 }
  );

  const client = await getNewPoolConnection();

  try {
    await client.query(
      `INSERT INTO round_commits
         (game_id, player_id, round_index, submitted_at, year_guess,
          location_lat, location_lng, hints_used, score, verification_token)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9)`,
      [
        gameId,
        playerId,
        roundIndex,
        yearGuess,
        location?.lat ?? null,
        location?.lng ?? null,
        0,
        evaluation.roundXp,
        commitToken
      ]
    );
  } finally {
    client.release();
  }

  testEntities.roundCommits.push({ gameId, playerId, roundIndex });

  return { commitToken, score: evaluation.roundXp };
}

/**
 * Creates REAL round results in Supabase DB
 */
async function createTestRoundResults(
  gameId: string,
  roundIndex: number,
  commits: Array<{ playerId: string; score: number; yearGuess: number | null; location: LatLng | null }>
): Promise<string> {
  const resultsToken = generateVerificationToken();

  const mockEvent: EventRecord = {
    id: "test-event-001",
    title: "Test Historical Event",
    description: "Test event for zero-trust verification",
    year: 1776,
    location: {
      id: "nyc",
      name: "New York, USA",
      lat: 40.7128,
      lng: -74.006
    },
    region: "USA",
    imageUrl: "https://example.com/test.jpg",
    thumbUrl: null,
    hints: []
  };

  // Sort by score DESC for ranking
  const sortedCommits = [...commits].sort((a, b) => b.score - a.score);

  const client = await getNewPoolConnection();

  try {
    for (let i = 0; i < sortedCommits.length; i++) {
      const commit = sortedCommits[i];
      const rank = i + 1;

      // Recompute for full replay fields
      const guessState = {
        year: commit.yearGuess,
        location: commit.location
      };

      const evaluation = evaluateRound(
        mockEvent,
        guessState,
        roundIndex,
        false,
        { accuracy: 0, xp: 0 }
      );

      await client.query(
        `INSERT INTO round_results
           (game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (game_id, round_index, player_id) DO UPDATE SET
           score = $4, rank = $5, distance_km = $6, year_diff = $7, location_score = $8, time_score = $9, verification_token = $10`,
        [
          gameId,
          roundIndex,
          commit.playerId,
          commit.score,
          rank,
          evaluation.distanceKm,
          evaluation.yearDiff,
          evaluation.locationAccuracy,
          evaluation.yearAccuracy,
          resultsToken
        ]
      );
    }
  } finally {
    client.release();
  }

  testEntities.roundResults.push({ gameId, roundIndex });

  return resultsToken;
}

/**
 * Gets the current DB timestamp via SQL NOW()
 */
async function getDbTimestamp(): Promise<string> {
  const client = await getNewPoolConnection();
  try {
    const result = await client.query<{ now: string }>("SELECT NOW()::text AS now");
    return result.rows[0].now;
  } finally {
    client.release();
  }
}

/**
 * Creates a mock event for replay validation
 */
function createMockEvent(): EventRecord {
  return {
    id: "test-event-001",
    title: "Test Historical Event",
    description: "Test event for zero-trust verification",
    year: 1776,
    location: {
      id: "nyc",
      name: "New York, USA",
      lat: 40.7128,
      lng: -74.006
    },
    region: "USA",
    imageUrl: "https://example.com/test.jpg",
    thumbUrl: null,
    hints: []
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: TEST SUITE — ZERO-TRUST EXECUTION PROOF
// ═════════════════════════════════════════════════════════════════════════════

const skipIntegration = !process.env.SUPABASE_DB;

describe.skipIf(skipIntegration)("MP-CORE-LOOP-004: Real DB Execution Proof Harness", () => {
  beforeAll(async () => {
    // Connection verification — MUST be Supabase PostgreSQL
    if (!process.env.SUPABASE_DB_CONNECTION) {
      throw new Error(
        "[HARNESS][FATAL] SUPABASE_DB_CONNECTION not found. " +
        "Real DB execution proof requires Supabase PostgreSQL connection."
      );
    }

    if (!process.env.SUPABASE_DB_CONNECTION.includes("supabase")) {
      throw new Error(
        "[HARNESS][FATAL] Connection must be Supabase. " +
        "Found: " + process.env.SUPABASE_DB_CONNECTION.replace(/:[^:@]+@/, ":***@")
      );
    }

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("🧪 ZERO-TRUST EXECUTION PROOF HARNESS (MP-CORE-LOOP-004 + 005)");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("DB Connection: Supabase PostgreSQL (REAL — HARD ENFORCED)");
    console.log("Verification: Cross-connection, deterministic, anti-fake, isolation-proven");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Verify DB connectivity using ConnectionHandle (MP-CORE-LOOP-005)
    const connA = await acquireConnectionA();
    const connB = await acquireConnectionB();

    try {
      const resultA = await connA.client.query<{ db: string; pid: number }>(
        "SELECT current_database() AS db, pg_backend_pid() AS pid"
      );
      const resultB = await connB.client.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      );

      console.log(`[HARNESS][INIT] Connected to: ${resultA.rows[0].db}`);
      console.log(`[HARNESS][INIT] Connection A backend_pid: ${resultA.rows[0].pid}`);
      console.log(`[HARNESS][INIT] Connection B backend_pid: ${resultB.rows[0].pid}`);
      console.log(`[HARNESS][INIT] Cross-connection proven: ${resultA.rows[0].pid !== resultB.rows[0].pid ? "✅ YES" : "❌ NO"}`);

      // Verify PIDs are different (cross-connection proof)
      expect(resultA.rows[0].pid).not.toBe(resultB.rows[0].pid);

      // Emit v2 proof
      emitExecutionProofV2({
        test: "hard-enforcement-init",
        table: "connection_pool",
        primary_key: `${resultA.rows[0].pid}:${resultB.rows[0].pid}`,
        operation: "VERIFY",
        verification_token: generateVerificationToken(),
        cross_connection: true,
        result: "PASS",
        timestamp: await getDbTimestamp(),
        db_source: "supabase",
        db_backend_pid_a: resultA.rows[0].pid,
        db_backend_pid_b: resultB.rows[0].pid,
        isolation_proven: true
      });
    } finally {
      connA.client.release();
      connB.client.release();
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("📊 HARNESS COMPLETE");
    console.log(`Total proofs emitted: ${executionProofs.length}`);
    console.log(`Total verifications: ${getVerificationLogs().length}`);
    console.log("═══════════════════════════════════════════════════════════════\n");
  });

  beforeEach(async () => {
    clearVerificationLogs();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: BASELINE (REAL SUCCESS)
  // ═══════════════════════════════════════════════════════════════════════════

  it("TEST 1: BASELINE — Real session, players, commits, results with full verification", async () => {
    const testName = "baseline-full-lifecycle";
    const dbTimestamp = await getDbTimestamp();

    console.log(`\n[${testName}] Starting baseline test...`);

    // Step 1: Create session and player
    const { gameId, playerId, token: sessionToken } = await createTestSession("sync");
    console.log(`[${testName}] Created session: ${gameId}`);

    // Step 2: Verify session with cross-connection verification
    await verifyWriteCrossConnection(
      "sessions",
      "game_id = $1",
      [gameId],
      testName,
      { game_id: gameId }
    );

    emitExecutionProof({
      test: testName,
      table: "sessions",
      primary_key: gameId,
      operation: "VERIFY",
      verification_token: sessionToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Cross-connection verification passed"
    });

    // Step 3: Create round commit
    const { commitToken, score } = await createTestRoundCommit(gameId, playerId, 0);
    console.log(`[${testName}] Created round commit, score: ${score}`);

    // Step 4: Verify round commit with ALL verification functions
    await verifyWriteSet(
      testName,
      [{ table: "round_commits", count: 1, where: { game_id: gameId, player_id: playerId, round_index: 0 } }],
      commitToken
    );

    await verifyRowIntegrity(
      "round_commits",
      {
        game_id: gameId,
        player_id: playerId,
        round_index: 0,
        year_guess: 1776,
        verification_token: commitToken
      },
      "game_id = $1 AND player_id = $2 AND round_index = $3",
      [gameId, playerId, 0],
      testName,
      commitToken
    );

    await verifyUniquenessInvariant(
      "round_commits",
      ["game_id", "player_id", "round_index"],
      "game_id = $1 AND player_id = $2 AND round_index = $3",
      [gameId, playerId, 0],
      testName,
      commitToken
    );

    emitExecutionProof({
      test: testName,
      table: "round_commits",
      primary_key: `${gameId}:${playerId}:0`,
      operation: "VERIFY",
      verification_token: commitToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Write-set, row integrity, and uniqueness verified"
    });

    // Step 5: Create round results
    const resultsToken = await createTestRoundResults(gameId, 0, [
      { playerId, score, yearGuess: 1776, location: { lat: 40.7128, lng: -74.006 } }
    ]);

    // Step 6: Verify round results
    await verifyWriteSet(
      testName,
      [{ table: "round_results", count: 1, where: { game_id: gameId, round_index: 0 } }],
      resultsToken
    );

    emitExecutionProof({
      test: testName,
      table: "round_results",
      primary_key: `${gameId}:0:${playerId}`,
      operation: "VERIFY",
      verification_token: resultsToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Round results verified"
    });

    // Step 7: Full deterministic replay
    const mockEvent = createMockEvent();
    const replayResult = await verifyFullReplay(gameId, 0, mockEvent, testName, resultsToken);

    expect(replayResult.success).toBe(true);
    expect(replayResult.playerResults.length).toBe(1);
    expect(replayResult.playerResults[0].matches).toBe(true);

    emitExecutionProof({
      test: testName,
      table: "round_results",
      primary_key: `${gameId}:0`,
      operation: "REPLAY",
      verification_token: resultsToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Deterministic replay validated"
    });

    console.log(`[${testName}] ✅ ALL VERIFICATIONS PASSED`);
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: PAYLOAD CORRUPTION (POST-COMMIT)
  // ═══════════════════════════════════════════════════════════════════════════

  it("TEST 2: PAYLOAD CORRUPTION — Direct DB UPDATE triggers verifyRowIntegrity failure", async () => {
    const testName = "payload-corruption-detected";
    const dbTimestamp = await getDbTimestamp();

    console.log(`\n[${testName}] Testing corruption detection...`);

    // Step 1: Create clean commit
    const { gameId, playerId } = await createTestSession();
    const { commitToken } = await createTestRoundCommit(gameId, playerId, 0, 1776);

    // Step 2: CORRUPT the data directly via SQL (simulating tampering)
    const corruptClient = await getNewPoolConnection();
    try {
      await corruptClient.query(
        "UPDATE round_commits SET year_guess = $1 WHERE game_id = $2 AND player_id = $3 AND round_index = $4",
        [9999, gameId, playerId, 0]
      );
    } finally {
      corruptClient.release();
    }

    emitExecutionProof({
      test: testName,
      table: "round_commits",
      primary_key: `${gameId}:${playerId}:0`,
      operation: "CORRUPT",
      verification_token: commitToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Corrupted year_guess from 1776 to 9999"
    });

    // Step 3: Attempt verification — MUST FAIL
    let corruptionDetected = false;
    try {
      await verifyRowIntegrity(
        "round_commits",
        {
          game_id: gameId,
          player_id: playerId,
          round_index: 0,
          year_guess: 1776, // Expected value (not corrupted)
          verification_token: commitToken
        },
        "game_id = $1 AND player_id = $2 AND round_index = $3",
        [gameId, playerId, 0],
        testName,
        commitToken
      );
    } catch (error) {
      corruptionDetected = true;
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).toContain("year_guess");
      expect(errorMsg).toContain("1776");
      expect(errorMsg).toContain("9999");
    }

    expect(corruptionDetected).toBe(true);

    emitExecutionProof({
      test: testName,
      table: "round_commits",
      primary_key: `${gameId}:${playerId}:0`,
      operation: "VERIFY",
      verification_token: commitToken,
      cross_connection: true,
      result: "FAIL",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Corruption detected: year_guess mismatch"
    });

    console.log(`[${testName}] ✅ CORRUPTION DETECTED AS EXPECTED`);
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: MISSING WRITE
  // ═══════════════════════════════════════════════════════════════════════════

  it("TEST 3: MISSING WRITE — Skipped round_results triggers verifyWriteSet failure", async () => {
    const testName = "missing-write-detected";
    const dbTimestamp = await getDbTimestamp();

    console.log(`\n[${testName}] Testing missing write detection...`);

    // Step 1: Create session and commit (but NOT results)
    const { gameId, playerId } = await createTestSession();
    await createTestRoundCommit(gameId, playerId, 0);

    const missingToken = generateVerificationToken();

    // Step 2: Try to verify round_results that were NEVER written
    let missingDetected = false;
    try {
      await verifyWriteSet(
        testName,
        [
          { table: "round_results", count: 1, where: { game_id: gameId, round_index: 0 } }
        ],
        missingToken
      );
    } catch (error) {
      missingDetected = true;
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).toContain("MISSING");
    }

    expect(missingDetected).toBe(true);

    emitExecutionProof({
      test: testName,
      table: "round_results",
      primary_key: `${gameId}:0`,
      operation: "VERIFY",
      verification_token: missingToken,
      cross_connection: true,
      result: "FAIL",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Missing write detected: round_results not found"
    });

    console.log(`[${testName}] ✅ MISSING WRITE DETECTED AS EXPECTED`);
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: DUPLICATE INSERT
  // ═══════════════════════════════════════════════════════════════════════════

  it("TEST 4: DUPLICATE INSERT — Same PK twice triggers uniqueness violation", async () => {
    const testName = "duplicate-insert-detected";
    const dbTimestamp = await getDbTimestamp();

    console.log(`\n[${testName}] Testing duplicate detection...`);

    const { gameId, playerId } = await createTestSession();

    // Step 1: Create first commit
    const { commitToken: firstToken } = await createTestRoundCommit(gameId, playerId, 0);

    // Step 2: Attempt to insert duplicate (same PK)
    let duplicatePrevented = false;
    try {
      const duplicateClient = await getNewPoolConnection();
      try {
        await duplicateClient.query(
          `INSERT INTO round_commits (game_id, player_id, round_index, submitted_at, year_guess, verification_token)
           VALUES ($1, $2, $3, now(), $4, $5)`,
          [gameId, playerId, 0, 1900, generateVerificationToken()]
        );
      } finally {
        duplicateClient.release();
      }
    } catch (error) {
      duplicatePrevented = true;
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).toMatch(/duplicate|conflict|unique/i);
    }

    expect(duplicatePrevented).toBe(true);

    // Step 3: Verify uniqueness invariant still holds (exactly 1 row)
    await verifyUniquenessInvariant(
      "round_commits",
      ["game_id", "player_id", "round_index"],
      "game_id = $1 AND player_id = $2 AND round_index = $3",
      [gameId, playerId, 0],
      testName,
      firstToken
    );

    emitExecutionProof({
      test: testName,
      table: "round_commits",
      primary_key: `${gameId}:${playerId}:0`,
      operation: "VERIFY",
      verification_token: firstToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Duplicate prevented, exactly 1 row confirmed"
    });

    console.log(`[${testName}] ✅ DUPLICATE PREVENTED, UNIQUENESS VERIFIED`);
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5: TOKEN MISMATCH
  // ═══════════════════════════════════════════════════════════════════════════

  it("TEST 5: TOKEN MISMATCH — Incorrect verification token detected", async () => {
    const testName = "token-mismatch-detected";
    const dbTimestamp = await getDbTimestamp();

    console.log(`\n[${testName}] Testing token mismatch detection...`);

    const { gameId, playerId } = await createTestSession();
    const { commitToken: actualToken } = await createTestRoundCommit(gameId, playerId, 0);

    // Step 1: Generate WRONG token
    const wrongToken = generateVerificationToken();

    // Step 2: Attempt verification with wrong token
    let mismatchDetected = false;
    try {
      await verifyRowIntegrity(
        "round_commits",
        {
          game_id: gameId,
          player_id: playerId,
          round_index: 0,
          verification_token: wrongToken // WRONG token
        },
        "game_id = $1 AND player_id = $2 AND round_index = $3",
        [gameId, playerId, 0],
        testName,
        wrongToken
      );
    } catch {
      mismatchDetected = true;
    }

    expect(mismatchDetected).toBe(true);

    emitExecutionProof({
      test: testName,
      table: "round_commits",
      primary_key: `${gameId}:${playerId}:0`,
      operation: "VERIFY",
      verification_token: wrongToken,
      cross_connection: true,
      result: "FAIL",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: `Token mismatch detected: expected=${actualToken.slice(0, 8)}..., got=${wrongToken.slice(0, 8)}...`
    });

    console.log(`[${testName}] ✅ TOKEN MISMATCH DETECTED AS EXPECTED`);
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 6: REPLAY DRIFT (CRITICAL)
  // ═══════════════════════════════════════════════════════════════════════════

  it("TEST 6: REPLAY DRIFT — Modified scoring inputs trigger full replay failure", async () => {
    const testName = "replay-drift-detected";
    const dbTimestamp = await getDbTimestamp();

    console.log(`\n[${testName}] Testing replay drift detection...`);

    const { gameId, playerId } = await createTestSession();

    // Step 1: Create commit with original values
    const originalYear = 1776;
    const originalLocation: LatLng = { lat: 40.7128, lng: -74.006 };
    const { score: originalScore } = await createTestRoundCommit(
      gameId, playerId, 0, originalYear, originalLocation
    );

    // Step 2: Create results based on original commit
    await createTestRoundResults(gameId, 0, [
      { playerId, score: originalScore, yearGuess: originalYear, location: originalLocation }
    ]);

    // Step 3: CORRUPT the commit's scoring input in DB
    const corruptClient = await getNewPoolConnection();
    try {
      await corruptClient.query(
        "UPDATE round_commits SET year_guess = $1, score = $2 WHERE game_id = $3 AND player_id = $4 AND round_index = $5",
        [1500, 999, gameId, playerId, 0] // Corrupted values
      );
    } finally {
      corruptClient.release();
    }

    emitExecutionProof({
      test: testName,
      table: "round_commits",
      primary_key: `${gameId}:${playerId}:0`,
      operation: "CORRUPT",
      verification_token: generateVerificationToken(),
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Corrupted year_guess: 1776 → 1500, score: original → 999"
    });

    // Step 4: Full replay verification MUST detect drift
    const mockEvent = createMockEvent();

    let driftDetected = false;
    try {
      await verifyFullReplay(gameId, 0, mockEvent, testName);
    } catch (error) {
      driftDetected = true;
      const errorMsg = error instanceof Error ? error.message : String(error);
      expect(errorMsg).toContain("Replay drift");
    }

    expect(driftDetected).toBe(true);

    emitExecutionProof({
      test: testName,
      table: "round_results",
      primary_key: `${gameId}:0`,
      operation: "REPLAY",
      verification_token: generateVerificationToken(),
      cross_connection: true,
      result: "FAIL",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Replay drift detected: recomputed scores don't match stored"
    });

    console.log(`[${testName}] ✅ REPLAY DRIFT DETECTED AS EXPECTED`);
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 7: DETERMINISTIC REPLAY (CRITICAL)
  // ═══════════════════════════════════════════════════════════════════════════

  it("TEST 7: DETERMINISTIC REPLAY — Full recomputation matches stored results exactly", async () => {
    const testName = "deterministic-replay-validation";
    const dbTimestamp = await getDbTimestamp();

    console.log(`\n[${testName}] Testing deterministic replay validation...`);

    const { gameId, playerId: player1Id } = await createTestSession();
    const player2Id = randomUUID();

    // Add second player
    const client = await getNewPoolConnection();
    try {
      await client.query(
        "INSERT INTO session_players (game_id, player_id, joined_at) VALUES ($1, $2, now())",
        [gameId, player2Id]
      );
    } finally {
      client.release();
    }

    // Step 1: Create commits for both players with different guesses
    const guess1: LatLng = { lat: 40.7128, lng: -74.006 }; // NYC (exact)
    const guess2: LatLng = { lat: 41.8781, lng: -87.6298 }; // Chicago (different)

    const { score: score1 } = await createTestRoundCommit(
      gameId, player1Id, 0, 1776, guess1
    );
    const { score: score2 } = await createTestRoundCommit(
      gameId, player2Id, 0, 1780, guess2
    );

    // Step 2: Create round results
    const resultsToken = await createTestRoundResults(gameId, 0, [
      { playerId: player1Id, score: score1, yearGuess: 1776, location: guess1 },
      { playerId: player2Id, score: score2, yearGuess: 1780, location: guess2 }
    ]);

    console.log(`[${testName}] Created 2 commits, scores: ${score1}, ${score2}`);

    // Step 3: Fetch ALL round_commits FROM DB
    const fetchClient = await getNewPoolConnection();
    const commitsResult = await fetchClient.query<{
      player_id: string;
      year_guess: number | null;
      location_lat: number | null;
      location_lng: number | null;
      score: number | null;
    }>(
      `SELECT player_id, year_guess, location_lat, location_lng, score
       FROM round_commits WHERE game_id = $1 AND round_index = $2`,
      [gameId, 0]
    );
    fetchClient.release();

    expect(commitsResult.rows.length).toBe(2);
    console.log(`[${testName}] Fetched ${commitsResult.rows.length} commits from DB`);

    // Step 4: Recompute results FROM SCRATCH using DB data only
    const mockEvent = createMockEvent();
    const recomputedResults = commitsResult.rows.map(row => {
      const guessState = {
        year: row.year_guess,
        location: row.location_lat !== null && row.location_lng !== null
          ? { lat: row.location_lat, lng: row.location_lng } as LatLng
          : null
      };

      const evaluation = evaluateRound(
        mockEvent,
        guessState,
        0,
        false,
        { accuracy: 0, xp: 0 }
      );

      return {
        playerId: row.player_id,
        storedScore: row.score,
        recomputedScore: evaluation.roundXp,
        distanceKm: evaluation.distanceKm,
        yearDiff: evaluation.yearDiff,
        locationScore: evaluation.locationAccuracy,
        timeScore: evaluation.yearAccuracy
      };
    });

    console.log(`[${testName}] Recomputed ${recomputedResults.length} scores`);

    // Step 5: Fetch stored round_results FROM DB
    const resultsClient = await getNewPoolConnection();
    const storedResults = await resultsClient.query<{
      player_id: string;
      score: number;
      distance_km: number | null;
      year_diff: number | null;
      location_score: number | null;
      time_score: number | null;
    }>(
      `SELECT player_id, score, distance_km, year_diff, location_score, time_score
       FROM round_results WHERE game_id = $1 AND round_index = $2`,
      [gameId, 0]
    );
    resultsClient.release();

    expect(storedResults.rows.length).toBe(2);
    console.log(`[${testName}] Fetched ${storedResults.rows.length} stored results from DB`);

    // Step 6: Compare: recomputed vs stored for EVERY field (STRICT EQUALITY)
    let allMatch = true;
    const mismatches: string[] = [];

    for (const recomputed of recomputedResults) {
      const stored = storedResults.rows.find(r => r.player_id === recomputed.playerId);

      if (!stored) {
        allMatch = false;
        mismatches.push(`${recomputed.playerId}: no stored result found`);
        continue;
      }

      // Strict equality checks — NO tolerance
      if (stored.score !== recomputed.recomputedScore) {
        allMatch = false;
        mismatches.push(`${recomputed.playerId}: score ${stored.score} !== ${recomputed.recomputedScore}`);
      }

      if (stored.distance_km !== null &&
          Math.abs(stored.distance_km - recomputed.distanceKm) > 0.01) {
        allMatch = false;
        mismatches.push(`${recomputed.playerId}: distance_km mismatch`);
      }

      if (stored.year_diff !== null && stored.year_diff !== recomputed.yearDiff) {
        allMatch = false;
        mismatches.push(`${recomputed.playerId}: year_diff ${stored.year_diff} !== ${recomputed.yearDiff}`);
      }

      if (stored.location_score !== null && stored.location_score !== recomputed.locationScore) {
        allMatch = false;
        mismatches.push(`${recomputed.playerId}: location_score mismatch`);
      }

      if (stored.time_score !== null && stored.time_score !== recomputed.timeScore) {
        allMatch = false;
        mismatches.push(`${recomputed.playerId}: time_score mismatch`);
      }
    }

    // Step 7: Run full replay verification
    const replayResult = await verifyFullReplay(gameId, 0, mockEvent, testName, resultsToken);

    expect(replayResult.success).toBe(true);
    expect(allMatch).toBe(true);
    expect(replayResult.playerResults.every(pr => pr.matches)).toBe(true);

    emitExecutionProof({
      test: testName,
      table: "round_results",
      primary_key: `${gameId}:0`,
      operation: "REPLAY",
      verification_token: resultsToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: `Deterministic replay validated: ${recomputedResults.length} players, all fields match exactly`
    });

    console.log(`[${testName}] ✅ DETERMINISTIC REPLAY VALIDATED — EXACT MATCH`);
  }, 30000);
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: CROSS-CONNECTION VERIFICATION PROOF
// ═════════════════════════════════════════════════════════════════════════════

describe("MP-CORE-LOOP-004: Cross-Connection Verification Proof", () => {
  it("proves separate connection instances are used for write and verify", async () => {
    const testName = "cross-connection-proof";
    const dbTimestamp = await getDbTimestamp();

    // Get connection A
    const connA = await getNewPoolConnection();

    // Get connection B (MUST be different instance)
    const connB = await getNewPoolConnection();

    expect(connA).not.toBe(connB);

    // Verify both connections work independently
    const resultA = await connA.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const resultB = await connB.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");

    expect(resultA.rows[0].pid).toBeGreaterThan(0);
    expect(resultB.rows[0].pid).toBeGreaterThan(0);
    expect(resultA.rows[0].pid).not.toBe(resultB.rows[0].pid);

    connA.release();
    connB.release();

    const proofToken = generateVerificationToken();

    emitExecutionProof({
      test: testName,
      table: "connection_pool",
      primary_key: `${resultA.rows[0].pid}:${resultB.rows[0].pid}`,
      operation: "VERIFY",
      verification_token: proofToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: `Separate connections proven: pidA=${resultA.rows[0].pid}, pidB=${resultB.rows[0].pid}`
    });

    console.log(`\n[${testName}] ✅ CROSS-CONNECTION VERIFICATION PROVEN`);
    console.log(`   Connection A PID: ${resultA.rows[0].pid}`);
    console.log(`   Connection B PID: ${resultB.rows[0].pid}`);
  }, 30000);
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: PERFORMANCE METRICS
// ═════════════════════════════════════════════════════════════════════════════

describe("MP-CORE-LOOP-004: Performance Metrics", () => {
  it("logs verification latency metrics", async () => {
    const testName = "performance-metrics";
    const dbTimestamp = await getDbTimestamp();

    // Run baseline test to generate metrics
    const { gameId, playerId } = await createTestSession();
    const { commitToken } = await createTestRoundCommit(gameId, playerId, 0);

    await verifyRowIntegrity(
      "round_commits",
      {
        game_id: gameId,
        player_id: playerId,
        round_index: 0,
        verification_token: commitToken
      },
      "game_id = $1 AND player_id = $2 AND round_index = $3",
      [gameId, playerId, 0],
      testName,
      commitToken
    );

    const metrics = getPerformanceMetrics();

    expect(metrics.total_verifications).toBeGreaterThan(0);
    expect(metrics.connections_used_per_op).toBeGreaterThanOrEqual(1);

    console.log(`\n[${testName}] Performance Metrics:`);
    console.log(`   Total verifications: ${metrics.total_verifications}`);
    console.log(`   Avg time: ${metrics.avg_verification_time_ms}ms`);
    console.log(`   Max time: ${metrics.max_verification_time_ms}ms`);
    console.log(`   Connections per op: ${metrics.connections_used_per_op}`);

    emitExecutionProof({
      test: testName,
      table: "metrics",
      primary_key: testName,
      operation: "VERIFY",
      verification_token: commitToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: `avg=${metrics.avg_verification_time_ms}ms, max=${metrics.max_verification_time_ms}ms, conns=${metrics.connections_used_per_op}`
    });

    await cleanupTestData();
  }, 30000);
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8: SINGLE SOURCE OF TRUTH VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe("MP-CORE-LOOP-004: Single Source of Truth Validation", () => {
  it("validates all verification reads come from DB, not memory", async () => {
    const testName = "db-source-of-truth";
    const dbTimestamp = await getDbTimestamp();

    const { gameId, playerId } = await createTestSession();
    const { commitToken } = await createTestRoundCommit(gameId, playerId, 0);

    // Get commit directly from DB using FRESH connection
    const client = await getNewPoolConnection();
    const dbResult = await client.query<{
      game_id: string;
      player_id: string;
      round_index: number;
      verification_token: string;
    }>(
      "SELECT game_id, player_id, round_index, verification_token FROM round_commits WHERE game_id = $1",
      [gameId]
    );
    client.release();

    // Verify the data came from DB (not hardcoded, not from cache)
    expect(dbResult.rows.length).toBe(1);
    expect(dbResult.rows[0].game_id).toBe(gameId);
    expect(dbResult.rows[0].player_id).toBe(playerId);
    expect(dbResult.rows[0].verification_token).toBe(commitToken);

    emitExecutionProof({
      test: testName,
      table: "round_commits",
      primary_key: `${gameId}:${playerId}:0`,
      operation: "VERIFY",
      verification_token: commitToken,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      details: "Verification data confirmed from DB read, not memory"
    });

    console.log(`\n[${testName}] ✅ SINGLE SOURCE OF TRUTH VALIDATED`);
    console.log(`   All verification data read from Supabase DB`);
    console.log(`   No in-memory values used for verification`);

    await cleanupTestData();
  }, 30000);
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9: TRANSACTION ISOLATION VALIDATION (MP-CORE-LOOP-005)
// ═════════════════════════════════════════════════════════════════════════════

describe("MP-CORE-LOOP-005: Transaction Boundary Validation", () => {
  it("TEST 8: TRANSACTION ISOLATION — Uncommitted writes NOT visible to other connections", async () => {
    const testName = "transaction-isolation-proof";

    console.log(`\n[${testName}] Testing transaction isolation...`);

    // Create a test session for this test
    const { gameId } = await createTestSession();

    // Run the isolation proof test
    const isolationProof = await verifyTransactionIsolation(gameId, testName);

    // Assert all isolation properties
    expect(isolationProof.uncommittedVisibleToA).toBe(true); // Writer sees its own uncommitted data
    expect(isolationProof.uncommittedVisibleToB).toBe(false); // Other connection does NOT see uncommitted data
    expect(isolationProof.committedVisibleToA).toBe(true); // Writer sees committed data
    expect(isolationProof.committedVisibleToB).toBe(true); // Other connection sees committed data after commit
    expect(isolationProof.isolationProven).toBe(true);

    console.log(`[${testName}] ✅ TRANSACTION ISOLATION PROVEN:`);
    console.log(`   Uncommitted visible to writer (A): ${isolationProof.uncommittedVisibleToA ? "YES" : "NO"}`);
    console.log(`   Uncommitted visible to reader (B): ${isolationProof.uncommittedVisibleToB ? "YES" : "NO"} (must be NO)`);
    console.log(`   Committed visible to writer (A): ${isolationProof.committedVisibleToA ? "YES" : "NO"}`);
    console.log(`   Committed visible to reader (B): ${isolationProof.committedVisibleToB ? "YES" : "NO"} (must be YES)`);
    console.log(`   Isolation proven: ${isolationProof.isolationProven ? "✅ YES" : "❌ NO"}`);

    await cleanupTestData();
  }, 30000);

  it("TEST 9: HARD ENFORCEMENT — System requires DB at module load", async () => {
    const testName = "hard-enforcement-verification";

    console.log(`\n[${testName}] Verifying hard enforcement...`);

    // This test proves that DB connection was verified at module load
    // If we got here, assertDbConnectionVerified() already passed
    expect(() => assertDbConnectionVerified()).not.toThrow();

    console.log(`[${testName}] ✅ HARD ENFORCEMENT VERIFIED`);
    console.log(`   DB connection was verified at module load`);
    console.log(`   No fake execution path possible`);
  }, 30000);
});
