'use client';

import { useEffect, useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface RelaxPushNudgeProps {
  /** Called when the nudge is done (dismissed, enabled, or conditions not met). */
  onComplete: () => void;
}

/**
 * Relax session-start push nudge. Shown once per user when they start a Relax
 * session, ONLY if they are not currently subscribed to push (server-truth
 * check via GET /api/push/subscribe) and have not previously dismissed this
 * nudge (DB-backed flag via GET /api/user/relax-push-nudge).
 *
 * On any dismissal path ("Not now", close, or "Enable" regardless of the
 * native permission outcome), the dedicated relax_push_nudge_dismissed flag
 * is set to true so the nudge never appears again for that user.
 *
 * This is a SEPARATE component from PushSoftAsk.tsx (first-login soft-ask)
 * and uses a SEPARATE DB column (relax_push_nudge_dismissed vs
 * push_soft_ask_dismissed). The two flows are completely independent.
 */
export function RelaxPushNudge({ onComplete }: RelaxPushNudgeProps) {
  const { subscribe, isSupported, permission } = usePushNotifications();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, check server-truth subscription state + DB dismissal flag.
  // Only show the nudge if the user is genuinely unsubscribed AND not dismissed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [subRes, nudgeRes] = await Promise.all([
          fetch('/api/push/subscribe'),
          fetch('/api/user/relax-push-nudge'),
        ]);
        if (!subRes.ok || !nudgeRes.ok) {
          if (!cancelled) onComplete();
          return;
        }
        const subData = await subRes.json().catch(() => ({ subscribed: false }));
        const nudgeData = await nudgeRes.json().catch(() => ({ relax_push_nudge_dismissed: true }));
        if (cancelled) return;
        if (subData.subscribed || nudgeData.relax_push_nudge_dismissed) {
          onComplete();
          return;
        }
        setVisible(true);
      } catch {
        if (!cancelled) onComplete();
      }
    })();
    return () => { cancelled = true; };
  }, [onComplete]);

  async function markDismissed() {
    const res = await fetch('/api/user/relax-push-nudge', {
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
      onComplete();
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
      // The result may be success, denial, or dismissal — in every case we
      // mark the nudge as dismissed so it never appears again.
      await subscribe();
      await markDismissed();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  if (!visible || !isSupported || permission === 'denied') {
    return null;
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
          Get notified when it&apos;s your turn in Relax games. You can change this anytime in settings.
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
