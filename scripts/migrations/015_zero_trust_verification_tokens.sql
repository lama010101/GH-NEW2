-- ============================================================
-- MIGRATION 015: Zero-Trust Verification Token Schema
-- TASK: MP-ZERO-TRUST-001
-- Authority: ZERO-TRUST ENFORCEMENT PROMPT v2
--
-- Adds verification_token columns to enable:
--   1. Row-level identity verification
--   2. Cross-connection write validation
--   3. Forensic audit trail
--   4. Deterministic replay validation
-- ============================================================

-- ============================================================
-- TABLE 1: round_commits — Add verification_token
-- Every commit MUST have a unique verification token
-- ============================================================
ALTER TABLE public.round_commits
ADD COLUMN verification_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Create index for fast token lookups during verification
CREATE INDEX idx_round_commits_verification_token
ON public.round_commits(verification_token);

-- ============================================================
-- TABLE 2: round_results — Add verification_token
-- Every computed result MUST have a unique verification token
-- ============================================================
ALTER TABLE public.round_results
ADD COLUMN verification_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Create index for fast token lookups during verification
CREATE INDEX idx_round_results_verification_token
ON public.round_results(verification_token);

-- ============================================================
-- TABLE 3: round_events — Add verification_token for consistency
-- Every event log entry MUST have a unique verification token
-- ============================================================
ALTER TABLE public.round_events
ADD COLUMN verification_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Create index for fast token lookups during verification
CREATE INDEX idx_round_events_verification_token
ON public.round_events(verification_token);

-- ============================================================
-- INDEXES: Composite indexes for verification queries
-- These optimize the cross-connection verification queries
-- ============================================================

-- For round_commits verification by game_id + player_id + round_index
CREATE INDEX idx_round_commits_verify_pk
ON public.round_commits(game_id, player_id, round_index);

-- For round_results verification by game_id + round_index + player_id
CREATE INDEX idx_round_results_verify_pk
ON public.round_results(game_id, round_index, player_id);

-- For round_events verification by game_id + round_index
CREATE INDEX idx_round_events_verify_game_round
ON public.round_events(game_id, round_index);

-- ============================================================
-- UNIQUENESS CONSTRAINT: Enforce verification_token uniqueness
-- This prevents token collisions and ensures forensic integrity
-- ============================================================
ALTER TABLE public.round_commits
ADD CONSTRAINT uq_round_commits_verification_token
UNIQUE (verification_token);

ALTER TABLE public.round_results
ADD CONSTRAINT uq_round_results_verification_token
UNIQUE (verification_token);

ALTER TABLE public.round_events
ADD CONSTRAINT uq_round_events_verification_token
UNIQUE (verification_token);

-- ============================================================
-- COMMENTS: Document the zero-trust enforcement columns
-- ============================================================
COMMENT ON COLUMN public.round_commits.verification_token IS
'Cryptographically secure UUID for cross-connection write verification. Generated per-row, used for forensic audit trail.';

COMMENT ON COLUMN public.round_results.verification_token IS
'Cryptographically secure UUID for cross-connection write verification. Links computed results to verification logs.';

COMMENT ON COLUMN public.round_events.verification_token IS
'Cryptographically secure UUID for cross-connection write verification. Ensures event log immutability.';
