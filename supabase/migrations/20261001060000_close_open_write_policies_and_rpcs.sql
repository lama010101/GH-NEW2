-- SEC-FIX-OPENWRITEPOLICIES-017
-- Close open-write RLS policies, client-callable SECURITY DEFINER RPCs, and the
-- settings secret-leak surface on PROD. Implements approved plan
-- SEC-PLAN-OPENWRITEPOLICIES-014, Variant A: service_role only.
--
-- (1) Drop the 11 permissive authenticated policies on settings /
--     verification_evidence / verification_fixes / verification_runs /
--     verification_sources. The "Service role can manage ..." policies are kept.
-- (2) Revoke EXECUTE from PUBLIC/anon/authenticated on the 5 SECURITY DEFINER
--     RPCs (signatures verified against pg_proc on prod gzvixlvkwjsrtmtybtkf).
-- (3) Revoke all table privileges from anon/authenticated on the 5 tables so
--     only service_role (bypasses RLS) can reach them.
--
-- Idempotent: all statements use IF EXISTS / plain REVOKE (no-ops if repeated).

BEGIN;

-- (1) Drop open authenticated policies ----------------------------------------
DROP POLICY IF EXISTS "Authenticated users can manage settings" ON public.settings;

DROP POLICY IF EXISTS "Authenticated users can manage verification evidence" ON public.verification_evidence;
DROP POLICY IF EXISTS "Users can read verification evidence" ON public.verification_evidence;

DROP POLICY IF EXISTS "Authenticated users can manage verification fixes" ON public.verification_fixes;
DROP POLICY IF EXISTS "Users can read verification fixes" ON public.verification_fixes;

DROP POLICY IF EXISTS "Authenticated users can manage verification runs" ON public.verification_runs;
DROP POLICY IF EXISTS "Users can read verification runs" ON public.verification_runs;
DROP POLICY IF EXISTS "Users can insert verification runs" ON public.verification_runs;
DROP POLICY IF EXISTS "Users can update their verification runs" ON public.verification_runs;

DROP POLICY IF EXISTS "Authenticated users can manage verification sources" ON public.verification_sources;
DROP POLICY IF EXISTS "Users can read verification sources" ON public.verification_sources;

-- (2) Revoke EXECUTE on the 5 SECURITY DEFINER RPCs ---------------------------
REVOKE EXECUTE ON FUNCTION public.apply_verification_fixes(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_verification_fixes_v2(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_prompt_verification(uuid, text, integer, text, text[], text[], uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_prompt_verification_v2(uuid, boolean, boolean, boolean, numeric, text, jsonb, integer, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_unlinked_prompts(uuid[]) FROM PUBLIC, anon, authenticated;

-- (3) Revoke all table privileges from client roles ---------------------------
REVOKE ALL ON public.settings FROM anon, authenticated;
REVOKE ALL ON public.verification_evidence FROM anon, authenticated;
REVOKE ALL ON public.verification_fixes FROM anon, authenticated;
REVOKE ALL ON public.verification_runs FROM anon, authenticated;
REVOKE ALL ON public.verification_sources FROM anon, authenticated;

COMMIT;
