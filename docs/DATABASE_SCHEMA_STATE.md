# DATABASE SCHEMA STATE
**Task:** MP-FIX-DOCS-001  
**Status:** UPDATED — PK VERIFIED, MIGRATION CHAIN DOCUMENTED  
**Date:** 2026-05-18  
**Project:** gzvixlvkwjsrtmtybtkf (GH-NEW2, us-east-2)  
**Audit:** MP-INV-SCHEMA-PK-001 — PK verified via pg_indexes

---

## Canonical Tables (5 required, 5 present)

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

---

## RLS Status

| Table | relrowsecurity |
|-------|---------------|
| sessions | TRUE |
| session_players | TRUE |
| round_commits | TRUE |
| round_results | TRUE |
| round_events | TRUE |

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
| 026 | 026_add_acc_penalty_to_round_commits.sql |
| 027 | 027_add_event_validation_trigger.sql |
| 028 | 028_create_player_global_stats.sql |
| 029 | 029_add_room_code_to_sessions.sql |
| 030 | 030_add_results_auto_advance_to_sessions.sql |
| 031 | 031_migrate_profiles_avatar_url_to_firebase.sql |
| 032 | 032_drop_duplicate_room_code_index.sql |
| 20260507100300 | 20260507100300_update_handle_new_user_random_avatar.sql |
| 20260507100600 | 20260507100600_add_avatar_url_to_session_players.sql |
| 20260507112132 | 20260507112132_backfill_existing_profiles_random_avatar.sql |

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
- RLS policies: GUESS_HISTORY_MASTER_SPEC.md Section 19
- Append-only enforcement: GUESS_HISTORY_MASTER_SPEC.md Sections 15.2, 15.3
- Score recomputability: GUESS_HISTORY_MASTER_SPEC.md Section 12
