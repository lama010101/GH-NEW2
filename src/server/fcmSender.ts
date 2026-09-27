import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createSupabaseServerClient } from "@/core/supabaseServer";

interface FcmPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// FCM tokens live in public.fcm_tokens (separate from the VAPID-specific
// push_subscriptions table). Credentials come from server-side env only —
// never NEXT_PUBLIC_*.
let fcmApp: App | null = null;
let fcmInitAttempted = false;

function initializeFcm(): App | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return getApps().length > 0
      ? getApps()[0]
      : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  console.warn(
    "[fcmSender] Firebase credentials not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY); FCM pushes will be skipped."
  );
  return null;
}

export async function sendFcmPushToUser(userId: string, payload: FcmPushPayload) {
  try {
    if (!fcmInitAttempted) {
      fcmInitAttempted = true;
      fcmApp = initializeFcm();
    }

    if (!fcmApp) {
      return;
    }

    const supabase = createSupabaseServerClient();
    const { data: tokens, error } = await supabase
      .from("fcm_tokens")
      .select("id, token")
      .eq("user_id", userId);

    if (error) {
      console.error("[fcmSender] failed to load tokens for user", userId, error);
      return;
    }

    if (!tokens || tokens.length === 0) {
      return;
    }

    const messaging = getMessaging(fcmApp);
    const results = await Promise.allSettled(
      tokens.map(async (t) => {
        try {
          const messageId = await messaging.send({
            token: t.token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              ...(payload.url ? { url: payload.url } : {}),
              ...(payload.tag ? { tag: payload.tag } : {}),
            },
            android: {
              priority: "high",
              notification: {
                ...(payload.tag ? { tag: payload.tag } : {}),
              },
            },
          });
          console.info("[fcmSender] delivered", t.id, messageId);
        } catch (error) {
          const code = (error as { code?: string })?.code;

          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            const { error: deleteError } = await supabase
              .from("fcm_tokens")
              .delete()
              .eq("id", t.id);

            if (deleteError) {
              console.error("[fcmSender] failed to delete stale token", t.id, deleteError);
            } else {
              console.info("[fcmSender] deleted stale token", t.id, code);
            }
          } else {
            console.error("[fcmSender] messaging.send failed for", t.id, (error as Error)?.message || error);
          }
        }
      })
    );

    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures > 0) {
      console.error("[fcmSender]", failures, "token(s) failed for user", userId);
    }
  } catch (error) {
    console.error("[fcmSender] sendFcmPushToUser failed for user", userId, error);
  }
}
