# DATABASE SCHEMA STATE
**Last updated:** 2026-04-18
**Project:** gzvixlvkwjsrtmtybtkf (GH-NEW, us-east-2)
**Status:** ENFORCED BASELINE

---

## Schema Compliance Declaration

SCHEMA        = SPEC COMPLIANT
DETERMINISM   = VERIFIED
RLS           = ENFORCED
APPEND-ONLY   = GUARANTEED

---

## Canonical Tables (5 required, 5 present)

### 1. sessions
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
| seed | BIGINT | NO | — |

PK: game_id (sole — no surrogate)

---

### 2. session_players
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| game_id | UUID | NO | — |
| player_id | UUID | NO | — |
| joined_at | TIMESTAMP | YES | now() |
| left_at | TIMESTAMP | YES | — |

PK: (game_id, player_id) — composite

---

### 3. round_commits
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
| verification_token | VARCHAR | YES | — |

PK: (game_id, player_id, round_index) — composite
Append-only: duplicate insert → PK violation. No UPDATE policies.

---

### 4. round_results
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
| verification_token | VARCHAR | YES | — |

PK: (game_id, round_index, player_id) — composite

---

### 5. round_events
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | BIGINT | NO | nextval(seq) |
| game_id | UUID | YES | — |
| round_index | INT | YES | — |
| event_type | VARCHAR | YES | — |
| payload | JSONB | YES | — |
| created_at | TIMESTAMP | YES | now() |

PK: id BIGSERIAL — auto-increment surrogate
Append-only: phase transitions inserted, never updated.

---

## Content Tables (4 present)

events, locations, images, hints
These tables hold historical event content served to players.
Schema defined in migration 002 / 019.

---

## RLS Status

All 5 multiplayer tables have RLS enabled.
Policy: SELECT only for authenticated role.
No INSERT/UPDATE/DELETE for authenticated role = implicit deny.
Service role bypasses RLS automatically.

---

## Migration Chain (canonical)

| Version | Name |
|---------|------|
| 20260407064234 | 012_hard_reset_drop_multiplayer_tables |
| 20260407064257 | 013_create_multiplayer_schema_spec_exact |
| 20260407064321 | 014_enable_rls_all_multiplayer_tables |
| 20260407065602 | 015_zero_trust_verification_tokens |
| (post-015) | 016_extend_round_results_replay |

---

## Known Legacy Files (do not use)

src/server/practiceSessions.ts — legacy practice mode.
References non-existent columns (location_guess, result_payload,
host_player_id, display_name) and non-existent tables (round_timing,
session_events). Do not reference or extend this file.

src/app/api/session/* — legacy practice API routes.
All session creation and management now goes through
src/app/api/compete/*.

---

## Server Entry Points (canonical)

| Purpose | File |
|---------|------|
| Session create | src/app/api/compete/create/route.ts |
| Session load | src/app/api/compete/[gameId]/route.ts |
| Start game | src/app/api/compete/[gameId]/start/route.ts |
| Submit guess | src/app/api/compete/[gameId]/guess/route.ts |
| Advance round | src/app/api/compete/[gameId]/advance/route.ts |
| Round results | src/app/api/compete/[gameId]/round/[roundIndex]/results/route.ts |
| WebSocket (PartyKit) | partykit/server.ts |

---

## Client Entry Points (canonical)

| Purpose | File |
|---------|------|
| Session adapter | src/core/sessionApi.ts |
| WebSocket client | src/core/competeWebSocket.ts |
| Compete API client | src/core/competeApi.ts |

---

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| MP-INV-001 | Codebase and DB state investigation | DONE |
| MP-AUDIT-001 | Server implementation compliance audit | DONE |
| MP-SERVER-001 | Fix ROUND_STARTED payload + timer determinism + seed | DONE |
| MP-FIX-001 | Diagnose host_player_id schema mismatch | DONE |
| MP-FIX-002 | Fix host_player_id and missing seed in SELECT queries | DONE |
| MP-FIX-003 | Fix display_name column on session_players | DONE |
| MP-FIX-004 | Fix session_events wrong table name | DONE |
| MP-FIX-005 | Fix bad INSERT into round_events in practiceSessions | DONE |
| MP-FIX-006 | Fix location_guess column (bypassed — legacy file) | DONE |
| MP-FIX-007 | Map session creation call path | DONE |
| MP-FIX-008 | Map createSession and loadSession | DONE |
| MP-FIX-009 | Read sessionApi.ts | DONE |
| MP-FIX-010 | Redirect sessionApi.ts to compete endpoints | DONE |
| MP-FIX-011 | Fix seed overflow for PostgreSQL BIGINT | DONE |
| MP-FIX-012 | Log compete API response shape | DONE |
| MP-FIX-013 | Add compete response adapter in sessionApi.ts | DONE |
| MP-DOC-001 | Update DATABASE_SCHEMA_STATE.md | DONE |
