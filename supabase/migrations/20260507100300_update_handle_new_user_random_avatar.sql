CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_avatar public.avatars%ROWTYPE;
  computed_display_name TEXT;
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

  -- Fallback if avatars table is empty or name is blank
  IF computed_display_name IS NULL OR computed_display_name = '' THEN
    computed_display_name := split_part(NEW.email, '@', 1);
  END IF;

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    computed_display_name,
    COALESCE(selected_avatar.image_url, selected_avatar.firebase_url)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
