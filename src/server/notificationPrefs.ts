import type { Pool } from "pg";
import { getDbPool } from "@/server/db";
import {
  type NotificationType,
  type NotificationChannel,
  DEFAULT_NOTIFICATION_CHANNEL,
} from "@/core/notificationTypes";

/**
 * A query-capable client: either the module-level Pool or a transaction
 * PoolClient acquired via pool.connect(). Only `.query()` is used, so a
 * structural Pick matches both without importing PoolClient (which is not
 * resolvable from "pg" under this project's moduleResolution: "bundler";
 * see src/server/db.ts `DbExecutor` for the same established pattern).
 */
type QueryClient = Pick<Pool, "query">;

/**
 * Resolves the delivery channel preference for ONE user + one notification
 * type. Accepts an optional pg client/pool (e.g. an open transaction client)
 * so callers inside a transaction never open a second connection. Falls back
 * to the module-level pool when none is supplied.
 *
 * NEVER THROWS. On any DB error, logs and returns DEFAULT_NOTIFICATION_CHANNEL.
 */
export async function resolveNotificationChannel(
  userId: string,
  type: NotificationType,
  client?: QueryClient
): Promise<NotificationChannel> {
  try {
    const executor = client ?? getDbPool();
    const { rows } = await executor.query<{ channel: NotificationChannel }>(
      `SELECT channel FROM notification_preferences WHERE user_id = $1 AND type = $2`,
      [userId, type]
    );
    if (rows.length === 0) {
      return DEFAULT_NOTIFICATION_CHANNEL;
    }
    return rows[0].channel;
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
 * (or on any DB error, for ALL requested userIds) resolves to
 * DEFAULT_NOTIFICATION_CHANNEL. Use this at the sessionCore.ts fan-out site
 * to avoid N+1 queries.
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
    const executor = client ?? getDbPool();
    const { rows } = await executor.query<{
      user_id: string;
      channel: NotificationChannel;
    }>(
      `SELECT user_id, channel FROM notification_preferences WHERE type = $1 AND user_id = ANY($2::uuid[])`,
      [type, userIds]
    );
    for (const userId of userIds) {
      result.set(userId, DEFAULT_NOTIFICATION_CHANNEL);
    }
    for (const row of rows) {
      result.set(row.user_id, row.channel);
    }
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
