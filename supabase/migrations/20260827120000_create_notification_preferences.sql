-- MP-BUILD-NOTIFPREFS-MIGRATION-001
-- Per-notification-type delivery channel preference.
--
-- DEFAULT BEHAVIOR: the ABSENCE of a row means 'both'. There is deliberately
-- no backfill and no default row insertion -- existing users keep receiving
-- both push and in-app until they explicitly change a type.
--
-- This table is INDEPENDENT of profiles.push_soft_ask_dismissed and
-- profiles.relax_push_nudge_dismissed, which govern the push PERMISSION
-- PROMPT flow, not delivery routing. Do not couple them.
--
-- DUPLICATION NOTE: the notification type list exists in exactly three
-- places and they must be changed together in a single migration whenever a
-- type is added:
--   1. the CHECK on public.notifications.type
--      (see 20260808000000_add_session_complete_notification_type.sql)
--   2. the CHECK on public.notification_preferences.type (below)
--   3. NOTIFICATION_TYPES in src/core/notificationTypes.ts
-- Postgres has no shared enum across these tables here, so 1 and 2 are an
-- accepted, documented duplication. 3 is the single source of truth for all
-- TypeScript consumers.
--
-- 'friend_joined' and 'game_started' are included in the CHECK below for
-- forward-compatibility even though they currently have ZERO emission sites
-- in the codebase (verified 2026-08-27). They are intentionally NOT surfaced
-- in the settings UI until emission sites exist.

CREATE TABLE public.notification_preferences (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL
               CHECK (type IN ('lobby_invite','friend_joined','game_started','session_complete')),
  channel    TEXT NOT NULL
               CHECK (channel IN ('none','push','in_app','both')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_prefs_select" ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notif_prefs_insert" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_prefs_update" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_prefs_delete" ON public.notification_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_notif_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notif_prefs_touch
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_notif_prefs_updated_at();
