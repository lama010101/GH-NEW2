'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { acceptInvitation } from '@/components/home/CompetePanel';
import { PushNotificationButton } from './PushNotificationButton';
import styles from './NotificationBell.module.css';

interface NotificationBellProps {
  className?: string;
  onlyShowWhenUnread?: boolean;
}

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

function timeAgo(iso: string, t: (key: string, params?: Record<string, number | string>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return t('just_now');
  if (diff < 3600000) return t('m_ago', { n: Math.floor(diff / 60000) });
  if (diff < 86400000) return t('h_ago', { n: Math.floor(diff / 3600000) });
  return t('d_ago', { n: Math.floor(diff / 86400000) });
}

function NotificationItem({
  notification,
  onClose,
  onMarkRead,
}: {
  notification: Notification;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const router = useRouter();
  const t = useTranslations('notifications');
  const tHome = useTranslations('home');
  const itemClass = `${styles.notifItem} ${notification.read ? styles.read : styles.unread}`;

  if (notification.type === 'lobby_invite') {
    const inviterName = (notification.payload.inviter_name as string) ?? t('someone');
    const gameId = notification.payload.game_id as string;
    const invitationId = notification.payload.invitation_id as string;
    const mode = notification.payload.mode as ('sync' | 'async' | undefined);
    const modeLabel = mode
      ? (mode === 'sync' ? tHome('compete_mode_rush') : tHome('compete_mode_relax'))
      : null;

    return (
      <div className={itemClass}>
        {!notification.read && <span className={styles.unreadDot} />}
        <div className={styles.notifBody}>
          <div className={styles.notifText}>
            {modeLabel ? `${inviterName} · ${modeLabel}` : inviterName}
          </div>
          <div className={styles.notifTime}>{t('sent', { time: timeAgo(notification.created_at, t) })}</div>
          <button
            type="button"
            className={styles.joinBtn}
            onClick={async () => {
              if (invitationId) {
                const result = await acceptInvitation(invitationId);
                if (!result.ok) {
                  console.error('[NotificationBell] acceptInvitation failed:', result.error, result.code);
                  return;
                }
              }
              onMarkRead(notification.id);
              router.push(`/compete/${gameId}`);
              onClose();
            }}
          >
            {t('join_game')}
          </button>
        </div>
      </div>
    );
  }

  if (notification.type === 'session_complete') {
    const completerName = (notification.payload.completing_player_name as string) ?? t('someone');
    const gameId = notification.payload.game_id as string;

    return (
      <div className={itemClass}>
        {!notification.read && <span className={styles.unreadDot} />}
        <div className={styles.notifBody}>
          <div className={styles.notifText}>
            {t('session_complete', { name: completerName })}
          </div>
          <div className={styles.notifTime}>{timeAgo(notification.created_at, t)}</div>
          <button
            type="button"
            className={styles.joinBtn}
            onClick={() => {
              onMarkRead(notification.id);
              router.push(`/compete/${gameId}`);
              onClose();
            }}
          >
            {t('view_results')}
          </button>
        </div>
      </div>
    );
  }

  function handleItemKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onMarkRead(notification.id);
    }
  }

  return (
    <div
      className={itemClass}
      onClick={() => onMarkRead(notification.id)}
      onKeyDown={handleItemKeyDown}
      role="button"
      tabIndex={0}
    >
      {!notification.read && <span className={styles.unreadDot} />}
      <div className={styles.notifBody}>
        <div className={styles.notifText}>{notification.type}</div>
        <div className={styles.notifTime}>{timeAgo(notification.created_at, t)}</div>
      </div>
    </div>
  );
}

export default function NotificationBell({ className, onlyShowWhenUnread }: NotificationBellProps) {
  const t = useTranslations('notifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    if (document.hidden) return;
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unread_count ?? 0);
      }
    } catch {
      // ignore fetch errors
    }
  }

  async function markOneRead(id: string) {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.read) return;
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // ignore mark-as-read errors
    }
  }

  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications();
    }, 15000);

    const handleFocus = () => {
      fetchNotifications();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((prev) => !prev);
  }

  const showBell = !onlyShowWhenUnread || unreadCount > 0;

  return (
    <div ref={wrapperRef} className={`${styles.wrapper} ${className ?? ''}`.trim()}>
      {showBell && (
      <button
        type="button"
        className={styles.bellBtn}
        onClick={toggleOpen}
        aria-label={t('title')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      )}

      {open && (
        <div className={styles.drawer}>
          <div className={styles.drawerHeader}>
            <span>{t('title')}</span>
            <button type="button" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div className={styles.pushRow}>
            <PushNotificationButton />
          </div>
          <div className={styles.drawerList}>
            {notifications.length === 0 && (
              <div className={styles.empty}>{t('empty')}</div>
            )}
            {notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} onMarkRead={markOneRead} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
