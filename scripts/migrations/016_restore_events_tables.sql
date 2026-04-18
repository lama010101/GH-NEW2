-- Migration 016: Restore events, event_images, and hints tables
-- Ref: MP-EVENTS-RESTORE-001
-- Reason: These tables were dropped by migration 012 (hard reset).
-- They are required by the content layer (src/server/events.ts).
-- This migration restores the table structure only. Data is seeded separately.

CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  year         INTEGER NOT NULL,
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  location_name TEXT,
  region       TEXT,
  category     TEXT,
  difficulty   INTEGER
);

CREATE TABLE IF NOT EXISTS event_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  thumb_url  TEXT,
  alt_text   TEXT,
  source     TEXT,
  width      INTEGER,
  height     INTEGER,
  is_primary BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS hints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  level           INTEGER,
  type            TEXT,
  text            TEXT,
  distance_km     DOUBLE PRECISION,
  time_diff_years INTEGER,
  penalty_bp      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images(event_id);
CREATE INDEX IF NOT EXISTS idx_hints_event_id ON hints(event_id);
