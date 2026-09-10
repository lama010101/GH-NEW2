-- HJ-FIX-APPROVEDBY-FKNULLIFIES-001
-- Add denormalized approved_by_email to preserve approval audit trail when
-- an admin auth.users row is deleted (FK ON DELETE SET NULL nullifies
-- approved_by but approved_by_email survives as a durable text snapshot).
--
-- Additive only — no data loss, no existing column modified.

ALTER TABLE public.journey_stage_events
  ADD COLUMN IF NOT EXISTS approved_by_email TEXT NULL;
