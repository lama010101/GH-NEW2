-- I18N-CONTENT-TRANSLATE-BLD-1112-201
-- Add source_hash to the three translation tables so each translated row can
-- be tied to the exact English source it was generated from. The hash is the
-- sha256 hex of the UTF-8 source fields joined with U+241F (NULL = empty
-- string): events = title, description, category, theme; hints = content;
-- locations = display_name, country. A translation row whose source_hash
-- differs from the current English row is stale and may be re-translated.
--
-- Scope: additive nullable text column only. No index, no backfill, no
-- grants — tables are service-role-only (RLS enabled, zero policies).

ALTER TABLE public.event_translations    ADD COLUMN IF NOT EXISTS source_hash text;
ALTER TABLE public.hint_translations     ADD COLUMN IF NOT EXISTS source_hash text;
ALTER TABLE public.location_translations ADD COLUMN IF NOT EXISTS source_hash text;
