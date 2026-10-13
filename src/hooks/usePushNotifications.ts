'use client';

import { useCallback, useEffect, useState } from 'react';
import { readSession, supabaseBrowser } from '@/core/supabaseBrowser';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface SubscribeResult {
  ok: boolean;
  error?: string;
}

const FCM_TOKEN_STORAGE_KEY = 'gh_fcm_token';
const FCM_CHANNEL_ID = 'gh_default';
const FCM_CHANNEL_NAME = 'Game notifications';

interface NativePushState {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}

// Native (Capacitor) FCM state lives at module level: every mounted hook
// instance (PushNotificationButton, PushSoftAsk, RelaxPushNudge,
// NotificationPreferencesSection) shares one set of plugin listeners and one
// state snapshot instead of duplicating registration events and token POSTs.
const nativePushState: NativePushState = { supported: false, permission: 'default', subscribed: false };
const nativePushStateListeners = new Set<() => void>();
let nativePlatformPromise: Promise<boolean> | null = null;
let nativeSetupPromise: Promise<void> | null = null;

function emitNativePushState(): void {
  nativePushStateListeners.forEach((listener) => listener());
}

function syncNativePushState(patch: Partial<NativePushState>): void {
  Object.assign(nativePushState, patch);
  emitNativePushState();
}

// Dynamic import keeps Capacitor out of the web bundle's module scope; the
// probe resolves once and is cached for every later call.
function isNativeApp(): Promise<boolean> {
  if (!nativePlatformPromise) {
    nativePlatformPromise = import('@capacitor/core')
      .then(({ Capacitor }) => Capacitor.isNativePlatform())
      .catch(() => false);
  }
  return nativePlatformPromise;
}

async function postFcmToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/push/fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: 'android' }),
    });
    if (response.ok) {
      window.localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
      return true;
    }
  } catch {
    // Network drop: the next 'registration' event retries the POST.
  }
  return false;
}

/**
 * Deep-link guard for 'pushNotificationActionPerformed'. Accepts only a
 * same-app relative path starting with a single '/' (e.g. '/compete/<id>');
 * '//', absolute URLs and every scheme ('https:', 'javascript:', ...) are
 * rejected so a crafted payload cannot navigate the WebView off-origin.
 */
export function resolvePushNotificationUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) {
    return null;
  }
  return url;
}

async function setupNativePush(): Promise<void> {
  const { PushNotifications } = await import('@capacitor/push-notifications');

  const status = await PushNotifications.checkPermissions().catch(() => null);
  const initialPermission: NotificationPermission =
    status?.receive === 'granted' ? 'granted' : status?.receive === 'denied' ? 'denied' : 'default';

  syncNativePushState({
    supported: true,
    permission: initialPermission,
    subscribed: window.localStorage.getItem(FCM_TOKEN_STORAGE_KEY) !== null,
  });

  // gh_default carries every app notification; matches the manifest's
  // default_notification_channel_id and the sender's android.notification.
  await PushNotifications.createChannel({
    id: FCM_CHANNEL_ID,
    name: FCM_CHANNEL_NAME,
    importance: 4,
    visibility: 1,
  }).catch((error) => console.warn('[usePushNotifications] createChannel failed:', error));

  await PushNotifications.addListener('registration', async ({ value: token }) => {
    // Re-POST on every registration event: the server upsert is idempotent and
    // this self-heals server-side deletions; a changed token just overwrites.
    if (await postFcmToken(token)) {
      syncNativePushState({ subscribed: true });
    }
  });

  await PushNotifications.addListener('registrationError', (error) => {
    console.error('[usePushNotifications] FCM registration failed:', error);
    syncNativePushState({ subscribed: false });
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const path = resolvePushNotificationUrl(event.notification?.data?.url);
    if (path) {
      window.location.assign(path);
    }
  });

  // This callback must never call or await a Supabase method (auth-js shared
  // mutex → deadlock): fire-and-forget the deregistration DELETE, then clear
  // the stored token. The route's bearer-token delete works without a session.
  supabaseBrowser.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') {
      return;
    }
    const token = window.localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
    if (token) {
      void fetch('/api/push/fcm-token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        keepalive: true,
      }).catch(() => null);
    }
    syncNativePushState({ subscribed: false });
  });

  // App start with permission already granted and a session: re-register to
  // refresh the token; the 'registration' listener re-POSTs it.
  if (initialPermission === 'granted' && (await readSession())) {
    await PushNotifications.register().catch((error) =>
      console.warn('[usePushNotifications] register refresh failed:', error)
    );
  }
}

