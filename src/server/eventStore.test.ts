// eventStore.test.ts — Validation Tests for Zero-Corruption Event Pipeline
// TASK: CORE-FIX-002
//
// These tests MUST fail before the fix and pass after.
// Tests validate that the event pipeline rejects invalid event sequences.

import { describe, it, expect } from "vitest";
import { getTransactionClient, type DbTransactionClient } from "./sessionCore";
import { appendEvent } from "./eventStore";
import { randomUUID } from "crypto";

// Test helpers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function createTestSession(client: DbTransactionClient): Promise<string> {
  const gameId = randomUUID();
  await client.query(
    `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
     VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
    [gameId, BigInt(12345)]
  );
  return gameId;
}

async function cleanupTestSession(client: DbTransactionClient, gameId: string): Promise<void> {
  await client.query(`DELETE FROM round_events WHERE game_id = $1`, [gameId]);
  await client.query(`DELETE FROM sessions WHERE game_id = $1`, [gameId]);
}

describe("CORE-FIX-002: Zero-Corruption Event Pipeline", () => {
  describe("Validation Tests (Must fail before fix, pass after)", () => {
    describe("Test 1: Invalid Transition Detection", () => {
      it("ROUND_STARTED → SESSION_COMPLETE must throw INVALID_TRANSITION", async () => {
        const client = await getTransactionClient();
        let threw = false;
        let errorMessage = "";
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session first
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
             VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
            [gameId, BigInt(12345)]
          );

          // Valid: SESSION_CREATED
          await appendEvent(client, gameId, "SESSION_CREATED", { test: true }, null);

          // Valid: ROUND_STARTED
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0 }, 0);

          // Invalid: ROUND_STARTED → SESSION_COMPLETE (must go through ROUND_COMPLETE)
          await appendEvent(client, gameId, "SESSION_COMPLETE", { totalRounds: 3 }, 0);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          errorMessage = error instanceof Error ? error.message : String(error);
          await client.query("ROLLBACK");
        } finally {
          // Cleanup
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(true);
        expect(errorMessage).toContain("INVALID_TRANSITION");
      });

      it("SESSION_COMPLETE → ROUND_STARTED must throw (terminal state)", async () => {
        const client = await getTransactionClient();
        let threw = false;
        let errorMessage = "";
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
             VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
            [gameId, BigInt(12345)]
          );

          // Valid: SESSION_CREATED → ROUND_STARTED → ROUND_COMPLETE → SESSION_COMPLETE
          await appendEvent(client, gameId, "SESSION_CREATED", {}, null);
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0 }, 0);
          await appendEvent(client, gameId, "ROUND_COMPLETE", {}, 0);
          await appendEvent(client, gameId, "SESSION_COMPLETE", { totalRounds: 1 }, 0);

          // Invalid: SESSION_COMPLETE → ROUND_STARTED
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 1 }, 1);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          errorMessage = error instanceof Error ? error.message : String(error);
          await client.query("ROLLBACK");
        } finally {
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(true);
        expect(errorMessage).toContain("INVALID_TRANSITION");
        expect(errorMessage).toContain("SESSION_COMPLETE");
      });
    });

    describe("Test 2: Missing SESSION_CREATED First", () => {
      it("First event not SESSION_CREATED must throw FIRST_EVENT_MUST_BE_SESSION_CREATED", async () => {
        const client = await getTransactionClient();
        let threw = false;
        let errorMessage = "";
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session but don't write SESSION_CREATED
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max)
             VALUES ($1, 'sync', 120, 3, 1800, 2024)`,
            [gameId]
          );

          // Invalid: First event is ROUND_STARTED (must be SESSION_CREATED)
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0 }, 0);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          errorMessage = error instanceof Error ? error.message : String(error);
          await client.query("ROLLBACK");
        } finally {
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(true);
        expect(errorMessage).toContain("FIRST_EVENT_MUST_BE_SESSION_CREATED");
      });
    });

    describe("Test 3: Invalid Round Increment", () => {
      it("Skipping round index must throw INVALID_ROUND_INCREMENT", async () => {
        const client = await getTransactionClient();
        let threw = false;
        let errorMessage = "";
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
             VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
            [gameId, BigInt(12345)]
          );

          // Valid: SESSION_CREATED → ROUND_STARTED (round 0)
          await appendEvent(client, gameId, "SESSION_CREATED", {}, null);
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0 }, 0);

          // Valid: ROUND_COMPLETE
          await appendEvent(client, gameId, "ROUND_COMPLETE", {}, 0);

          // Invalid: Skip to round 2 (must go to round 1)
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 2 }, 2);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          errorMessage = error instanceof Error ? error.message : String(error);
          await client.query("ROLLBACK");
        } finally {
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(true);
        expect(errorMessage).toContain("INVALID_ROUND_INCREMENT");
      });

      it("GUESS_SUBMITTED in wrong round must throw ROUND_MISMATCH", async () => {
        const client = await getTransactionClient();
        let threw = false;
        let errorMessage = "";
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
             VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
            [gameId, BigInt(12345)]
          );

          // Valid: SESSION_CREATED → ROUND_STARTED (round 0)
          await appendEvent(client, gameId, "SESSION_CREATED", {}, null);
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0 }, 0);

          // Invalid: GUESS_SUBMITTED in round 1 when we're in round 0
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "test", yearGuess: 1900, score: 100 }, 1);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          errorMessage = error instanceof Error ? error.message : String(error);
          await client.query("ROLLBACK");
        } finally {
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(true);
        expect(errorMessage).toContain("ROUND_MISMATCH");
      });
    });

    describe("Test 4: Valid Event Sequences (Must Pass)", () => {
      it("Valid session lifecycle: SESSION_CREATED → ROUND_STARTED → GUESS_SUBMITTED → ROUND_COMPLETE → SESSION_COMPLETE", async () => {
        const client = await getTransactionClient();
        let threw = false;
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
             VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
            [gameId, BigInt(12345)]
          );

          // Valid full lifecycle
          await appendEvent(client, gameId, "SESSION_CREATED", { hostId: "player1" }, null);
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0, startedAt: new Date().toISOString() }, 0);
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "player1", yearGuess: 1900, score: 500 }, 0);
          await appendEvent(client, gameId, "ROUND_COMPLETE", { commitCount: 1 }, 0);
          await appendEvent(client, gameId, "SESSION_COMPLETE", { totalRounds: 1 }, 0);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          console.error("Unexpected error:", error);
          await client.query("ROLLBACK");
        } finally {
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(false);
      });

      it("Multi-round session lifecycle must pass", async () => {
        const client = await getTransactionClient();
        let threw = false;
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
             VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
            [gameId, BigInt(12345)]
          );

          // Valid: SESSION_CREATED
          await appendEvent(client, gameId, "SESSION_CREATED", {}, null);

          // Round 0
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0 }, 0);
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "p1", score: 100 }, 0);
          await appendEvent(client, gameId, "ROUND_COMPLETE", {}, 0);

          // Round 1
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 1 }, 1);
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "p1", score: 200 }, 1);
          await appendEvent(client, gameId, "ROUND_COMPLETE", {}, 1);

          // Round 2 (final)
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 2 }, 2);
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "p1", score: 300 }, 2);
          await appendEvent(client, gameId, "ROUND_COMPLETE", {}, 2);

          // Session complete
          await appendEvent(client, gameId, "SESSION_COMPLETE", { totalRounds: 3 }, 2);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          console.error("Unexpected error:", error);
          await client.query("ROLLBACK");
        } finally {
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(false);
      });

      it("Multiple GUESS_SUBMITTED in same round must pass", async () => {
        const client = await getTransactionClient();
        let threw = false;
        const gameId = randomUUID();

        try {
          await client.query("BEGIN");

          // Create session
          await client.query(
            `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed)
             VALUES ($1, 'sync', 120, 3, 1800, 2024, $2)`,
            [gameId, BigInt(12345)]
          );

          // Valid: SESSION_CREATED → ROUND_STARTED
          await appendEvent(client, gameId, "SESSION_CREATED", {}, null);
          await appendEvent(client, gameId, "ROUND_STARTED", { roundIndex: 0 }, 0);

          // Multiple guesses in same round (valid per FSM)
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "p1", score: 100 }, 0);
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "p2", score: 200 }, 0);
          await appendEvent(client, gameId, "GUESS_SUBMITTED", { playerId: "p3", score: 150 }, 0);

          // Round complete
          await appendEvent(client, gameId, "ROUND_COMPLETE", {}, 0);

          await client.query("COMMIT");
        } catch (error) {
          threw = true;
          console.error("Unexpected error:", error);
          await client.query("ROLLBACK");
        } finally {
          try {
            await cleanupTestSession(client, gameId);
          } catch {
            // Ignore cleanup errors
          }
          client.release();
        }

        expect(threw).toBe(false);
      });
    });
  });
});
