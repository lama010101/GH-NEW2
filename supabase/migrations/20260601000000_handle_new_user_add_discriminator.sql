-- MP-FIX-PROFILE-DISCRIMINATOR-001: Append #XXXX discriminator to display_name in handle_new_user trigger
-- New users will receive display_name in format "Name#XXXX" where XXXX is random 4-digit (1000-9999)

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

  RETURN NEW;
END;
$$;
