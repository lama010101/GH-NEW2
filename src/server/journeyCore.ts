// journeyCore.ts — Historian's Journey server logic (HJ-BUILD-PLAYTHROUGH-START-001)
// Authority: docs/HISTORIANS_JOURNEY_SPEC.md v1 (single source of truth).
//
// Journey reuses Practice mode's single-player session infrastructure (spec §4):
// a journey playthrough creates a mode='practice' sessions row + session_players
// host row + SESSION_CREATED event with the stage's drawn eventIds pinned —
// the exact shape createDailySession produces for its pinned daily set, so the
// existing /practice/[gameId] play UI works unchanged (LOBBY → auto-start).
// journey_playthroughs.session_id is the only link between journey and sessions.
//
// All queries run through the service-role pg pool / transaction client —
// journey tables have no authenticated-write policies by design (score-forgery
// guard), so this module is server-only. journey_stage_events additionally has
// NO select policy at all on prod; draws must filter approved_at IS NOT NULL
// explicitly here rather than rely on RLS.

import { randomUUID, randomBytes } from "crypto";
import {
  getTransactionClient,
  type DbTransactionClient,
} from "@/server/sessionCore";
import { appendEvent } from "@/server/eventStore";

// Identical to the sessionCore-local room-code generator — sessionCore.ts is
// protected-baseline so it cannot gain an export; the LCG is duplicated here
// verbatim to keep room-code space/collision behavior identical across all
// session creators. (Both sites use the same SAVEPOINT retry loop anyway.)
function generateJourneyRoomCode(seed: bigint): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = Number(seed % BigInt(2 ** 31))
  let code = ''
  for (let i = 0; i < 6; i++) {
    s = (s * 1664525 + 1013904223) % (2 ** 32)
    code += chars[Math.floor(s / 134217728) % chars.length]
  }
  return code
}

// Same checks as sessionCore-local assertValidDisplayName (protected file —
// cannot import). Trim + non-empty + <= 40 chars.
function assertJourneyDisplayName(displayName: string): string {
  const normalized = displayName.trim();
  if (normalized.length === 0) {
    throw new Error("displayName is required");
  }
  if (normalized.length > 40) {
    throw new Error("displayName must be 40 characters or fewer");
  }
  return normalized;
}

// Practice-mode session defaults reused for journey sessions:
// - round_timer_sec 120 = clampRoundTimer(undefined) for non-async modes.
// - results_auto_advance_sec 90 = RESULTS_AUTO_ADVANCE_DEFAULT / column default.
// - session_deadline_days NULL (async-only field).
const JOURNEY_ROUND_TIMER_SEC = 120;
const JOURNEY_RESULTS_AUTO_ADVANCE_SEC = 90;
const ROOM_CODE_MAX_ATTEMPTS = 5;

export type StartJourneyPlaythroughInput = {
  playerId: string;
  stageId: string;
  displayName?: string;
  // Caller's is_anonymous claim, read once by the route layer from its own
  // single auth.getUser() call (spec §0.5 / HJ-BUILD-GUESTGATE-INVESTPLUS-001).
  // Never re-fetch this here — a second sequential GoTrueClient call risks
  // the shared-mutex deadlock the CTO ruling in supabaseBrowser.ts warns about.
  isAnonymous: boolean;
};

export type StartJourneyPlaythroughResult = {
  gameId: string;
  playthroughId: string;
  stageId: string;
  stageNumber: number;
  drawnEventIds: string[];
};

/**
 * Start a Historian's Journey playthrough for `playerId` on `stageId`.
 *
 * Steps (single transaction):
 *   1. Stage must exist and have status='live'.
 *   2. Unlock rule (spec §2 linear unlock, no skipping): stage 1 is always
 *      unlocked; stage N>1 requires journey_player_progress.status='completed'
 *      on stage N-1.
 *   3. Draw pool_size event_ids at random from the stage's APPROVED,
 *      non-stale journey_stage_events. Fewer than pool_size approved → throw
 *      (never silently short the round count).
 *   4. Create a practice-shaped session (mode='practice', pinned eventIds).
 *   5. Insert journey_playthroughs (session_id, drawn_event_ids).
 *   6. Upsert journey_player_progress: attempts_count+1, last_played_at=now(),
 *      status 'unlocked' unless already 'completed' (replay preserves it).
 * Returns the new session's game_id for routing into the practice play UI.
 *
 * Throws Error on any guard failure; callers map to HTTP per route convention.
 */
