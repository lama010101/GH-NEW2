-- SEC-HARDEN-PROMPTS-1028-001
-- Purpose: remove the prompts_public write bypass. public.prompts_public is an
-- auto-updatable view owned by postgres (no security_invoker), so writes through
-- it by anon/authenticated skip RLS on public.prompts. Drop the view and revoke
-- all anon/authenticated grants on public.prompts, leaving service_role access.
BEGIN;

DROP VIEW IF EXISTS public.prompts_public;
REVOKE ALL ON TABLE public.prompts FROM anon;
REVOKE ALL ON TABLE public.prompts FROM authenticated;

COMMIT;
