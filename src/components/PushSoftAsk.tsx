'use client';

import { useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface PushSoftAskProps {
  playerId: string;
  isNewUserForWelcome: boolean;
  welcomeCompleted: boolean;
  pushSoftAskDismissed: boolean;
  onDismissed: () => void;
}

export function PushSoftAsk(props: PushSoftAskProps) {
  const { subscribe, isSupported, permission, isSubscribed, isLoading } = usePushNotifications();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The soft-ask is shown once at first login and never again.
  if (
    !props.isNewUserForWelcome ||
    !props.welcomeCompleted ||
    props.pushSoftAskDismissed ||
    !isSupported ||
    permission === 'denied' ||
    isSubscribed ||
    isLoading
  ) {
    return null;
  }

  async function markDismissed() {
    const res = await fetch('/api/user/push-soft-ask', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update preference');
    }
  }

  async function handleNotNow() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await markDismissed();
      props.onDismissed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  async function handleEnable() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      // subscribe() resolves after the native permission prompt is handled.
      // The result may be success, denial, or dismissal -- in every case we
      // mark the soft-ask as dismissed so the prompt never appears again.
      await subscribe();
      await markDismissed();
      props.onDismissed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          backgroundColor: '#1a1d29',
          borderRadius: 16,
          padding: 24,
          color: '#fff',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>
          Enable push notifications?
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.5, color: '#b8bed4' }}>
          Get notified when a friend invites you to a game. You can change this anytime in settings.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleNotNow}
            disabled={pending}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'transparent',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={pending}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 999,
              border: 'none',
              backgroundColor: '#f97316',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            Enable
          </button>
        </div>
        {error && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#ff6b6b' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
