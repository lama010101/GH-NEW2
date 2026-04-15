-- ============================================================
-- MIGRATION 013: Canonical Schema Creation — Spec-Exact
-- TASK: MP-DB-RESET-ENFORCE-001
-- Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 (tables 1–4)
--            MASTER IMPLEMENTATION PLAN v3.0 Section 0.2 Layer 1 (round_events)
--            MASTER IMPLEMENTATION PLAN v3.0 Section 2 (phase transitions logged)
-- Rules enforced:
--   - DB = Absolute Source of Truth (Section 0.1)
--   - No DB write = no state change (Section 0.2)
--   - Composite PKs enforce idempotency (Section 3.3)
--   - Append-only: no UPDATE paths (Section 5.2, 5.3)
--   - round_events mandatory for deterministic replay (Section 2)
--   - Scores recomputable from DB only (Section 6)
-- ============================================================

-- ============================================================
-- TABLE 1: sessions
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: game_id UUID — sole primary key, no surrogate
-- ============================================================
CREATE TABLE public.sessions (
  game_id          UUID        PRIMARY KEY,
  mode             VARCHAR     NOT NULL,
  round_timer_sec  INT         NOT NULL,
  total_rounds     INT         NOT NULL,
  year_min         INT         NOT NULL,
  year_max         INT         NOT NULL,
  session_deadline TIMESTAMP,
  created_at       TIMESTAMP   DEFAULT now()
);

-- ============================================================
-- TABLE 2: session_players
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: (game_id, player_id) — composite, one record per player per session
-- ============================================================
CREATE TABLE public.session_players (
  game_id   UUID,
  player_id UUID,
  joined_at TIMESTAMP DEFAULT now(),
  left_at   TIMESTAMP,
  PRIMARY KEY (game_id, player_id)
);

-- ============================================================
-- TABLE 3: round_commits
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: (game_id, player_id, round_index) — composite, enforces idempotency
-- Append-only invariant: duplicate insert → PK violation, not silent update
-- ============================================================
CREATE TABLE public.round_commits (
  game_id      UUID,
  player_id    UUID,
  round_index  INT,
  submitted_at TIMESTAMP,
  year_guess   INT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  hints_used   INT,
  score        INT,
  PRIMARY KEY (game_id, player_id, round_index)
);

-- ============================================================
-- TABLE 4: round_results
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: (game_id, round_index, player_id) — composite, NO id column
-- Rule per MASTER PLAN Section 6: scores recomputable from DB only
-- ============================================================
CREATE TABLE public.round_results (
  game_id     UUID,
  round_index INT,
  player_id   UUID,
  score       INT,
  rank        INT,
  PRIMARY KEY (game_id, round_index, player_id)
);

-- ============================================================
-- TABLE 5: round_events
-- Spec: MASTER IMPLEMENTATION PLAN v3.0 Section 0.2 (Layer 1 — Persistent Truth)
--       Section 2: "All transitions are logged in DB (round_events)"
-- PK: id BIGSERIAL — auto-incrementing surrogate for immutable log entries
-- Append-only: log entries are never updated or deleted
-- ============================================================
CREATE TABLE public.round_events (
  id          BIGSERIAL   PRIMARY KEY,
  game_id     UUID,
  round_index INT,
  event_type  VARCHAR,
  payload     JSONB,
  created_at  TIMESTAMP   DEFAULT now()
);
