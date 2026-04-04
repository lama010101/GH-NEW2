-- Add unique constraint on events.legacy_prompt_id for idempotent migration
ALTER TABLE events 
    ADD CONSTRAINT unique_legacy_prompt_id UNIQUE (legacy_prompt_id);

-- Also add unique constraint for hints to prevent duplicates
-- Composite unique on event_id + level + type
ALTER TABLE hints 
    DROP CONSTRAINT IF EXISTS unique_hint_event_level_type;
    
ALTER TABLE hints 
    ADD CONSTRAINT unique_hint_event_level_type UNIQUE (event_id, level, type);
