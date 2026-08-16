'use client';

import { useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushNotificationButton() {
  const { isSupported, permission, isSubscribed, subscribe, unsubscribe } = usePushNotifications();
  const [status, setStatus] = useState<string | null>(null);

  if (!isSupported) {
    return null;
  }

  const label = permission === 'granted' && isSubscribed
    ? 'Disable push notifications'
    : 'Enable push notifications';

  async function handleClick() {
    setStatus(null);
    try {
      if (isSubscribed) {
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
      <button type="button" onClick={handleClick}>
        {label}
      </button>
      {status && <span style={{ marginLeft: 8, fontSize: 12 }}>{status}</span>}
    </div>
  );
}
