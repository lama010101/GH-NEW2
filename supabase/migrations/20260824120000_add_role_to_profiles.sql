-- Migration: add_role_to_profiles
-- Task: AIP-BUILD-ADMINROLEGATE-001
-- Replaces the email-allowlist admin gate with a profiles.role column.
-- TEXT + CHECK for future multi-role extensibility (add values to the CHECK,
-- not a type change).

ALTER TABLE public.profiles
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_chk CHECK (role IN ('user','admin'));

-- Backfill the 3 current allowlist emails (read from src/middleware.ts) to 'admin'.
UPDATE public.profiles p
  SET role = 'admin'
  FROM auth.users u
  WHERE p.id = u.id
    AND lower(u.email) IN (
      'laurent.martenot@gmail.com',
      'lama010101@gmail.com',
      'emartin6867@gmail.com'
    );
