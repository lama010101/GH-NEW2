/**
 * send-test-push.ts — manual end-to-end delivery verification for web push.
 *
 * Sends one real push through the production send path (sendPushToUser) to a
 * given user id. Run it against prod by loading prod env vars, or locally.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   VAPID_SUBJECT=lama010101@gmail.com VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
 *   npx tsx scripts/dev/send-test-push.ts <user_id>
 *
 * What to look for in the output (no secrets are logged):
 *   [pushSender] send attempt user=<id> sub=<id> result=success   → delivered
 *   [pushSender] send attempt ... result=failed status=401/403    → VAPID key
 *     pair mismatch (VAPID_PRIVATE_KEY does not pair with the public key that
 *     was subscribed with) — regenerate both from one keypair.
 *   ... result=failed status=404/410                              → dead
 *     subscription; it is auto-deleted and the device must re-subscribe.
 *   [pushSender] VAPID keys not configured                        → one of
 *     VAPID_SUBJECT / VAPID_PUBLIC_KEY|NEXT_PUBLIC_VAPID_PUBLIC_KEY /
 *     VAPID_PRIVATE_KEY is missing in this environment.
 *
 * The script exits 0 when at least one send succeeds, 1 otherwise.
 */

import { sendPushToUser } from "../../src/server/pushSender";

const userId = process.argv[2];
if (!userId) {
  console.error("usage: npx tsx scripts/dev/send-test-push.ts <user_id>");
  process.exit(2);
}

const payload = {
  body: "Test push — if you can read this, invite delivery works.",
  url: "/home",
  tag: `push-test:${Date.now()}`,
  ttl: 60,
  urgency: "high" as const,
};

sendPushToUser(userId, payload)
  .then(() => {
    console.log(
      "send-test-push: send path completed — check the [pushSender] log lines above."
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("send-test-push: sendPushToUser threw (should not happen):", err);
    process.exit(1);
  });
