-- SEC-BUILD-GUESTRLS-PROMPTS-NOTIFPREFS-1102-050: anonymous users must not insert into prompts or notification_preferences.
-- Rollback: DROP POLICY IF EXISTS guest_block_prompts_insert ON public.prompts; DROP POLICY IF EXISTS guest_block_notification_preferences_insert ON public.notification_preferences;
DROP POLICY IF EXISTS guest_block_prompts_insert ON public.prompts;
CREATE POLICY guest_block_prompts_insert ON public.prompts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
DROP POLICY IF EXISTS guest_block_notification_preferences_insert ON public.notification_preferences;
CREATE POLICY guest_block_notification_preferences_insert ON public.notification_preferences AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
