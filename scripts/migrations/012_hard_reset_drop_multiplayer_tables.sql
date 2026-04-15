-- ============================================================
-- MIGRATION 012: Hard Reset — Drop Multiplayer Tables
-- TASK: MP-DB-RESET-ENFORCE-001
-- Authority: FULL_CORE_GAME_MASTER_SPEC.md + MASTER IMPLEMENTATION PLAN v3.0
-- Purpose: Atomically drop all legacy multiplayer tables (CASCADE removes
--          all dependent constraints, indexes, policies, foreign keys).
--          Scope: ONLY the 5 specified tables. No other tables touched.
-- ============================================================

DROP TABLE IF EXISTS public.round_results   CASCADE;
DROP TABLE IF EXISTS public.round_commits   CASCADE;
DROP TABLE IF EXISTS public.round_events    CASCADE;
DROP TABLE IF EXISTS public.session_players CASCADE;
DROP TABLE IF EXISTS public.sessions        CASCADE;