export async function startJourneyPlaythrough(
  input: StartJourneyPlaythroughInput
): Promise<StartJourneyPlaythroughResult> {
  const playerId = input.playerId.trim();
  const stageId = input.stageId.trim();
  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }
  if (stageId.length === 0) {
    throw new Error("stageId is required");
  }

  const client: DbTransactionClient = await getTransactionClient();
  try {
    await client.query("BEGIN");

    // Step 1 — stage exists and is live.
    const stageResult = await client.query<{
      id: string;
      stage_number: number;
      status: string;
      pool_size: number;
    }>(
      `SELECT id, stage_number, status, pool_size
       FROM public.journey_stages
       WHERE id = $1
       FOR UPDATE`,
      [stageId]
    );
    if (stageResult.rows.length === 0) {
      throw new Error("Journey stage not found");
    }
    const stage = stageResult.rows[0];
    if (stage.status !== "live") {
      throw new Error(`Journey stage ${stage.stage_number} is not live`);
    }

    // Step 2 — linear unlock (spec §2): stage 1 always unlocked; stage N>1
    // requires the prior stage's progress row at status='completed'.
    if (stage.stage_number > 1) {
      const unlockResult = await client.query<{ unlocked: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM public.journey_player_progress jp
           JOIN public.journey_stages ps ON ps.id = jp.stage_id
           WHERE jp.player_id = $1
             AND ps.stage_number = $2
             AND jp.status = 'completed'
         ) AS unlocked`,
        [playerId, stage.stage_number - 1]
      );
      if (!unlockResult.rows[0].unlocked) {
        throw new Error(
          `Journey stage ${stage.stage_number} is locked — complete stage ${stage.stage_number - 1} first`
        );
      }
    }

    // Step 2.5 — guest gate (spec §0.5 / HJ-BUILD-GUESTGATE-INVESTPLUS-001):
    // a guest may play stage 1 fully, but stage 2+ requires a permanent
    // account. isAnonymous is passed in by the route layer's single
    // auth.getUser() read — never re-fetched here (shared-mutex deadlock
    // rule, see StartJourneyPlaythroughInput).
    if (stage.stage_number >= 2 && input.isAnonymous) {
      throw new Error(
        "Journey stage requires a permanent account — convert your guest session first"
      );
    }

    // Step 3 — draw pool_size approved, non-stale candidate events at random,
    // constrained so the drawn set's year spread (max - min) never exceeds
    // capYears = 10 * stage_number (HJ-BUILD-YEARSPANCAP-005). Anchor-and-window
    // approach: one random anchor is picked from the pool, then pool_size - 1
    // further events are drawn whose event_year falls inside
    // [anchorYear - capYears, anchorYear + capYears] — a 2*capYears-wide window
    // centered on the anchor, so the anchor can end up anywhere in the final
    // set's spread. stale_flag rows are excluded: the flag means the
    // underlying event changed after approval and is pending re-review (spec §3
    // re-review trigger), so it is not safe to serve to players until
    // re-approved.
    const capYears = 10 * stage.stage_number;
    const anchorResult = await client.query<{
      event_id: string;
      event_year: number;
      total_approved: number;
    }>(
      `SELECT jse.event_id, e.event_year,
              COUNT(*) OVER ()::int AS total_approved
       FROM public.journey_stage_events jse
       JOIN public.events e ON e.id = jse.event_id
       WHERE jse.stage_id = $1
         AND jse.approved_at IS NOT NULL
         AND jse.stale_flag = false
       ORDER BY random()
       LIMIT 1`,
      [stageId]
    );
    if (anchorResult.rows.length === 0) {
      throw new Error(
        `Insufficient approved content for journey stage ${stage.stage_number}: ` +
        `0 approved event(s), ${stage.pool_size} required`
      );
    }
    const anchor = anchorResult.rows[0];
    if (anchor.total_approved < stage.pool_size) {
      throw new Error(
        `Insufficient approved content for journey stage ${stage.stage_number}: ` +
        `${anchor.total_approved} approved event(s), ${stage.pool_size} required`
      );
    }
    const anchorYear = anchor.event_year;
    const drawResult = await client.query<{
      event_id: string;
      event_year: number;
    }>(
      `SELECT jse.event_id, e.event_year
       FROM public.journey_stage_events jse
       JOIN public.events e ON e.id = jse.event_id
       WHERE jse.stage_id = $1
         AND jse.approved_at IS NOT NULL
         AND jse.stale_flag = false
         AND jse.event_id <> $2
         AND e.event_year BETWEEN $3 AND $4
       ORDER BY random()
       LIMIT $5`,
      [
        stageId,
        anchor.event_id,
        anchorYear - capYears,
        anchorYear + capYears,
        stage.pool_size - 1,
      ]
    );
    if (drawResult.rows.length < stage.pool_size - 1) {
      throw new Error(
        `Insufficient approved content within a ${capYears}-year window for journey ` +
        `stage ${stage.stage_number} (anchor year ${anchorYear}): ` +
        `${drawResult.rows.length + 1} available, ${stage.pool_size} required`
      );
    }
    const drawnRows = [anchor, ...drawResult.rows];
    const drawnEventIds = drawnRows.map((r) => r.event_id);
    const yearMin = Math.min(...drawnRows.map((r) => r.event_year));
    const yearMax = Math.max(...drawnRows.map((r) => r.event_year));
    if (yearMax - yearMin > capYears) {
      throw new Error(
        `Insufficient approved content within a ${capYears}-year window for journey ` +
        `stage ${stage.stage_number} (anchor year ${anchorYear}): ` +
        `drawn set year spread ${yearMax - yearMin} exceeds cap`
      );
    }

    // Step 4 — practice-shaped session (createDailySession shape: pinned
    // eventIds, host session_players row with ready=true so the practice
    // page's LOBBY auto-start path works unchanged).
    const gameId = randomUUID();
    const seed =
      BigInt("0x" + randomBytes(8).toString("hex")) & BigInt("0x7FFFFFFFFFFFFFFF");

    let roomCode = generateJourneyRoomCode(seed);
    let roomCodeInsertSuccess = false;
    for (
      let roomCodeAttempts = 0;
      !roomCodeInsertSuccess && roomCodeAttempts < ROOM_CODE_MAX_ATTEMPTS;
      roomCodeAttempts++
    ) {
      try {
        await client.query(`SAVEPOINT room_code_attempt`);
        await client.query(
          `INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, results_auto_advance_sec, seed, room_code, scoring_reference_year)
           VALUES ($1, 'practice', $2, $3, $4, $5, $6, $7, $8, EXTRACT(YEAR FROM now())::INT)`,
          [
            gameId,
            JOURNEY_ROUND_TIMER_SEC,
            drawnEventIds.length,
            yearMin,
            yearMax,
            JOURNEY_RESULTS_AUTO_ADVANCE_SEC,
            seed,
            roomCode,
          ]
        );
        await client.query(`RELEASE SAVEPOINT room_code_attempt`);
        roomCodeInsertSuccess = true;
      } catch (err: unknown) {
        await client.query(`ROLLBACK TO SAVEPOINT room_code_attempt`);
        if (roomCodeAttempts + 1 >= ROOM_CODE_MAX_ATTEMPTS) {
          throw new Error("Failed to generate unique room code after 5 attempts");
        }
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === "23505" && pgErr.constraint === "sessions_room_code_key") {
          roomCode = generateJourneyRoomCode(seed + BigInt(roomCodeAttempts + 1));
        } else {
          throw err;
        }
      }
    }

    const hostAvatarResult = await client.query<{
      display_name: string;
      avatar_url: string;
    }>(
      `SELECT p.display_name, p.avatar_url
       FROM public.profiles p
       WHERE p.id = $1`,
      [playerId]
    );
    const hostProfileName: string | null =
      hostAvatarResult.rows[0]?.display_name ?? null;
    const hostDisplayName =
      hostProfileName && hostProfileName.trim().length > 0
        ? hostProfileName.trim()
        : input.displayName && input.displayName.trim().length > 0
          ? input.displayName.trim()
          : `Player-${playerId.slice(0, 6)}`;
    assertJourneyDisplayName(hostDisplayName);
    let hostAvatarUrl = hostAvatarResult.rows[0]?.avatar_url ?? null;
    if (!hostAvatarUrl) {
      const fallbackResult = await client.query<{ avatar_url: string }>(
        `SELECT COALESCE(firebase_url, image_url) AS avatar_url
         FROM public.avatars WHERE ready = true ORDER BY random() LIMIT 1`
      );
      hostAvatarUrl = fallbackResult.rows[0]?.avatar_url ?? null;
    }
    await client.query(
      `INSERT INTO session_players (game_id, player_id, display_name, joined_at, ready, is_host, avatar_url)
       VALUES ($1, $2, $3, now(), true, true, $4)`,
      [gameId, playerId, hostDisplayName, hostAvatarUrl]
    );

    await appendEvent(client, gameId, "SESSION_CREATED", {
      mode: "practice",
      totalRounds: drawnEventIds.length,
      hostPlayerId: playerId,
      seed: seed.toString(),
      eventIds: drawnEventIds,
    }, null);

    // Step 5 — playthrough row (created_at default now() is the start marker).
    const playthroughResult = await client.query<{ id: string }>(
      `INSERT INTO public.journey_playthroughs (player_id, stage_id, session_id, drawn_event_ids)
       VALUES ($1, $2, $3, $4::uuid[])
       RETURNING id`,
      [playerId, stageId, gameId, drawnEventIds]
    );
    const playthroughId = playthroughResult.rows[0].id;

    // Step 6 — progress upsert. Attempts increment on every start (replay
    // included); a 'completed' status is never downgraded.
    await client.query(
      `INSERT INTO public.journey_player_progress
         (player_id, stage_id, status, attempts_count, last_played_at)
       VALUES ($1, $2, 'unlocked', 1, now())
       ON CONFLICT (player_id, stage_id) DO UPDATE
       SET attempts_count = journey_player_progress.attempts_count + 1,
           last_played_at = now(),
           status = CASE
             WHEN journey_player_progress.status = 'completed' THEN 'completed'
             ELSE 'unlocked'
           END,
           updated_at = now()`,
      [playerId, stageId]
    );

    await client.query("COMMIT");
    return {
      gameId,
      playthroughId,
      stageId,
      stageNumber: stage.stage_number,
      drawnEventIds,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type CompleteJourneyPlaythroughInput = {
  playerId: string;
  playthroughId: string;
};

export type JourneyBadge = "gold" | "silver" | "bronze" | "completion";

export type CompleteJourneyPlaythroughResult = {
  playthroughId: string;
  stageId: string;
  stageNumber: number;
  accuracyPct: number;
  badgeAwarded: JourneyBadge | null;
  gatePassed: boolean;
  minAccuracyPct: number;
};

// "Better than" ranking for badges (spec §7): Gold > Silver > Bronze >
// Completion > null. Written out explicitly — alphabetical/enum order does
// not match this ranking (bronze < completion alphabetically, for example).
const JOURNEY_BADGE_RANK: Record<JourneyBadge, number> = {
  gold: 4,
  silver: 3,
  bronze: 2,
  completion: 1,
};

function journeyBadgeRank(badge: JourneyBadge | null): number {
  return badge ? JOURNEY_BADGE_RANK[badge] : 0;
}

// Badge thresholds (spec §7, kept from original doc — do not alter). Below
// min_accuracy_pct: no badge, and the stage is not marked completed (spec §6
// — below-threshold attempts are not punitive, just don't unlock the next stage).
function journeyBadgeForAccuracy(
  accuracyPct: number,
  minAccuracyPct: number
): JourneyBadge | null {
  if (accuracyPct >= 100) return "gold";
  if (accuracyPct >= 95) return "silver";
  if (accuracyPct >= 90) return "bronze";
  if (accuracyPct >= minAccuracyPct) return "completion";
  return null;
}

/**
 * Complete a Historian's Journey playthrough for `playerId` on `playthroughId`.
 *
 * Steps (single transaction):
 *   1. Load journey_playthroughs row (FOR UPDATE). Not found → throw. Already
 *      has completed_at → throw (idempotency guard — runs exactly once per
 *      playthrough).
 *   2. Load the linked journey_stages row for min_accuracy_pct/stage_number.
 *   3. Compute overall accuracy the SAME way Practice mode's own results
 *      screen does it (SessionComplete.tsx computePlayerStats: average of
 *      per-round (location_score + time_score) / 2 across round_results) —
 *      scoped to this playthrough's session_id. XP is denormalized straight
 *      from the existing XP engine's ledger (round_results.score, summed —
 *      the same column SessionComplete.tsx sums for its own XP display and
 *      updatePlayerGlobalStats adds into player_global_stats.total_xp), not
 *      recomputed (spec §8: 100% reuse of the existing XP engine).
 *   4. Determine badge per spec §7 thresholds.
 *   5. Update journey_playthroughs with the computed outcome, gated or not.
 *   6. If gated pass: update journey_player_progress — best_accuracy_pct via
 *      GREATEST, best_badge only if strictly better (see journeyBadgeRank),
 *      status='completed', first_completed_at set only if currently NULL. A
 *      below-threshold attempt touches nothing here — no downgrade, no
 *      punitive lockout (spec §6).
 *
 * Throws Error on any guard failure; callers map to HTTP per route convention.
 */
export async function completeJourneyPlaythrough(
  input: CompleteJourneyPlaythroughInput
): Promise<CompleteJourneyPlaythroughResult> {
  const playerId = input.playerId.trim();
  const playthroughId = input.playthroughId.trim();
  if (playerId.length === 0) {
    throw new Error("playerId is required");
  }
  if (playthroughId.length === 0) {
    throw new Error("playthroughId is required");
  }

  const client: DbTransactionClient = await getTransactionClient();
  try {
    await client.query("BEGIN");

    // Step 1 — playthrough must exist, belong to this player, and not
    // already be completed (idempotency: this function runs exactly once
    // per playthrough).
    const playthroughResult = await client.query<{
      id: string;
      stage_id: string;
      session_id: string | null;
      completed_at: Date | null;
    }>(
      `SELECT id, stage_id, session_id, completed_at
       FROM public.journey_playthroughs
       WHERE id = $1 AND player_id = $2
       FOR UPDATE`,
      [playthroughId, playerId]
    );
    if (playthroughResult.rows.length === 0) {
      throw new Error("Journey playthrough not found");
    }
    const playthrough = playthroughResult.rows[0];
    if (playthrough.completed_at !== null) {
      throw new Error("Journey playthrough already completed");
    }
    if (!playthrough.session_id) {
      throw new Error("Journey playthrough has no linked session");
    }

    // Step 2 — linked stage's gate threshold.
    const stageResult = await client.query<{
      id: string;
      stage_number: number;
      min_accuracy_pct: string;
    }>(
      `SELECT id, stage_number, min_accuracy_pct
       FROM public.journey_stages
       WHERE id = $1
       FOR UPDATE`,
      [playthrough.stage_id]
    );
    if (stageResult.rows.length === 0) {
      throw new Error("Journey stage not found");
    }
    const stage = stageResult.rows[0];
    const minAccuracyPct = Number(stage.min_accuracy_pct);

    // Step 3 — overall accuracy + XP, both derived from round_results for
    // this playthrough's session (see function doc above for the exact
    // Practice-mode source each mirrors).
    const scoreResult = await client.query<{
      round_count: number;
      avg_accuracy: string | null;
      total_xp: number;
    }>(
      `SELECT
         COUNT(*)::int AS round_count,
         AVG((location_score + time_score) / 2.0) AS avg_accuracy,
         COALESCE(SUM(score), 0)::int AS total_xp
       FROM round_results
       WHERE game_id = $1`,
      [playthrough.session_id]
    );
    const scoreRow = scoreResult.rows[0];
    if (scoreRow.round_count === 0 || scoreRow.avg_accuracy === null) {
      throw new Error("No round results found for journey playthrough");
    }
    const accuracyPct = Number(scoreRow.avg_accuracy);
    const xpAwarded = scoreRow.total_xp;

    // Step 4 — badge per spec §7 thresholds.
    const badgeAwarded = journeyBadgeForAccuracy(accuracyPct, minAccuracyPct);
    const gatePassed = badgeAwarded !== null;

    // Step 5 — playthrough row records the outcome regardless of gate result.
    await client.query(
      `UPDATE public.journey_playthroughs
       SET accuracy_pct = $2, badge_awarded = $3, xp_awarded = $4, completed_at = now()
       WHERE id = $1`,
      [playthroughId, accuracyPct, badgeAwarded, xpAwarded]
    );

    // Step 6 — progress upsert, gated pass only (spec §6: below-threshold
    // attempts never downgrade an existing 'completed' status or best_*).
    if (gatePassed) {
      const progressResult = await client.query<{
        best_accuracy_pct: string | null;
        best_badge: JourneyBadge | null;
      }>(
        `SELECT best_accuracy_pct, best_badge
         FROM public.journey_player_progress
         WHERE player_id = $1 AND stage_id = $2
         FOR UPDATE`,
        [playerId, playthrough.stage_id]
      );
      if (progressResult.rows.length === 0) {
        throw new Error("Journey progress record not found");
      }
      const progress = progressResult.rows[0];
      const existingBestAccuracy =
        progress.best_accuracy_pct !== null ? Number(progress.best_accuracy_pct) : 0;
      const newBestAccuracy = Math.max(existingBestAccuracy, accuracyPct);
      const newBestBadge =
        journeyBadgeRank(badgeAwarded) > journeyBadgeRank(progress.best_badge)
          ? badgeAwarded
          : progress.best_badge;

      await client.query(
        `UPDATE public.journey_player_progress
         SET best_accuracy_pct = $3,
             best_badge = $4,
             status = 'completed',
             first_completed_at = COALESCE(first_completed_at, now()),
             updated_at = now()
         WHERE player_id = $1 AND stage_id = $2`,
        [playerId, playthrough.stage_id, newBestAccuracy, newBestBadge]
      );
    }

    await client.query("COMMIT");
    return {
      playthroughId,
      stageId: playthrough.stage_id,
      stageNumber: stage.stage_number,
      accuracyPct,
      badgeAwarded,
      gatePassed,
      minAccuracyPct,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
