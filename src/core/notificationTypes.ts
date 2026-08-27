/**
 * Single source of truth for the notification type list on the TypeScript side.
 *
 * MUST be kept in sync with:
 *  - the CHECK constraint on public.notifications.type
 *  - the CHECK constraint on public.notification_preferences.type
 * Adding a type requires changing all three in one migration + one commit.
 *
 * NOTE: 'friend_joined' and 'game_started' are declared here and permitted by
 * the DB CHECKs, but have ZERO emission sites in the codebase as of
 * 2026-08-27. Do not surface them in user-facing settings UI until they are
 * actually emitted.
 */
export const NOTIFICATION_TYPES = [
  "lobby_invite",
  "friend_joined",
  "game_started",
  "session_complete",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Notification types that are actually emitted today and therefore safe to
 * expose in the account settings UI.
 */
export const USER_CONFIGURABLE_NOTIFICATION_TYPES = [
  "lobby_invite",
  "session_complete",
] as const satisfies readonly NotificationType[];

export const NOTIFICATION_CHANNELS = [
  "none",
  "push",
  "in_app",
  "both",
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Channel applied when a user has no notification_preferences row for a type. */
export const DEFAULT_NOTIFICATION_CHANNEL: NotificationChannel = "both";

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}