function ensureNativePushSetup(): Promise<void> {
  if (!nativeSetupPromise) {
    nativeSetupPromise = setupNativePush().catch((error) => {
      console.warn('[usePushNotifications] native push setup failed:', error);
    });
  }
  return nativeSetupPromise;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    setIsLoading(true);
    if (await isNativeApp()) {
      setPermission(nativePushState.permission);
      setIsSubscribed(nativePushState.subscribed);
      setIsLoading(false);
      return;
    }
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsSubscribed(false);
      setIsLoading(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      setIsSubscribed(subscription !== null);

      if (subscription) {
        const response = await fetch('/api/push/subscribe').catch(() => null);
        if (response?.ok) {
          const data = await response.json().catch(() => ({ subscribed: false }));
          if (!data.subscribed) {
            const json = subscription.toJSON() as unknown as { endpoint: string; keys: PushSubscriptionKeys };
            const { endpoint, keys } = json;
            if (endpoint && keys?.p256dh && keys?.auth) {
              await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint, keys }),
              }).catch(() => null);
            }
          }
        }
      }
    } catch {
      try {
        const response = await fetch('/api/push/subscribe');
        if (!response.ok) {
          setIsSubscribed(false);
          return;
        }
        const data = await response.json().catch(() => ({ subscribed: false }));
        setIsSubscribed(Boolean(data.subscribed));
      } catch {
        setIsSubscribed(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncFromNativeState = () => {
      setPermission(nativePushState.permission);
      setIsSubscribed(nativePushState.subscribed);
      setIsLoading(false);
    };
    nativePushStateListeners.add(syncFromNativeState);

    void isNativeApp().then((native) => {
      if (native) {
        setIsSupported(true);
        void ensureNativePushSetup().then(syncFromNativeState);
        return;
      }
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
      }
      setIsSupported(true);
      setPermission(Notification.permission);
      checkSubscription();
    });

    return () => {
      nativePushStateListeners.delete(syncFromNativeState);
    };
  }, [checkSubscription]);

  const subscribe = useCallback(async (): Promise<SubscribeResult> => {
    if (await isNativeApp()) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const result = await PushNotifications.requestPermissions();
      const permissionResult: NotificationPermission =
        result.receive === 'granted' ? 'granted' : result.receive === 'denied' ? 'denied' : 'default';
      syncNativePushState({ permission: permissionResult });
      if (permissionResult !== 'granted') {
        return { ok: false, error: 'Notification permission was not granted.' };
      }
      await PushNotifications.createChannel({
        id: FCM_CHANNEL_ID,
        name: FCM_CHANNEL_NAME,
        importance: 4,
        visibility: 1,
      });
      // Listeners must be live before register() so the 'registration' event
      // (token POST + subscribed state) is never missed.
      await ensureNativePushSetup();
      await PushNotifications.register();
      return { ok: true };
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, error: 'Push notifications are not supported in this browser.' };
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return { ok: false, error: 'VAPID public key is not configured.' };
    }

    const permissionResult = await Notification.requestPermission();
    setPermission(permissionResult);
    if (permissionResult !== 'granted') {
      return { ok: false, error: 'Notification permission was not granted.' };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch (error) {
        const isBravePushBlocked =
          (error instanceof DOMException && error.name === 'AbortError') ||
          (error instanceof Error && /push service error/i.test(error.message));
        if (isBravePushBlocked) {
          return {
            ok: false,
            error:
              "Push notifications need an extra setting enabled in Brave. Go to brave://settings/privacy and turn on 'Use Google services for push notifications', then try again.",
          };
        }
        throw error;
      }
    }

    const json = subscription.toJSON() as unknown as { endpoint: string; keys: PushSubscriptionKeys };
    const { endpoint, keys } = json;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      console.error('[usePushNotifications] invalid subscription JSON:', JSON.stringify(json));
      return { ok: false, error: 'Invalid push subscription from browser.' };
    }

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, keys }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { ok: false, error: data.error || 'Failed to save push subscription.' };
    }

    await checkSubscription();
    return { ok: true };
  }, [checkSubscription]);

  const unsubscribe = useCallback(async (): Promise<SubscribeResult> => {
    if (await isNativeApp()) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const token = window.localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
      if (token) {
        await fetch('/api/push/fcm-token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }).catch(() => null);
      }
      await PushNotifications.unregister().catch(() => undefined);
      syncNativePushState({ subscribed: false });
      return { ok: true };
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return { ok: false, error: 'Push notifications are not supported in this browser.' };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }

    const response = await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription?.endpoint ?? null }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { ok: false, error: data.error || 'Failed to remove push subscription.' };
    }

    await checkSubscription();
    return { ok: true };
  }, [checkSubscription]);

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
