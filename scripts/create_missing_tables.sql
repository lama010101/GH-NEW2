-- Migration: Create missing core game tables
-- Based on legacy schema (jghesmrwhegaotbztrhr)

-- 1. hints table - Game hints for images
CREATE TABLE IF NOT EXISTS hints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 3),
    type TEXT NOT NULL CHECK (type IN ('where', 'when', 'what')),
    text TEXT NOT NULL,
    distance_km NUMERIC,
    time_diff_years INTEGER,
    cost_xp INTEGER NOT NULL DEFAULT 0,
    cost_accuracy INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_hints_image_id ON hints(image_id);

COMMENT ON TABLE hints IS 'Game hints for images - shown to players during rounds';
COMMENT ON COLUMN hints.level IS 'Hint level 1-3 (progressive disclosure)';
COMMENT ON COLUMN hints.type IS 'Hint category: where (location), when (time), what (event)';
COMMENT ON COLUMN hints.cost_xp IS 'XP penalty for using this hint';
COMMENT ON COLUMN hints.cost_accuracy IS 'Accuracy penalty for using this hint';

-- 2. wiki table - Historical event data (reference only)
CREATE TABLE IF NOT EXISTS wiki (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qid TEXT UNIQUE,                    -- Wikidata QID (e.g., Q12345)
    title TEXT NOT NULL,                -- Event title
    description TEXT,                   -- Event description
    date_point_in_time DATE,            -- Exact date if known
    date_point_precision SMALLINT,      -- Precision level (11=year, 10=month, 9=day)
    date_start DATE,                    -- Start date for ranges
    date_start_precision SMALLINT,
    date_end DATE,                      -- End date for ranges  
    date_end_precision SMALLINT,
    location_qid TEXT,                  -- Wikidata location QID
    location_label TEXT,                -- Human-readable location
    lat DOUBLE PRECISION,               -- Latitude
    lon DOUBLE PRECISION,               -- Longitude
    enwiki_title TEXT,                  -- English Wikipedia page title
    enwiki_url TEXT,                    -- English Wikipedia URL
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_wiki_qid ON wiki(qid);
CREATE INDEX idx_wiki_location_qid ON wiki(location_qid);
CREATE INDEX idx_wiki_date_point ON wiki(date_point_in_time);

COMMENT ON TABLE wiki IS 'Historical event reference data from Wikidata (not used in game directly)';

-- 3. wiki_images table - Reference images from wiki (not shown in game)
CREATE TABLE IF NOT EXISTS wiki_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qid TEXT NOT NULL REFERENCES wiki(qid) ON DELETE CASCADE,
    source TEXT NOT NULL,               -- Source (e.g., "wikidata", "commons")
    file_title TEXT NOT NULL,           -- Original file title
    image_url TEXT NOT NULL,            -- Full resolution URL
    thumb_url TEXT,                     -- Thumbnail URL
    width INTEGER,
    height INTEGER,
    mime TEXT,                          -- MIME type
    license_name TEXT,                  -- License name
    license_url TEXT,                   -- License URL
    credit TEXT,                        -- Attribution credit
    source_page TEXT,                   -- Source page URL
    is_commons BOOLEAN DEFAULT false,   -- From Wikimedia Commons?
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_wiki_images_qid ON wiki_images(qid);

COMMENT ON TABLE wiki_images IS 'Reference images from Wikipedia/Wikidata (not shown in game - for verification only)';

-- 4. Add actual_year to round_results (needed for year difference calc)
ALTER TABLE round_results 
    ADD COLUMN IF NOT EXISTS actual_year INTEGER,
    ADD COLUMN IF NOT EXISTS actual_event_date DATE;

COMMENT ON COLUMN round_results.actual_year IS 'The actual year of the historical event shown';
COMMENT ON COLUMN round_results.actual_event_date IS 'The actual date of the historical event (if known)';
