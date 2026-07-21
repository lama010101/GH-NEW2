# DAILY MODE SPECIFICATION
**Project:** Guess-History
**Document:** DAILY_MODE_SPEC.md
**Version:** 1.0
**Status:** AUTHORITATIVE — pending Product Owner sign-off on Section 15 (Open Decisions)
**Date:** 2026-07-02
**Author:** CTO

---

## 0. AUTHORITY

This document is the single source of truth for the implementation of **Daily mode**. It refines and operationalizes `GAME_MODES_SPEC.md` §3 into an implementable contract. Where this document is more specific than `GAME_MODES_SPEC.md`, this document wins. Where it contradicts it, STOP and report.

Binding references:
- `docs/GAME_MODES_SPEC.md` §1 (universal round structure), §3 (Daily)
- the leaderboard system (see `GAME_MODES_SPEC.md` §3.5 and `DATABASE_SCHEMA_STATE.md` for table definitions)
- `docs/STATS_SYSTEM.md` (single-writer, game-end-only)
- `docs/BADGE_SYSTEM.md` (per-round evaluation, never persisted)
- the progression system (Rank/Title triggers from Daily; see `src/core/rank.ts`)
- `docs/DATABASE_SCHEMA_STATE.md`
- Stats overhaul ruling: `player_global_stats` is **LOCKED** — no new columns. New metrics go to `player_progression_stats`, `player_accuracy_history`, `player_era_stats`.

Architecture rule: Daily is a **solo mode on the direct API stack**. No PartyKit, no WebSocket, no Durable Objects. Server-authoritative scoring identical to all other modes.

---

## 1. PURPOSE

One shared challenge, identical for every player worldwide, refreshing at **00:00 UTC**. One attempt per player per day. Primary daily-active-usage driver, primary Rank/Title progression trigger (with Level Up), and the unlock condition for deferred stats migrations MP-WRITE-STATS-006 / MP-MIG-STATS-005.

---

## 2. PLAYER REQUIREMENTS

- **Authenticated players only.** Guests see the Daily card with a sign-in CTA instead of a Play button.
- Rationale: one-attempt-per-day and the global leaderboard are unenforceable and meaningless for anonymous identities.

---

## 3. CONFIGURATION (FIXED, SERVER-SIDE, NON-CONFIGURABLE)

| Parameter | Value |
|---|---|
| Rounds | 5 |
| Timer | 90 seconds per round, mandatory |
| Year range | Full range (−100 to current year) |
| Events | Same 5 events for all players on a given UTC date |
| Hints | Available, standard tiered penalty (`GAME_MODES_SPEC.md` §1.4) |
| Deduplication | None — the set is fixed globally |
| Attempts | Exactly 1 per player per UTC date |

The client receives these values from the server. No client-side constants for timer or rounds.

---

## 4. DAILY CHALLENGE GENERATION

### 4.1 Determinism problem and resolution

The naive rule `seed = hash(ISO_date)` with on-demand selection is **not sufficient**: the event pool grows over time, so a player at 08:00 UTC and a player at 20:00 UTC could deterministically select *different* events from a *different-sized* pool. The event set must be **pinned once per date**.

### 4.2 `daily_challenges` table (pinning mechanism)

```sql
CREATE TABLE daily_challenges (
  date        DATE PRIMARY KEY,          -- UTC date
  seed        BIGINT NOT NULL,
  event_ids   UUID[] NOT NULL,           -- exactly 5, ordered = round order
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_challenges_five_events CHECK (array_length(event_ids, 1) = 5)
);
```

### 4.3 Lazy generation (no cron required)

Generated on the **first request** for a given date:

```
1. SELECT from daily_challenges WHERE date = today_utc
2. Found → use event_ids as-is
3. Not found →
   a. seed = daily_seed(today_utc)          -- §4.4
   b. Select 5 events via seeded PRNG over the full pool,
      full year range, no dedup
   c. INSERT INTO daily_challenges ... ON CONFLICT (date) DO NOTHING
   d. Re-SELECT the row (handles concurrent first-requesters —
      the winner's set is canonical for everyone)
```

Concurrency rule: after step (c), the implementation MUST re-read and use the stored row, never the locally computed set. Two simultaneous first-requesters must end up with identical event sets.

### 4.4 Seed function (pinned)

```
daily_seed(date) = abs(int64 from first 8 bytes of sha256("YYYY-MM-DD"))
```

The date string is the UTC date in ISO format, no time component. This function must live in `src/core/` as the single exported implementation (standing rule: any constant/logic referenced in 2+ files lives in exactly one exported location).

