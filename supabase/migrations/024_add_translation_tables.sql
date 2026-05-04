-- Migration 024: Add translation child tables for content localization
-- Adds translation tables alongside existing base tables.
-- Base tables are unchanged. Existing English data remains authoritative.
-- Fallback policy: application coalesces to base table column when translation row is absent.

CREATE TABLE event_translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code ~ '^[a-z]{2}$'),
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  theme         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, language_code)
);

CREATE TABLE hint_translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hint_id       UUID NOT NULL REFERENCES hints(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code ~ '^[a-z]{2}$'),
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (hint_id, language_code)
);

CREATE TABLE location_translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL CHECK (language_code ~ '^[a-z]{2}$'),
  display_name  TEXT,
  country       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (location_id, language_code)
);

CREATE INDEX idx_event_translations_event_lang
  ON event_translations (event_id, language_code);

CREATE INDEX idx_hint_translations_hint_lang
  ON hint_translations (hint_id, language_code);

CREATE INDEX idx_location_translations_location_lang
  ON location_translations (location_id, language_code);
