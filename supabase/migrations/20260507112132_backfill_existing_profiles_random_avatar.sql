-- MP-DB-AVATAR-003: Backfill existing profiles with random avatar from avatars table
-- Assigns a random avatar to every existing profile row where avatar_url IS NULL
-- Covers all users registered before MP-DB-AVATAR-001 was deployed

DO $$
DECLARE
  profile_row RECORD;
  selected_avatar public.avatars%ROWTYPE;
  computed_display_name TEXT;
BEGIN
  FOR profile_row IN
    SELECT id FROM public.profiles WHERE avatar_url IS NULL
  LOOP
    SELECT * INTO selected_avatar
    FROM public.avatars
    WHERE ready = true
    ORDER BY random()
    LIMIT 1;

    computed_display_name := TRIM(
      COALESCE(selected_avatar.first_name, '') ||
      CASE WHEN selected_avatar.last_name IS NOT NULL AND selected_avatar.last_name <> ''
           THEN ' ' || selected_avatar.last_name
           ELSE ''
      END
    );

    IF computed_display_name IS NULL OR computed_display_name = '' THEN
      computed_display_name := NULL;
    END IF;

    UPDATE public.profiles
    SET
      avatar_url = COALESCE(selected_avatar.firebase_url, selected_avatar.image_url),
      display_name = COALESCE(computed_display_name, display_name),
      updated_at = now()
    WHERE id = profile_row.id;
  END LOOP;
END;
$$;