### 4.5 Date boundary

- The challenge date for an attempt is fixed at **session start** using **server UTC time**. Client clocks are never consulted.
- A session started at 23:58 UTC on day N and finished at 00:05 UTC on day N+1 belongs to **day N** — its leaderboard row is written for day N.

---

## 5. ONE ATTEMPT PER DAY — ATTEMPT LIFECYCLE

### 5.1 `daily_attempts` table

Enforces one attempt including **in-progress** attempts (the `leaderboard_daily` PK only protects completed attempts).

```sql
CREATE TABLE daily_attempts (
  date         DATE NOT NULL,
  player_id    UUID NOT NULL,
  game_id      UUID NOT NULL,             -- FK → sessions.game_id
  status       VARCHAR NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress', 'completed', 'expired')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (date, player_id)
);
```

### 5.2 State machine

```
(no row)      → player starts today's challenge → in_progress
in_progress   → round 5 result confirmed        → completed
in_progress   → player opens Daily on a LATER date → expired (lazy finalization, §5.4)
completed     → terminal. All visits show read-only result view.
expired       → terminal. Counts as that date's attempt.
```

### 5.3 Resume (same date)

An `in_progress` attempt for **today** resumes at the first unsubmitted round. No fresh attempt, no re-roll of events. Resume state is server-derived from `round_commits` for that `game_id` — localStorage may cache UI state but is never the authority on which round is current.

### 5.4 Lazy finalization of stale attempts (CTO ruling)

When a player opens Daily and holds an `in_progress` attempt for a **past** date:

1. All unsubmitted rounds of that attempt score **0** (year 0, location 0).
2. `round_results` rows written for the unplayed rounds with zero scores.
3. Game-end write sequence (§8) runs for that attempt **for its original date** — leaderboard row, all-time update, stats, streak evaluation.
4. `daily_attempts.status = 'expired'`.
5. Today's challenge then becomes available normally.

Rationale: mirrors the Relax deadline rule ("unsubmitted rounds score zero"), keeps the leaderboard honest, and prevents a stale session from blocking Daily forever. Streak is preserved for the stale date per §9 ("starting and failing preserves the streak").

---

## 6. SESSION INITIALIZATION

```
1. Player taps "Play Today's Challenge"
2. Server (single endpoint, authenticated):
   a. Finalize any stale attempt (§5.4)
   b. Look up daily_attempts for (today_utc, player)
      - completed/expired → return result-view payload (read-only)
      - in_progress       → return resume payload (current round index)
      - none              → continue
   c. Load or generate daily_challenges row (§4.3)
   d. Preflight: Supabase REST + image delivery reachable. Block on failure.
   e. Create sessions row: mode='daily', seed=daily seed,
      round_timer_sec=90, total_rounds=5, year_min=-100,
      year_max=current year
   f. Insert daily_attempts (today, player, game_id, 'in_progress')
      — steps e+f in ONE transaction. PK violation on f → concurrent
      double-start; roll back and return the existing attempt.
3. Client preloads round 1 image, navigates to
   /daily/game/{gameId}/round/1
```

---

## 7. GAMEPLAY

Uses the universal round loop of `GAME_MODES_SPEC.md` §1 with zero modifications: IMAGE_PHASE → GUESS_PHASE → RESULT_PHASE, standard result screen (§1.2), standard scoring (§1.3), standard hints (§1.4), standard badges per round (§1.5), manual "Next Round" advance only.

Daily-specific deltas:

| Concern | Rule |
|---|---|
| Timer | 90s, starts at GUESS_PHASE entry, server-authoritative `phaseEndsAt` returned with round payload. Expiry → auto-submit whatever is placed; unplaced inputs score zero. |
| Round writes | Guess submission → server scores → `round_commits` + `round_results` written per round (append-only, composite PK idempotency). Correct answer returned only in the submission response, never before. |
| History Collection | Written at **round end** (not game end), per `GAME_MODES_SPEC.md` §4.8. |
| Refresh mid-round | Server re-issues current round with remaining time computed from the stored `phaseEndsAt`. A refresh never resets the 90s timer. |
| Implementation reuse | Reuse the existing Practice solo engine/routes wherever they exist. Any place where Practice's implementation contradicts this spec must be reported, not silently adopted. |

Timer persistence rule: `phaseEndsAt` for the active round must be persisted server-side (in `round_events` payload, consistent with the Compete pattern) at round start, so refresh/resume cannot grant extra time.

---

