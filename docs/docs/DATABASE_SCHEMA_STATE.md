# DATABASE SCHEMA STATE
**Task:** MP-DB-RESET-ENFORCE-001
**Status:** ENFORCED BASELINE
**Date:** 2026-04-07
**Project:** gzvixlvkwjsrtmtybtkf (GH-NEW, us-east-2)

---

## Schema Compliance Declaration

```
SCHEMA        = SPEC COMPLIANT
DETERMINISM   = VERIFIED
RLS           = ENFORCED
APPEND-ONLY   = GUARANTEED
```

---

## Canonical Tables (5 required, 5 present)

### 1. `sessions`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| mode | VARCHAR | NO | — |
| round_timer_sec | INT | NO | — |
| total_rounds | INT | NO | — |
| year_min | INT | NO | — |
| year_max | INT | NO | — |
| session_deadline | TIMESTAMP | YES | — |
| created_at | TIMESTAMP | YES | now() |

**PK:** `game_id` (sole — no surrogate)

---

### 2. `session_players`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| player_id | UUID | NO | — |
| joined_at | TIMESTAMP | YES | now() |
| left_at | TIMESTAMP | YES | — |

**PK:** `(game_id, player_id)` — composite

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

**PK:** `(game_id, player_id, round_index)` — composite  
**Append-only:** Duplicate insert → PK violation. No UPDATE policies exist.

---

### 4. `round_results`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| round_index | INT | NO | — |
| player_id | UUID | NO | — |
| score | INT | YES | — |
| rank | INT | YES | — |

**PK:** `(game_id, round_index, player_id)` — composite  
**No `id` column.** Scores recomputable from DB only (MASTER PLAN Section 6).

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
| 20260407064234 | 012_hard_reset_drop_multiplayer_tables |
| 20260407064257 | 013_create_multiplayer_schema_spec_exact |
| 20260407064321 | 014_enable_rls_all_multiplayer_tables |
| 20260407065602 | 015_fix_round_events_bigserial_pk |

---

## Determinism Guarantee

- Fresh DB rebuild: run migrations 012 → 013 → 014 → 015 in order → identical schema
- No dependency on prior DB state (all drops use `IF EXISTS`)
- No randomness in schema construction
- Composite PKs guarantee idempotent append-only writes

---

## Authority References

- `sessions`, `session_players`, `round_commits`, `round_results`: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
- `round_events`: MASTER IMPLEMENTATION PLAN v3.0 Section 0.2 (Layer 1) + Section 2
- RLS policies: FULL_CORE_GAME_MASTER_SPEC.md Section 8
- Append-only enforcement: MASTER IMPLEMENTATION PLAN v3.0 Sections 5.2, 5.3
- Score recomputability: MASTER IMPLEMENTATION PLAN v3.0 Section 6
