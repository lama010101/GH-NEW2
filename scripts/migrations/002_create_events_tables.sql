-- Migration: Create events table for game data
-- This stores historical events used in Practice Mode

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_prompt_id TEXT,                    -- Reference to legacy prompts table if migrating
    title TEXT NOT NULL,                      -- Event title
    description TEXT,                       -- Event description
    year INTEGER NOT NULL,                  -- The year of the event
    location_lat DOUBLE PRECISION NOT NULL, -- Latitude
    location_lng DOUBLE PRECISION NOT NULL, -- Longitude
    location_name TEXT,                     -- Human-readable location name
    region TEXT,                            -- Region/continent
    category TEXT,                          -- Event category
    difficulty INTEGER CHECK (difficulty >= 1 AND difficulty <= 5), -- Difficulty 1-5
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_events_year ON events(year);
CREATE INDEX idx_events_region ON events(region);
CREATE INDEX idx_events_difficulty ON events(difficulty);
CREATE INDEX idx_events_legacy_prompt_id ON events(legacy_prompt_id) WHERE legacy_prompt_id IS NOT NULL;

COMMENT ON TABLE events IS 'Historical events used in Practice Mode rounds';
COMMENT ON COLUMN events.legacy_prompt_id IS 'Reference to legacy prompts.id for migration tracking';
COMMENT ON COLUMN events.year IS 'The actual year the event occurred';
COMMENT ON COLUMN events.location_name IS 'Human-readable location (e.g., "Paris, France")';

-- Create event_images table to link events to their game images
CREATE TABLE IF NOT EXISTS event_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,                -- Primary image URL (Firebase or other CDN)
    thumb_url TEXT,                         -- Thumbnail URL
    alt_text TEXT,                          -- Accessibility alt text
    source TEXT,                            -- Image source (firebase, wiki, etc.)
    content_hash TEXT,                      -- For deduplication
    width INTEGER,
    height INTEGER,
    is_primary BOOLEAN DEFAULT false,       -- Is this the primary image for the event?
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_images_event_id ON event_images(event_id);
CREATE INDEX idx_event_images_primary ON event_images(event_id, is_primary) WHERE is_primary = true;

COMMENT ON TABLE event_images IS 'Images associated with historical events (shown during gameplay)';

-- Update hints table to reference events instead of images
-- (if hints table already exists from create_missing_tables.sql, modify it)
DO $$
BEGIN
    -- Check if hints table exists with image_id column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'hints' AND column_name = 'image_id'
    ) THEN
        -- Add event_id column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'hints' AND column_name = 'event_id'
        ) THEN
            ALTER TABLE hints ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
        END IF;
        
        -- Make image_id nullable since we'll use event_id primarily
        ALTER TABLE hints ALTER COLUMN image_id DROP NOT NULL;
    ELSE
        -- Create hints table if it doesn't exist
        CREATE TABLE IF NOT EXISTS hints (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_id UUID REFERENCES events(id) ON DELETE CASCADE,
            image_id UUID REFERENCES images(id) ON DELETE CASCADE,
            level INTEGER NOT NULL CHECK (level >= 1 AND level <= 3),
            type TEXT NOT NULL CHECK (type IN ('where', 'when', 'what')),
            text TEXT NOT NULL,
            distance_km NUMERIC,
            time_diff_years INTEGER,
            cost_xp INTEGER NOT NULL DEFAULT 0,
            cost_accuracy INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hints_event_id ON hints(event_id);

COMMENT ON TABLE hints IS 'Game hints for events - shown to players during rounds';
COMMENT ON COLUMN hints.event_id IS 'Reference to the event this hint belongs to';
COMMENT ON COLUMN hints.level IS 'Hint level 1-3 (progressive disclosure)';
COMMENT ON COLUMN hints.type IS 'Hint category: where (location), when (time), what (event)';
COMMENT ON COLUMN hints.cost_xp IS 'XP penalty for using this hint';
COMMENT ON COLUMN hints.cost_accuracy IS 'Accuracy penalty for using this hint';
