-- Migration: 017_add_seed_to_sessions.sql
-- Purpose: Add seed column to sessions table for determinism guarantee
-- Reference: GUESS_HISTORY_MASTER_SPEC.md Section 7
-- Date: 2026-04-15

ALTER TABLE public.sessions
  ADD COLUMN seed BIGINT NOT NULL DEFAULT 0;
