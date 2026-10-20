import { sendNotification, setVapidDetails, WebPushError } from 'web-push';
import { cert, getApp, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createSupabaseServerClient } from '@/core/supabaseServer';
import { PUSH_TITLE, PUSH_ICON, PUSH_BADGE, PUSH_COLOR } from '@/core/pushBranding';

export interface PushPayload {
  title?: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

// web-push requires VAPID subject to be an https: URL or a mailto: address.
// Production has carried a bare email ("user@example.com") as VAPID_SUBJECT,
// which makes validateSubject() throw inside every sendNotification() call —
// i.e. every send fails. Normalizing a bare email to mailto: keeps the send
// path working without an env change; other values pass through and keep
// web-push's own validation error visible in the per-attempt log.
function normalizeVapidSubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^(https:|mailto:)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return `mailto:${trimmed}`;
  }
  return trimmed;
}

function initializeVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (subject && publicKey && privateKey) {
    setVapidDetails(normalizeVapidSubject(subject), publicKey, privateKey);
    return true;
  }

  console.warn('[pushSender] VAPID keys not configured; push notifications will be skipped.');
  return false;
}

let vapidInitialized = false;

// FCM channel (MOB-BUILD-FCMPUSH-ENDTOEND-1013-002): a Capacitor WebView cannot
// use Web Push, so Android native apps register FCM tokens via fcm_tokens.
// The named app is initialized once; missing env skips the channel silently.
const FCM_APP_NAME = 'gh-fcm';
const FCM_CHANNEL_ID = 'gh_default';
const FCM_NOTIFICATION_ICON = 'ic_stat_notification';

let fcmAppInitialized = false;
let fcmEnvWarned = false;

function getFcmMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    if (!fcmEnvWarned) {
      console.warn('[pushSender] Firebase env not configured; FCM channel skipped.');
      fcmEnvWarned = true;
    }
    return null;
  }

  if (!fcmAppInitialized) {
    initializeApp(
      {
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      },
      FCM_APP_NAME
    );
    fcmAppInitialized = true;
  }

  return getMessaging(getApp(FCM_APP_NAME));
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  // Channels are independent by design: no cross-channel dedup, and one
  // channel failing must never block the other.
  await sendWebPushToUser(userId, payload).catch((error) =>
    console.error('[pushSender] web push channel failed for user', userId, error)
  );
  await sendFcmToUser(userId, payload).catch((error) =>
    console.error('[pushSender] FCM channel failed for user', userId, error)
  );
}

async function sendWebPushToUser(userId: string, payload: PushPayload) {
  try {
    if (!vapidInitialized) {
      vapidInitialized = initializeVapid();
    }

    if (!vapidInitialized) {
      return;
    }

    const supabase = createSupabaseServerClient();
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (error) {
      console.error('[pushSender] failed to load subscriptions for user', userId, error);
      return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return;
    }

    const payloadString = JSON.stringify({
      title: payload.title ?? PUSH_TITLE,
      body: payload.body,
      icon: payload.icon ?? PUSH_ICON,
      badge: payload.badge ?? PUSH_BADGE,
      url: payload.url,
      tag: payload.tag,
    });
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await sendNotification(pushSubscription, payloadString, {
            TTL: payload.ttl ?? 86400,
            urgency: payload.urgency ?? 'normal',
          });
          console.info(`[pushSender] send attempt user=${userId} sub=${sub.id} result=success`);
        } catch (error) {
          const webPushError = error as WebPushError;
          const statusCode = webPushError?.statusCode;
          console.error(
            `[pushSender] send attempt user=${userId} sub=${sub.id} result=failed`,
            `status=${statusCode ?? 'none'}`,
            webPushError?.message || error
          );

          if (statusCode === 410 || statusCode === 404) {
            const { error: deleteError } = await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);

            if (deleteError) {
              console.error('[pushSender] failed to delete stale subscription', sub.id, deleteError);
            } else {
              console.info('[pushSender] deleted stale subscription', sub.id, statusCode);
            }
          }
        }
      })
    );

    const failures = results.filter((r) => r.status === 'rejected').length;
    if (failures > 0) {
      console.error('[pushSender]', failures, 'subscription(s) failed for user', userId);
    }
  } catch (error) {
    console.error('[pushSender] sendPushToUser failed for user', userId, error);
  }
}

async function sendFcmToUser(userId: string, payload: PushPayload) {
  try {
    const messaging = getFcmMessaging();
    if (!messaging) {
      return;
    }

    const supabase = createSupabaseServerClient();
    const { data: tokens, error } = await supabase
      .from('fcm_tokens')
      .select('id, token')
      .eq('user_id', userId);

    if (error) {
      console.error('[pushSender] failed to load fcm_tokens for user', userId, error);
      return;
    }

    if (!tokens || tokens.length === 0) {
      return;
    }

    await Promise.allSettled(
      tokens.map(async (row) => {
        try {
          await messaging.send({
            token: row.token,
            notification: {
              title: payload.title ?? PUSH_TITLE,
              body: payload.body,
            },
            data: {
              ...(payload.url ? { url: payload.url } : {}),
              ...(payload.tag ? { tag: payload.tag } : {}),
            },
            android: {
              // Priority mirrors the web urgency flag (task-065 tuning): high
              // urgency → high FCM priority; TTL seconds → FCM milliseconds.
              priority: payload.urgency === 'high' ? 'high' : 'normal',
              ttl: (payload.ttl ?? 86400) * 1000,
              notification: {
                channelId: FCM_CHANNEL_ID,
                icon: FCM_NOTIFICATION_ICON,
                color: PUSH_COLOR,
                ...(payload.tag ? { tag: payload.tag } : {}),
              },
            },
          });
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            const { error: deleteError } = await supabase
              .from('fcm_tokens')
              .delete()
              .eq('id', row.id);

            if (deleteError) {
              console.error('[pushSender] failed to delete stale fcm_token', row.id, deleteError);
            } else {
              console.info('[pushSender] deleted stale fcm_token', row.id, code);
            }
          } else {
            console.error('[pushSender] FCM send failed for row', row.id, code ?? error);
          }
        }
      })
    );
  } catch (error) {
    console.error('[pushSender] sendFcmToUser failed for user', userId, error);
  }
}
