-- Migration: Fix hints table FK to reference prompts instead of events
-- Reference: MP-CONTENT-FIX-002

-- Drop the existing foreign key constraint
ALTER TABLE hints DROP CONSTRAINT IF EXISTS hints_event_id_fkey;

-- Rename the column for clarity
ALTER TABLE hints RENAME COLUMN event_id TO prompt_id;

-- Add the new foreign key constraint referencing prompts.id
ALTER TABLE hints ADD CONSTRAINT hints_prompt_id_fkey 
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE;
