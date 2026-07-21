# DATABASE SCHEMA STATE
**Task:** MP-FIX-DOCS-001  
**Status:** UPDATED — PK VERIFIED, MIGRATION CHAIN DOCUMENTED, `player_round_events` ADDED  
**Date:** 2026-07-21  
**Project:** gzvixlvkwjsrtmtybtkf (GH-NEW, us-east-2)  
**Audit:** MP-INV-SCHEMA-PK-001 — PK verified via pg_indexes

---

## Canonical Tables (6 required, 6 present)

### 1. `sessions` 

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| id | UUID | NO | — |
| mode | VARCHAR | NO | — |
| user_id | UUID | NO | — |
| round_timer_sec | INT | NO | — |
| total_rounds | INT | NO | — |
| year_min | INT | NO | — |
| year_max | INT | NO | — |
| factor_id | UUID | YES | — |
| seed | BIGINT | NO | 0 |
| session_deadline | TIMESTAMP | YES | — |
| room_code | VARCHAR | NO | — |
| results_auto_advance_sec | INT | NO | 10 |
| created_at | TIMESTAMPTZ | YES | now() |
| updated_at | TIMESTAMPTZ | YES | — |

**PK:** `game_id` — VERIFIED via pg_indexes (MP-INV-SCHEMA-PK-001)
**Note:** `id` column is NOT part of the PK and has no index. All code joins on `game_id`. The `id` column is a legacy artifact — do not use it as a join key.
**Note:** `seed` NOT NULL with default 0 enforces determinism guarantee.
**Note:** `room_code` has a single unique constraint: `sessions_room_code_key`. Duplicate index `idx_sessions_room_code` was dropped in migration 032.
**Note:** `results_auto_advance_sec` added in migration 030. Default 10 seconds.

---

### 2. `session_players` 

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| player_id | UUID | NO | — |
| joined_at | TIMESTAMP | YES | now() |
| left_at | TIMESTAMP | YES | — |
| display_name | VARCHAR | NO | — |
| ready | BOOLEAN | NO | — |
| is_host | BOOLEAN | NO | — |
| avatar_url | TEXT | YES | — |

**PK:** `(game_id, player_id)` — composite
**Note:** `is_host` enforces single-host-per-session via partial unique index (one `is_host=true` per `game_id`).
**Note:** `left_at` is the graceful leave mechanism. NULL = active. SET = departed.
**Note:** `avatar_url` is written at join time from `COALESCE(avatars.firebase_url, profiles.avatar_url)` via join on `avatars.image_url = profiles.avatar_url`. Always a Firebase URL for new joins as of migration 031.
**Note:** `ready` defaults to FALSE on insert.

---

### 3. `round_commits` 

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| player_id | UUID | NO | — |
| round_index | INT | NO | — |
| submitted_at | TIMESTAMP | YES | — |
| year_guess | INT | YES | — |
| location_lat | DOUBLE PRECISION | YES | — |
| location_lng | DOUBLE PRECISION | YES | — |
| hints_used | INT | YES | — |
| score | INT | YES | — |
| verification_token | UUID | NO | — |
| acc_penalty | INT | NO | — |

**PK:** `(game_id, player_id, round_index)` — composite
**Append-only:** Duplicate insert → PK violation. No UPDATE policies exist.
**Note:** `verification_token` links commit to the event log for replay integrity.
**Note:** `acc_penalty` is the accuracy penalty from hints used. NOT NULL — must be 0 if no hints taken.

---

### 4. `round_results` 

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| round_index | INT | NO | — |
| player_id | UUID | NO | — |
| score | INT | YES | — |
| rank | INT | YES | — |
| distance_km | DOUBLE PRECISION | YES | — |
| year_diff | INT | YES | — |
| location_score | INT | YES | — |
| time_score | INT | YES | — |
| verification_token | UUID | NO | — |

**PK:** `(game_id, round_index, player_id)` — composite
**Append-only:** Scores recomputable from DB only.
**Note:** `location_score` + `time_score` = components of `score`. Stored separately for result screen display.
**Note:** `verification_token` must match the corresponding `round_commits.verification_token`.

---

### 5. `round_events` 

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | BIGINT | NO | nextval(seq) |
| game_id | UUID | YES | — |
| round_index | INT | YES | — |
| event_type | VARCHAR | YES | — |
| payload | JSONB | YES | — |
| created_at | TIMESTAMP | YES | now() |
| verification_token | UUID | NO | — |

**PK:** `id BIGSERIAL` — auto-increment surrogate for immutable log entries
**Append-only:** Phase transitions are inserted, never updated.

### 6. `player_round_events`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | BIGSERIAL | NO | nextval(seq) |
| game_id | UUID | NO | — |
| player_id | UUID | NO | — |
| round_index | INT | NO | — |
| event_type | VARCHAR | NO | — |
| payload | JSONB | YES | — |
| occurred_at | TIMESTAMP | NO | now() |
| verification_token | UUID | NO | gen_random_uuid() |

