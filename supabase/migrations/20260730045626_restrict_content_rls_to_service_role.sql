-- Migration: restrict_content_rls_to_service_role
-- Per MP-FIX-CONTENT-RLS-ANSWER-LEAK-001: events/locations/hints SELECT
-- was open to all authenticated users, leaking event_year, latitude,
-- longitude, title, and description before the answer is revealed.
--
-- All legitimate game reads for these tables go through server code using
-- a service-role Supabase client, which bypasses RLS. This migration
-- removes the overly permissive authenticated SELECT policies and adds
-- explicit service_role-only SELECT policies, so authenticated/anon
-- direct PostgREST access is denied by implicit lack of matching policy.
--
-- Out of scope and intentionally untouched: images, avatars, fun_facts,
-- quotes, leaderboard*, player_global_stats, profiles.

DROP POLICY IF EXISTS "select_events" ON public.events;
DROP POLICY IF EXISTS "select_locations" ON public.locations;
DROP POLICY IF EXISTS "select_hints" ON public.hints;

CREATE POLICY "select_events_service_role"
  ON public.events FOR SELECT TO service_role USING (true);

CREATE POLICY "select_locations_service_role"
  ON public.locations FOR SELECT TO service_role USING (true);

CREATE POLICY "select_hints_service_role"
  ON public.hints FOR SELECT TO service_role USING (true);
