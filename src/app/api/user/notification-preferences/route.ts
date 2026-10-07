import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import {
  USER_CONFIGURABLE_NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_CHANNEL,
  isNotificationType,
  isNotificationChannel,
  type NotificationType,
  type NotificationChannel,
} from "@/core/notificationTypes";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error: dbError } = await supabase
      .from("notification_preferences")
      .select("type, channel")
      .eq("user_id", user.id);

    if (dbError) {
      console.error(
        "[notification-preferences] GET failed to fetch preferences:",
        dbError
      );
      return NextResponse.json(
        { error: "Failed to load notification preferences" },
        { status: 500 }
      );
    }

    const stored = new Map<string, NotificationChannel>();
    for (const row of data ?? []) {
      stored.set(row.type as string, row.channel as NotificationChannel);
    }

    const preferences = USER_CONFIGURABLE_NOTIFICATION_TYPES.map((type) => ({
      type,
      channel: stored.get(type) ?? DEFAULT_NOTIFICATION_CHANNEL,
    }));

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("[notification-preferences] GET unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, channel } = body as { type?: string; channel?: string };

  if (typeof type !== "string" || typeof channel !== "string") {
    return NextResponse.json(
      { error: "type and channel are required strings" },
      { status: 400 }
    );
  }

  if (!isNotificationType(type)) {
    return NextResponse.json(
      { error: `Unknown notification type: ${type}` },
      { status: 400 }
    );
  }

  if (
    !(USER_CONFIGURABLE_NOTIFICATION_TYPES as readonly string[]).includes(type)
  ) {
    return NextResponse.json(
      {
        error: `Notification type ${type} is not yet user-configurable`,
      },
      { status: 400 }
    );
  }

  if (!isNotificationChannel(channel)) {
    return NextResponse.json(
      { error: `Invalid notification channel: ${channel}` },
      { status: 400 }
    );
  }

  try {
    const { error: upsertError } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: user.id, type: type as NotificationType, channel: channel as NotificationChannel },
        { onConflict: "user_id,type" }
      );

    if (upsertError) {
      console.error(
        "[notification-preferences] PATCH upsert failed:",
        upsertError
      );
      return NextResponse.json(
        { error: "Failed to save notification preference" },
        { status: 500 }
      );
    }

    return NextResponse.json({ type, channel });
  } catch (error) {
    console.error("[notification-preferences] PATCH unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
