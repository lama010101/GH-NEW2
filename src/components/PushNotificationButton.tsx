'use client';

import { useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushNotificationButton() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
  const [status, setStatus] = useState<string | null>(null);

  if (!isSupported) {
    return null;
  }

  const effectivelySubscribed = permission === 'granted' && isSubscribed;
  const label = effectivelySubscribed
    ? 'Disable push notifications'
    : 'Enable push notifications';

  async function handleClick() {
    if (isLoading) return;
    setStatus(null);
    try {
      if (effectivelySubscribed) {
        const result = await unsubscribe();
        setStatus(result.ok ? 'Push notifications disabled.' : result.error || 'Failed to disable.');
      } else {
        const result = await subscribe();
        setStatus(result.ok ? 'Push notifications enabled.' : result.error || 'Failed to enable.');
      }
    } catch (error) {
      console.error('[PushNotificationButton] unexpected error:', error);
      setStatus('An unexpected error occurred.');
    }
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={isLoading}>
        {isLoading ? 'Loading...' : label}
      </button>
      {status && <span style={{ marginLeft: 8, fontSize: 12 }}>{status}</span>}
    </div>
  );
}
