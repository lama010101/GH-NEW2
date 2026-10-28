-- GEN-BUILD-CANDIDATES-1028-001
-- New events rows must default to 'draft', not 'validated'.
--
-- Why: the generation pipeline inserts into public.generation_candidates
-- first, but any direct INSERT into events that omits status previously got
-- 'validated' silently — bypassing the review flow. Every consumer of
-- public.events (game, journey, daily, ai-players) already filters
-- status = 'validated' explicitly, so flipping the default cannot leak
-- drafts into gameplay; it only prevents unreviewed rows from being
-- treated as validated.
--
-- Scope: changes ONLY the column default. No existing row is touched
-- (verified pre-migration: 2183 rows, 1241 validated, 942 draft,
-- checksum 0cd695ac369d0e411a4931bc3f8736e2). The CHECK constraint
-- already permits 'draft'. The only INSERT INTO events site in the repo
-- is scripts/migrate-legacy-data.mjs (one-off, already run).

ALTER TABLE public.events ALTER COLUMN status SET DEFAULT 'draft';
