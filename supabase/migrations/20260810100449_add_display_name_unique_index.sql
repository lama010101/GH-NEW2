-- MP-FIX-USERNAME-UNIQUENESS-001: enforce case-insensitive uniqueness on profiles.display_name

CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_lower_unique
ON public.profiles (lower(display_name));
