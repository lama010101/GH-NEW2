-- FIX-SIGNUP-XP-TRIGGER-001: Award 100 XP signup bonus in handle_new_user trigger
--
-- Before this migration, the 100 XP signup bonus was awarded in the
-- /api/user/assign-avatar route (client-side, depends on isNewUser detection).
-- That route returns early when the profile already has an avatar_url — which
-- the trigger itself sets. So the XP upsert was dead code for the normal
-- signup path. It also depended on client-side isNewUser detection which can
-- fail on slow networks.
--
-- This migration moves the 100 XP award into the handle_new_user trigger
-- itself: server-side, guaranteed, cannot be skipped by client-side failures.
-- Single source of truth for new user creation → single source of truth for
-- signup XP.
--
-- The player_global_stats insert uses ON CONFLICT (player_id) DO NOTHING so
-- it only creates the row if it doesn't exist — never overwrites existing
-- stats for returning users.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_avatar public.avatars%ROWTYPE;
  computed_display_name TEXT;
  discriminator TEXT;
BEGIN
  -- Select a random ready avatar
  SELECT * INTO selected_avatar
  FROM public.avatars
  WHERE ready = true
  ORDER BY random()
  LIMIT 1;

  -- Build display name from avatar first_name + last_name
  computed_display_name := TRIM(
    COALESCE(selected_avatar.first_name, '') ||
    CASE WHEN selected_avatar.last_name IS NOT NULL AND selected_avatar.last_name <> ''
         THEN ' ' || selected_avatar.last_name
         ELSE ''
    END
  );

  -- Generate 4-digit discriminator (1000-9999)
  discriminator := LPAD((floor(random() * 9000 + 1000))::int::text, 4, '0');

  -- Fallback if avatars table is empty or name is blank
  IF computed_display_name IS NULL OR computed_display_name = '' THEN
    computed_display_name := split_part(NEW.email, '@', 1);
  END IF;

  -- Append discriminator to display_name
  computed_display_name := computed_display_name || '#' || discriminator;

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    computed_display_name,
    COALESCE(selected_avatar.firebase_url, selected_avatar.image_url)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Award 100 XP signup bonus — only creates the row if it doesn't exist
  -- (ON CONFLICT DO NOTHING). Never overwrites existing stats.
  INSERT INTO public.player_global_stats (player_id, rounds_played, games_played, avg_accuracy, total_xp)
  VALUES (NEW.id, 0, 0, 0, 100)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN NEW;
END;
$$;
