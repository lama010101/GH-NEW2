'use client';

import { useCallback, useEffect, useState } from 'react';

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

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    setIsLoading(true);
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
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }
    setIsSupported(true);
    setPermission(Notification.permission);
    checkSubscription();
  }, [checkSubscription]);

  const subscribe = useCallback(async (): Promise<SubscribeResult> => {
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
