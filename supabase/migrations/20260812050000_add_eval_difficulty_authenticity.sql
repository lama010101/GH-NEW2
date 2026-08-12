-- Migration: add difficulty and authenticity scoring to eval_facts
-- Task: AIP-BUILD-VISIONMODELS-DIFFICULTYAUTH-001

ALTER TABLE public.eval_facts
  ADD COLUMN difficulty_score INTEGER NULL CHECK (difficulty_score IS NULL OR (difficulty_score >= 1 AND difficulty_score <= 10)),
  ADD COLUMN difficulty_notes TEXT NULL,
  ADD COLUMN authenticity_score INTEGER NULL CHECK (authenticity_score IS NULL OR (authenticity_score >= 1 AND authenticity_score <= 10)),
  ADD COLUMN authenticity_notes TEXT NULL,
  ADD COLUMN authenticity_error TEXT NULL;
