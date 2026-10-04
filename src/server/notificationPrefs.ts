import type { Pool } from "pg";
import { createSupabaseServerClient } from "@/core/supabaseServer";
import {
  type NotificationType,
  type NotificationChannel,
  DEFAULT_NOTIFICATION_CHANNEL,
} from "@/core/notificationTypes";

/**
 * A query-capable client: either a pg Pool or a transaction PoolClient
 * acquired via pool.connect(). Only `.query()` is used, so a structural Pick
 * matches both without importing PoolClient (which is not resolvable from
 * "pg" under this project's moduleResolution: "bundler"; see src/server/db.ts
 * `DbExecutor` for the same established pattern).
 */
type QueryClient = Pick<Pool, "query">;

/**
 * Resolves the delivery channel preference for ONE user + one notification
 * type. Accepts an optional pg client/pool (e.g. an open transaction client)
 * so callers inside a transaction can query on that same connection. When no
 * client is supplied, reads go through the service-role Supabase client over
 * PostgREST — deliberately NOT the shared pg pool, whose startup probe calls
 * process.exit(1) on failure (src/server/db.ts) and cannot be caught.
 *
 * NEVER THROWS. On any error, logs and returns DEFAULT_NOTIFICATION_CHANNEL.
 */
export async function resolveNotificationChannel(
  userId: string,
  type: NotificationType,
  client?: QueryClient
): Promise<NotificationChannel> {
  try {
    if (client) {
      const { rows } = await client.query<{ channel: NotificationChannel }>(
        `SELECT channel FROM notification_preferences WHERE user_id = $1 AND type = $2`,
        [userId, type]
      );
      if (rows.length === 0) {
        return DEFAULT_NOTIFICATION_CHANNEL;
      }
      return rows[0].channel;
    }

    const { data, error } = await createSupabaseServerClient()
      .from("notification_preferences")
      .select("channel")
      .eq("user_id", userId)
      .eq("type", type)
      .maybeSingle();
    if (error) {
      console.error(
        `[notificationPrefs] resolveNotificationChannel PostgREST error for user=${userId} type=${type}:`,
        error
      );
      return DEFAULT_NOTIFICATION_CHANNEL;
    }
    if (!data) {
      return DEFAULT_NOTIFICATION_CHANNEL;
    }
    return data.channel as NotificationChannel;
  } catch (error) {
    console.error(
      `[notificationPrefs] resolveNotificationChannel failed for user=${userId} type=${type}:`,
      error
    );
    return DEFAULT_NOTIFICATION_CHANNEL;
  }
}

/**
 * Batch variant: resolves the channel for MANY users, one notification type,
 * in a single query. Returns a Map keyed by userId. Any userId with no row
 * (or on any error, for ALL requested userIds) resolves to
 * DEFAULT_NOTIFICATION_CHANNEL. Default path is PostgREST (same rationale as
 * resolveNotificationChannel); a supplied pg client uses .query() as before.
 *
 * NEVER THROWS.
 */
export async function resolveNotificationChannelsBatch(
  userIds: string[],
  type: NotificationType,
  client?: QueryClient
): Promise<Map<string, NotificationChannel>> {
  const result = new Map<string, NotificationChannel>();
  if (userIds.length === 0) {
    return result;
  }
  try {
    for (const userId of userIds) {
      result.set(userId, DEFAULT_NOTIFICATION_CHANNEL);
    }

    if (client) {
      const { rows } = await client.query<{
        user_id: string;
        channel: NotificationChannel;
      }>(
        `SELECT user_id, channel FROM notification_preferences WHERE type = $1 AND user_id = ANY($2::uuid[])`,
        [type, userIds]
      );
      for (const row of rows) {
        result.set(row.user_id, row.channel);
      }
      return result;
    }

    const { data, error } = await createSupabaseServerClient()
      .from("notification_preferences")
      .select("user_id, channel")
      .in("user_id", userIds)
      .eq("type", type);
    if (error) {
      console.error(
        `[notificationPrefs] resolveNotificationChannelsBatch PostgREST error for type=${type} count=${userIds.length}:`,
        error
      );
      return result;
    }
    for (const row of data ?? []) {
      result.set(row.user_id as string, row.channel as NotificationChannel);
    }
    return result;
  } catch (error) {
    console.error(
      `[notificationPrefs] resolveNotificationChannelsBatch failed for type=${type} count=${userIds.length}:`,
      error
    );
    for (const userId of userIds) {
      result.set(userId, DEFAULT_NOTIFICATION_CHANNEL);
    }
  }
  return result;
}

/** Convenience predicate built on resolveNotificationChannel. channel ∈ {'push','both'} */
export async function shouldSendPush(
  userId: string,
  type: NotificationType,
  client?: QueryClient
): Promise<boolean> {
  const channel = await resolveNotificationChannel(userId, type, client);
  return channel === "push" || channel === "both";
}

/** Convenience predicate built on resolveNotificationChannel. channel ∈ {'in_app','both'} */
export async function shouldInsertInApp(
  userId: string,
  type: NotificationType,
  client?: QueryClient
): Promise<boolean> {
  const channel = await resolveNotificationChannel(userId, type, client);
  return channel === "in_app" || channel === "both";
}
