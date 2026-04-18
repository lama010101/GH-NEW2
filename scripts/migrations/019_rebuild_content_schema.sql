-- Migration: 019_rebuild_content_schema.sql
-- Task ref: MP-CONTENT-SCHEMA-006
-- Purpose: Drop legacy content tables and create new unified content schema
-- WARNING: This drops all content data. Run migration script after applying.

-- ============================================================================
-- PART 1: DROP LEGACY CONTENT TABLES (CASCADE handles FKs)
-- ============================================================================

DROP TABLE IF EXISTS prompt_verifications CASCADE;
DROP TABLE IF EXISTS auth_model_results CASCADE;
DROP TABLE IF EXISTS auth_reports CASCADE;
DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS event_images CASCADE;
DROP TABLE IF EXISTS images CASCADE;
DROP TABLE IF EXISTS hints CASCADE;
DROP TABLE IF EXISTS prompts CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS events CASCADE;

-- Note: DO NOT drop sessions, session_players, round_commits, 
-- round_results, round_events, schema_migrations, schema_migration_locks

-- ============================================================================
-- PART 2: CREATE NEW CONTENT SCHEMA
-- ============================================================================

-- Table: events
-- Core event metadata. Each event represents a historical moment for gameplay.
CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  event_year   INTEGER NOT NULL,
  category     TEXT,
  theme        TEXT,
  real_event   BOOLEAN DEFAULT true,
  celebrity    BOOLEAN DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'validated'
                 CHECK (status IN ('draft','validated','rejected')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE events IS 'Core historical events for gameplay';
COMMENT ON COLUMN events.status IS 'draft/validated/rejected - only validated events appear in games';

-- Table: locations
-- One-to-one with events. Stores geo coordinates and display info.
CREATE TABLE locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  display_name TEXT,
  country      TEXT,
  continent    TEXT,
  UNIQUE(event_id)
);

COMMENT ON TABLE locations IS 'Geographic data for events. One location per event.';

-- Table: images
-- Images for events. AI-generated or sourced. Multiple images per event allowed.
CREATE TABLE images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  url             TEXT,
  storage_path    TEXT,
  ai_prompt       TEXT,
  negative_prompt TEXT,
  ai_generated    BOOLEAN DEFAULT true,
  display_order   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE images IS 'Images associated with events. Supports AI-generated and uploaded images.';

-- Table: hints
-- Hints for events. Tiered hint system (1=broad, 5=specific).
CREATE TABLE hints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier          INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 5),
  type          TEXT NOT NULL CHECK (type IN ('where','when')),
  content       TEXT NOT NULL,
  metadata      JSONB,
  display_order INTEGER DEFAULT 0
);

COMMENT ON TABLE hints IS 'Tiered hints for events. tier 1=broadest clue, tier 5=most specific.';

-- ============================================================================
-- PART 3: CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_events_status   ON events(status);
CREATE INDEX idx_events_year     ON events(event_year);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_locations_event ON locations(event_id);
CREATE INDEX idx_images_event    ON images(event_id);
CREATE INDEX idx_hints_event     ON hints(event_id);
CREATE INDEX idx_hints_tier_type ON hints(event_id, tier, type);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hints     ENABLE ROW LEVEL SECURITY;

-- SELECT only for authenticated users
CREATE POLICY "select_events"
  ON events FOR SELECT TO authenticated USING (true);

CREATE POLICY "select_locations"
  ON locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "select_images"
  ON images FOR SELECT TO authenticated USING (true);

CREATE POLICY "select_hints"
  ON hints FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================

DO $$
DECLARE
  tbl RECORD;
  cnt INTEGER;
BEGIN
  RAISE NOTICE '=== Verifying new content schema ===';
  FOR tbl IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('events', 'locations', 'images', 'hints')
    ORDER BY table_name
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl.table_name) INTO cnt;
    RAISE NOTICE 'Table % created (0 rows expected)', tbl.table_name;
  END LOOP;
  RAISE NOTICE '=== Schema rebuild complete ===';
END $$;
