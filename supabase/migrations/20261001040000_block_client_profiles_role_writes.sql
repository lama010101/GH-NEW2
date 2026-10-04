-- Migration: block_client_profiles_role_writes
-- Task: SEC-FIX-PROFILESROLEESCALATION-001
-- Closes privilege escalation: authenticated/anon roles hold UPDATE on
-- profiles.role and profiles_update_own has no WITH CHECK, so any logged-in
-- user could PATCH their own role to 'admin'. This trigger rejects role
-- changes performed by client roles; service paths (service_role, postgres,
-- SECURITY DEFINER functions like handle_new_user) are unaffected because
-- the function is NOT SECURITY DEFINER (current_user stays the caller).

CREATE OR REPLACE FUNCTION public.profiles_block_client_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'profiles.role cannot be changed by client roles' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'user' THEN
      RAISE EXCEPTION 'profiles.role cannot be set by client roles' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_client_role_change ON public.profiles;

CREATE TRIGGER profiles_block_client_role_change
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_block_client_role_change();
