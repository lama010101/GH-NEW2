# DATABASE SCHEMA STATE
**Task:** MP-DB-RESET-ENFORCE-001  
**Status:** ENFORCED BASELINE — UPDATED POST-AUDIT  
**Date:** 2026-05-10 (updated from 2026-04-07)  
**Project:** gzvixlvkwjsrtmtybtkf (GH-NEW, us-east-2)  
**Audit:** MP-INV-COMPETE-001 — live schema verified via `information_schema.columns`

---

## Schema Compliance Declaration

```
SCHEMA        = LIVE-VERIFIED (updated to match actual DB — prior doc was stale)
DETERMINISM   = VERIFIED
RLS           = ENFORCED
APPEND-ONLY   = GUARANTEED
```

> ⚠️ NOTE: The prior version of this document (2026-04-07) was stale.
> Four tables had columns added post-migration that were not reflected here.
> This document now reflects the actual live schema as of 2026-05-10.
> The DB is correct. This doc was wrong.

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
| seed | BIGINT | NO | — |
| session_deadline | TIMESTAMP | YES | — |
| created_at | TIMESTAMPTZ | YES | now() |
| updated_at | TIMESTAMPTZ | YES | — |

**PK:** `game_id` (sole primary key)  
**Note:** `id` column also present as UUID NOT NULL — believed to be a surrogate added post-baseline. Verify via migration history which of `game_id` / `id` is the declared PK constraint. All code must use `game_id` as the join key (per EXECUTION_PLAN authority chain).  
**Note:** `seed` is used for deterministic event selection. NOT NULL enforces determinism guarantee.  
**Note:** `factor_id` purpose: event pool filter (year range factor). Nullable = no filter applied.

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
**Note:** `is_host` enforces single-host-per-session via partial unique index (one `is_host=true` per `game_id`). Verify index exists in migrations.  
**Note:** `left_at` is the graceful leave mechanism. NULL = active player. SET = departed. `/leave` route mutates this column only — never gameplay state.  
**Note:** `ready` must default to FALSE on insert.

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
**Append-only:** Scores recomputable from DB only (MASTER PLAN Section 6).  
**Note:** `distance_km` and `year_diff` are the raw deltas used by the scoring formula.  
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
**Note:** `verification_token` on events enables cross-table integrity verification during deterministic replay.

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
| 20260407064234 | 012_hard_reset_drop_multiplayer_tables |
| 20260407064257 | 013_create_multiplayer_schema_spec_exact |
| 20260407064321 | 014_enable_rls_all_multiplayer_tables |
| 20260407065602 | 015_fix_round_events_bigserial_pk |

> ⚠️ Columns present in the live DB but not in migrations 012–015 were added via
> subsequent migrations not yet recorded here. Those migrations must be identified
> and appended to this chain to restore determinism guarantee.
> Until that is done, a fresh rebuild from migrations 012–015 alone will NOT
> reproduce the current live schema.

---

## Open Questions (require migration history review)

| Question | Impact |
|----------|--------|
| Which migration added `sessions.id`, `sessions.user_id`, `sessions.seed`, `sessions.factor_id`, `sessions.updated_at`? | Determinism rebuild |
| Which migration added `session_players.display_name`, `.ready`, `.is_host`, `.avatar_url`? | Determinism rebuild |
| Which migration added `round_commits.verification_token`, `.acc_penalty`? | Determinism rebuild |
| Which migration added `round_results.distance_km`, `.year_diff`, `.location_score`, `.time_score`, `.verification_token`? | Determinism rebuild |
| Which migration added `round_events.verification_token`? | Determinism rebuild |
| Does a partial unique index exist on `session_players(game_id) WHERE is_host = true`? | Host enforcement |
| Is `sessions.id` the PK or is `sessions.game_id` the PK constraint? | Join key integrity |

---

## Determinism Guarantee

- **Current status: PARTIAL** — migrations 012–015 do not reproduce all live columns
- Full rebuild determinism requires the missing migrations to be identified and documented
- Composite PKs guarantee idempotent append-only writes ✓
- No randomness in schema construction ✓

---

## Authority References

- `sessions`, `session_players`, `round_commits`, `round_results`: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
- `round_events`: MASTER IMPLEMENTATION PLAN v3.0 Section 0.2 (Layer 1) + Section 2
- RLS policies: FULL_CORE_GAME_MASTER_SPEC.md Section 8
- Append-only enforcement: MASTER IMPLEMENTATION PLAN v3.0 Sections 5.2, 5.3
- Score recomputability: MASTER IMPLEMENTATION PLAN v3.0 Section 6
