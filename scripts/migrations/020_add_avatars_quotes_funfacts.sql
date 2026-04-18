-- Migration: Add avatars, quotes, and fun_facts tables
-- Task ref: MP-CONTENT-SCHEMA-009

-- Table: avatars
CREATE TABLE avatars (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     TEXT NOT NULL,
  last_name      TEXT,
  description    TEXT,
  gender         TEXT,
  birth_city     TEXT,
  birth_country  TEXT,
  death_city     TEXT,
  death_country  TEXT,
  birth_day      TEXT,
  death_day      TEXT,
  image_url      TEXT,
  firebase_url   TEXT,
  ready          BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Table: quotes
CREATE TABLE quotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_text  TEXT NOT NULL,
  author      TEXT,
  year        INTEGER,
  location    TEXT,
  is_valid    BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Table: fun_facts
CREATE TABLE fun_facts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  date        TEXT,
  location    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: SELECT only for authenticated on all 3 tables
ALTER TABLE avatars    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fun_facts  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_avatars"
  ON avatars FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_quotes"
  ON quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_fun_facts"
  ON fun_facts FOR SELECT TO authenticated USING (true);
