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

-- Drop old hints table if exists with legacy columns (cost_xp, cost_accuracy)
DROP TABLE IF EXISTS hints CASCADE;

-- Create hints table with single penalty_bp column (basis points: 1000 = 10%)
-- Following recommendation: one canonical unit, simpler mental model
CREATE TABLE hints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 3),
    type TEXT NOT NULL CHECK (type IN ('where', 'when', 'what')),
    text TEXT NOT NULL,
    distance_km NUMERIC,                    -- Optional: distance hint reveals
    time_diff_years INTEGER,              -- Optional: time hint reveals
    penalty_bp INTEGER NOT NULL DEFAULT 0, -- Basis points: 1000 = 10%, max 10000 = 100%
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_hints_event_id ON hints(event_id);
CREATE INDEX idx_hints_event_level ON hints(event_id, level);

COMMENT ON TABLE hints IS 'Game hints for events - shown to players during rounds';
COMMENT ON COLUMN hints.event_id IS 'Reference to the event this hint belongs to';
COMMENT ON COLUMN hints.level IS 'Hint level 1-3 (progressive disclosure)';
COMMENT ON COLUMN hints.type IS 'Hint category: where (location), when (time), what (event)';
COMMENT ON COLUMN hints.penalty_bp IS 'Penalty in basis points: 1000 = 10% of accuracy/XP. Max 10000 = 100%';

-- Create round_hint_usage table to snapshot penalty at usage time
-- Following recommendation: immutable record of what applied at purchase time
CREATE TABLE round_hint_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id TEXT NOT NULL,                 -- Reference to round_results or game session
    user_id UUID,                           -- User who used the hint (null for guest/practice)
    hint_id UUID NOT NULL REFERENCES hints(id) ON DELETE CASCADE,
    penalty_bp_snapshot INTEGER NOT NULL,   -- What the cost was WHEN purchased (basis points)
    used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_round_hint_usage_round ON round_hint_usage(round_id);
CREATE INDEX idx_round_hint_usage_user ON round_hint_usage(user_id);
CREATE INDEX idx_round_hint_usage_hint ON round_hint_usage(hint_id);

COMMENT ON TABLE round_hint_usage IS 'Immutable snapshot of hint penalties at time of use. Historical rounds keep correct scores even if hint prices change later.';
COMMENT ON COLUMN round_hint_usage.penalty_bp_snapshot IS 'Penalty in basis points at moment of usage. Immutable - protects historical scores from future hint price changes.';
