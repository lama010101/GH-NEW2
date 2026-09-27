-- SEO-BUILD-EVENTSPAGES-001
-- Adds a stable, unique, URL-safe slug to events for the public /events/:slug
-- SEO pages. The slug is generated once from title + event_year (and, only
-- on collision, a short suffix of the event id) and is NEVER regenerated on
-- title edits — it is the permanent identity of the event's public URL.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug TEXT;

-- Slugify helper: lowercase, strip non [a-z0-9] runs to single hyphens, trim.
CREATE OR REPLACE FUNCTION public.gh_slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Backfill: title-year, then disambiguate any collisions with a short
-- suffix of the event id so every row gets a unique, stable slug.
WITH base AS (
  SELECT
    id,
    public.gh_slugify(title || '-' || event_year::text) AS base_slug
  FROM public.events
  WHERE slug IS NULL
),
ranked AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY id) AS rn
  FROM base
)
UPDATE public.events e
SET slug = CASE
  WHEN ranked.rn = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || substr(e.id::text, 1, 8)
END
FROM ranked
WHERE e.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug ON public.events (slug);

-- New rows must always get a slug going forward.
CREATE OR REPLACE FUNCTION public.gh_events_assign_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
  suffix TEXT;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  candidate := public.gh_slugify(NEW.title || '-' || NEW.event_year::text);
  IF candidate = '' THEN
    candidate := 'event';
  END IF;

  IF EXISTS (SELECT 1 FROM public.events WHERE slug = candidate) THEN
    suffix := substr(NEW.id::text, 1, 8);
    candidate := candidate || '-' || suffix;
  END IF;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_assign_slug ON public.events;
CREATE TRIGGER trg_events_assign_slug
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.gh_events_assign_slug();

ALTER TABLE public.events ALTER COLUMN slug SET NOT NULL;