## 8. GAME END — WRITE SEQUENCE (SINGLE TRANSACTION)

Runs exactly once, when round 5's result is confirmed (or on lazy finalization §5.4). Single writer: Control/sessionCore layer. All-or-nothing.

```
BEGIN
  1. leaderboard_daily INSERT (date, player_id, avg_accuracy, total_xp)
     ON CONFLICT DO NOTHING                    -- leaderboard system: duplicate-day no-op
  2. IF rows_inserted = 1:
     leaderboard_daily_alltime UPSERT
       (running avg_accuracy, total_xp += session xp, games_played += 1)
  3. player_global_stats UPSERT (running avg, total_xp, rounds_played)
     -- existing columns only; table is LOCKED
  4. player_progression_stats UPSERT:
       - daily_streak evaluation (§9)
       - play_streak evaluation (any non-Practice game this UTC day)
  5. player_accuracy_history INSERT (per stats-overhaul contract)
  6. player_era_stats UPSERT (per stats-overhaul contract)
  7. Badge aggregates → stats (evaluated per round, aggregated here,
     never persisted standalone)
  8. daily_attempts.status = 'completed', completed_at = now()
COMMIT
Then (outside transaction): Rank/Title re-evaluation per the progression system — rank reads
leaderboard_levelup.total_xp + leaderboard_daily_alltime.total_xp.
```

Notes:
- Steps 1–2 atomicity and the duplicate-day no-op cascade are handled by the leaderboard system. Do not reimplement differently.
- The exact column contracts for steps 4–6 are owned by the stats-overhaul plan (MP-PLAN-STATS-OVERHAUL-001). If those tables do not yet exist when Daily ships, steps 4–6 are implemented against that plan's approved schema in the same task chain — Daily MUST NOT invent parallel columns.
- Shipping Daily unlocks the deferred migrations MP-WRITE-STATS-006 and MP-MIG-STATS-005 (Compete removal from `player_global_stats`). Those remain **separate tasks** — not part of the Daily implementation.

---

## 9. DAILY STREAK (PINNED DEFINITION)

- `daily_streak_current` increments when the player **starts** (not necessarily finishes) the challenge on a UTC date, and the previous UTC date also counted.
- "Starting and failing preserves the streak" — an `in_progress` or `expired` attempt counts for its date.
- The streak breaks only if a UTC date passes with **no attempt row at all** for that player.
- `daily_streak_best` = max ever reached.
- Storage: `player_progression_stats`. Never in `player_global_stats`.
- Distinct from Play Streak (any non-Practice game per UTC day) — both live in `player_progression_stats`, both evaluated in §8 step 4.

Implementation note: because streak increments on *start* but stats writes happen at game end, the attempt-row insert (§6 step 2f) is the streak-qualifying event; the streak *counter update* still happens in the §8 transaction (or §5.4 finalization) to respect the single-writer/game-end rule. The evaluation reads `daily_attempts` dates, so late finalization computes the correct value.

---

## 10. FINAL SCREEN

Standard Practice final screen (`GAME_MODES_SPEC.md` §2.5) plus, in order:

**1. Global comparison panel**
- Player's rank today: "142nd of 1,847 players" — rank = 1 + count of rows with better (avg_accuracy, total_xp) for today's date in `leaderboard_daily`.
- Global average accuracy today: AVG(avg_accuracy) over today's rows.
- Score distribution histogram: 10 buckets of 10% accuracy width, computed at read time from `leaderboard_daily` for today (indexed query; acceptable at current scale — revisit if today-rows exceed ~100k).

**2. Streak indicator** — `daily_streak_current` with flame/counter treatment.

**3. Spoiler-free share card**
- Wordle-style: 5 rows (rounds) × colored blocks for accuracy tiers, date, total accuracy %, streak.
- MUST NOT contain: event names, years, locations, images, or anything identifying the events.
- Generated client-side. One-tap native share / clipboard fallback.
- Accuracy tier → color mapping must reflect progression consistently with the RainbowRing rule (red low → green high by value); exact block palette is a UIX-track decision.

Panel data comes from one read endpoint (§12) — the client performs no ranking computation.

---

## 11. RESULT VIEW (READ-ONLY REVISIT)

Any visit to Daily after `completed`/`expired` for today shows the final screen in read-only mode, rebuilt from `round_results` + `leaderboard_daily`. Rank is re-queried live (it changes as more players finish during the day). "Play" CTA replaced by countdown to next challenge (time until 00:00 UTC).

---

## 12. API SURFACE (CONTRACT)

