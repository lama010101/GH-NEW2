'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushNotificationButton() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState<string | null>(null);

  if (!isSupported) {
    return null;
  }

  const effectivelySubscribed = permission === 'granted' && isSubscribed;
  const label = effectivelySubscribed
    ? t('push_disable')
    : t('push_enable');

  async function handleClick() {
    if (isLoading) return;
    setStatus(null);
    try {
      if (effectivelySubscribed) {
        const result = await unsubscribe();
        setStatus(result.ok ? t('push_disabled_toast') : result.error || t('push_error'));
      } else {
        const result = await subscribe();
        setStatus(result.ok ? t('push_enabled_toast') : result.error || t('push_error'));
      }
    } catch (error) {
      console.error('[PushNotificationButton] unexpected error:', error);
      setStatus(t('push_error'));
    }
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={isLoading}>
        {isLoading ? tCommon('loading') : label}
      </button>
      {status && <span style={{ marginLeft: 8, fontSize: 12 }}>{status}</span>}
    </div>
  );
}
