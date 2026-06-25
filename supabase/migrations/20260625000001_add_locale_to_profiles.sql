-- Migration 20260625000001: add locale column to profiles
-- Ref: MP-FEAT-AUTH-LANG-B4-001
-- Stores the user's UI language choice (EN/FR) persisted from the AuthModal
-- LanguageSwitcher. Nullable, no default — fully reversible via DROP COLUMN.
-- Existing rows get NULL; the cookie (gh_locale) remains the active runtime source
-- and this column is the persisted preference written by setLocale when signed in.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale TEXT;