All under the direct API stack, authenticated, server-side scoring. Exact route naming may follow existing codebase conventions; the contracts are binding.

| Endpoint | Purpose |
|---|---|
| `GET /api/daily/status` | Today's state for this player: `not_started` \| `in_progress` (+ resume info) \| `completed`/`expired` (+ result payload). Triggers lazy finalization §5.4. |
| `POST /api/daily/start` | Runs §6. Returns gameId + round 1 payload + `phaseEndsAt`. Idempotent: returns existing attempt on double-call. |
| `POST /api/daily/{gameId}/guess` | Round submission → server scores → writes commits/results → returns result payload (correct answer revealed here only). Idempotent via composite PK. |
| `POST /api/daily/{gameId}/advance` | Confirms result viewed, issues next round payload + fresh `phaseEndsAt`; on round 5 triggers §8 and returns final-screen payload. |
| `GET /api/daily/leaderboard?view=today\|alltime&date=` | Top 50 + requesting player's own rank. |

Security: every gameId-scoped route verifies the authenticated uid owns the attempt (BOLA check — same class as the Compete GET-route fixes). Standing rule 3 applies: task must include an explicit unauthenticated-curl check.

---

## 13. ROUTES (CLIENT)

```
/daily                          entry — status-driven (play / resume / result)
/daily/game/{gameId}/round/{n}  round play
/daily/game/{gameId}/results    final screen (also the read-only revisit view)
/leaderboard → Daily tab
```

Home page Daily card states: **Play** (not started) / **Resume** (in progress) / **Done ✓ + countdown** (completed/expired).

---

## 14. NEW MIGRATIONS

Timestamped migrations (current repo convention), applied with the direct-pg fallback and live `information_schema` verification per standing migration rules:

1. `create_daily_challenges` — §4.2 + RLS
2. `create_daily_attempts` — §5.1 + RLS
3. `create_leaderboard_daily` + index (if not already applied)
4. `create_leaderboard_daily_alltime` + index (if not already applied)

RLS on all four: SELECT for `authenticated`; no INSERT/UPDATE/DELETE for authenticated (service role writes only). `daily_challenges.event_ids` is safe to expose via SELECT only **after** verifying event IDs alone leak no answers to the client (event rows containing `correct_year`/geo data must not be readable pre-reveal) — if they do, restrict `daily_challenges` SELECT to service role and never ship event IDs to the client before their round.

---

## 15. OPEN DECISIONS — PRODUCT OWNER SIGN-OFF REQUIRED

| # | Decision | CTO ruling (default if unchallenged) |
|---|---|---|
| D1 | Guests | Blocked from Daily; sign-in CTA (§2) |
| D2 | Stale attempts | Lazy finalization with zero-score fill, counts for original date (§5.4) |
| D3 | Streak on partial attempts | Preserved — starting counts (§9, per existing spec language) |
| D4 | Histogram | Read-time computation, no aggregate table for v1 (§10) |
| D5 | Cross-midnight session | Belongs to start date (§4.5) |

---

## 16. OUT OF SCOPE (v1)

- Push notification "today's challenge is live" reminders
- Friends-only daily comparison
- Weekly/monthly views (deferred)
- Yesterday's-answers review browsing of past challenges
- Cron-based pre-generation (lazy generation suffices; a cron can be added later without contract change)

---

## 17. VALIDATION CHECKLIST

Daily mode is valid ONLY IF:

- [ ] Two players starting at different times on the same UTC date get identical events in identical order
- [ ] Concurrent first-requesters at 00:00 UTC converge on one canonical event set
- [ ] Second `POST /start` on the same date returns the existing attempt — never a new session
- [ ] Refresh mid-round never resets or extends the 90s timer
- [ ] Duplicate guess submission leaves exactly 1 `round_commits` row
- [ ] Correct answers are absent from every payload prior to that round's submission response (verified by inspecting network payloads, not code reading)
- [ ] `leaderboard_daily` + `leaderboard_daily_alltime` written atomically; duplicate-day insert no-ops both
- [ ] `player_global_stats` receives no new columns
- [ ] Streak survives a started-but-unfinished day; breaks on a no-attempt day
- [ ] Stale attempt auto-finalizes with zeros for its original date and unblocks today
- [ ] Share card output contains no event-identifying information
- [ ] Unauthenticated curl to every gameId-scoped route returns 401/403
- [ ] Rank/Title re-evaluation fires at Daily game end per the progression system
- [ ] No PartyKit/WebSocket code paths touched

---

*Spec version 1.0 — Guess-History Daily Mode — authored 2026-07-02*