**PK:** `id` BIGSERIAL — surrogate for immutable per-player round log entries.  
**Append-only:** Events are inserted, never updated.  
**Scope:** Per-player round progress for async (Relax) Compete Option A. Sync (Rush) continues to use `round_events` exclusively.  
**Uniqueness:** One `ROUND_STARTED`, one `ROUND_COMPLETE` per `(game_id, player_id, round_index)`; one `PLAYER_SESSION_COMPLETE` per `(game_id, player_id)`.  

---

## RLS Status

| Table | relrowsecurity |
|-------|---------------|
| sessions | TRUE |
| session_players | TRUE |
| round_commits | TRUE |
| round_results | TRUE |
| round_events | TRUE |
| player_round_events | TRUE |

**Policy type on all tables:** SELECT only for `authenticated` role.
**No INSERT/UPDATE/DELETE** policies for authenticated role = implicit deny.
**Service role** bypasses RLS automatically.

---

## Migration Chain

| Version | Name |
|---------|------|
| (012–023) | NOT PRESENT IN REPO — applied directly to DB, migrations lost |
| 024 | 024_add_translation_tables.sql |
| 025 | 025_create_profiles.sql |
| 025 | 025_round_hints_unique_constraint.sql |
| 026 | 026_add_acc_penalty_to_round_commits.sql |
| 027 | 027_add_event_validation_trigger.sql |
| 027 | 027_add_per_axis_acc_penalty.sql |
| 028 | 028_create_player_global_stats.sql |
| 028 | 028_create_round_hints.sql |
| 029 | 029_add_room_code_to_sessions.sql |
| 030 | 030_add_results_auto_advance_to_sessions.sql |
| 031 | 031_migrate_profiles_avatar_url_to_firebase.sql |
| 032 | 032_drop_duplicate_room_code_index.sql |
| 033 | 033_create_leaderboard_daily.sql |
| 034 | 034_create_leaderboard_daily_alltime.sql |
| 035 | 035_create_leaderboard_levelup.sql |
| 036 | 036_add_games_played_to_player_global_stats.sql |
| 037 | 037_create_player_follows.sql |
| 038 | 038_pressure_applied_trigger_and_index.sql |
| 039 | 039_scoring_reference_year_and_penalty_rates.sql |
| 20260507100300 | 20260507100300_update_handle_new_user_random_avatar.sql |
| 20260507100600 | 20260507100600_add_avatar_url_to_session_players.sql |
| 20260507112132 | 20260507112132_backfill_existing_profiles_random_avatar.sql |
| 20260528120000 | 20260528120000_create_invite_and_notifications_schema.sql |
| 20260601000000 | 20260601000000_handle_new_user_add_discriminator.sql |
| 20260625000000 | 20260625000000_create_player_event_ratings.sql |
| 20260625000001 | 20260625000001_add_locale_to_profiles.sql |
| 20260625000002 | 20260625000002_create_player_event_ratings_corrected.sql |
| 20260626000000 | 20260626000000_create_waitlist.sql |
| 20260628000000 | 20260628000000_add_session_deadline_days.sql |
| 20260630000000 | 20260630000000_add_selected_regions_to_sessions.sql |
| 20260702000000 | 20260702000000_restrict_rls_to_participants.sql |
| 20260703000000 | 20260703000000_add_absent_to_round_commits.sql |
| 20260703120000 | 20260703120000_create_daily_challenges.sql |
| 20260703120100 | 20260703120100_create_daily_attempts.sql |
| 20260707000000 | 20260707000000_handle_new_user_award_signup_xp.sql |
| 20260715000000 | 20260715000000_add_kicked_to_session_players.sql |
| 20260721034400 | 20260721034400_add_welcome_completed_to_profiles.sql |
| 20260721054200 | 20260721054200_create_player_round_events.sql |

---

## Indexes on `public.sessions` 

| Index | Definition |
|-------|-----------|
| sessions_pkey | UNIQUE on (game_id) — PRIMARY KEY |
| sessions_room_code_key | UNIQUE on (room_code) |

---

## Open Items

| Item | Impact |
|------|--------|
| Migrations 012–023 not present in repo | Fresh DB rebuild from migrations will NOT reproduce live schema. Determinism guarantee broken for new environments. |
| `sessions.id` column purpose unknown | Believed legacy artifact. Not indexed, not used in any query. Safe to ignore but not safe to drop without full audit. |

---

## Authority References

- `sessions`, `session_players`, `round_commits`, `round_results`: GUESS_HISTORY_MASTER_SPEC.md Section 7
- `round_events`: GUESS_HISTORY_MASTER_SPEC.md Section 7
- `player_round_events`: `core/EVENT_STREAM_SPEC.md`
- RLS policies: GUESS_HISTORY_MASTER_SPEC.md Section 19
- Append-only enforcement: GUESS_HISTORY_MASTER_SPEC.md Sections 15.2, 15.3
- Score recomputability: GUESS_HISTORY_MASTER_SPEC.md Section 12
