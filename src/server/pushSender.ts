import { sendNotification, setVapidDetails, WebPushError } from 'web-push';
import { createSupabaseServerClient } from '@/core/supabaseServer';

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

function initializeVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (subject && publicKey && privateKey) {
    setVapidDetails(subject, publicKey, privateKey);
    return true;
  }

  console.warn('[pushSender] VAPID keys not configured; push notifications will be skipped.');
  return false;
}

let vapidInitialized = false;

export async function sendPushToUser(userId: string, payload: PushPayload) {
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

    const payloadString = JSON.stringify(payload);
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
          await sendNotification(pushSubscription, payloadString);
        } catch (error) {
          const webPushError = error as WebPushError;
          const statusCode = webPushError?.statusCode;

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
          } else {
            console.error('[pushSender] sendNotification failed for', sub.id, webPushError?.message || error);
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
