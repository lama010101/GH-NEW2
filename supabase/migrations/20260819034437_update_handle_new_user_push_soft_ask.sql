-- AIP-BUILD-PUSHDEFAULT-SOFTASK-002
-- Update the user-creation trigger so new profiles start with push_soft_ask_dismissed = FALSE.
-- Existing users are kept at TRUE by the column default from the previous migration.
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

  INSERT INTO public.profiles (id, display_name, avatar_url, push_soft_ask_dismissed)
  VALUES (
    NEW.id,
    computed_display_name,
    COALESCE(selected_avatar.firebase_url, selected_avatar.image_url),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  -- Award 100 XP signup bonus -- only creates the row if it doesn't exist
  -- (ON CONFLICT DO NOTHING). Never overwrites existing stats.
  INSERT INTO public.player_global_stats (player_id, rounds_played, games_played, avg_accuracy, total_xp)
  VALUES (NEW.id, 0, 0, 0, 100)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN NEW;
END;
$$;
