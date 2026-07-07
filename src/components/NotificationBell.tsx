'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

function timeAgo(iso: string, t: (key: string, params?: Record<string, number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return t('just_now');
  if (diff < 3600000) return t('m_ago', { n: Math.floor(diff / 60000) });
  if (diff < 86400000) return t('h_ago', { n: Math.floor(diff / 3600000) });
  return t('d_ago', { n: Math.floor(diff / 86400000) });
}

function NotificationItem({
  notification,
  onClose,
}: {
  notification: Notification;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('notifications');
  const tHome = useTranslations('home');

  if (notification.type === 'lobby_invite') {
    const inviterName = (notification.payload.inviter_name as string) ?? t('someone');
    const gameId = notification.payload.game_id as string;
    const mode = notification.payload.mode as ('sync' | 'async' | undefined);
    const modeLabel = mode
      ? (mode === 'sync' ? tHome('compete_mode_rush') : tHome('compete_mode_relax'))
      : null;

    return (
      <div className={styles.notifItem}>
        {notification.read === false && <span className={styles.unreadDot} />}
        <div className={styles.notifBody}>
          <div className={styles.notifText}>
            {modeLabel ? `${inviterName} · ${modeLabel}` : inviterName}
          </div>
          <div className={styles.notifTime}>{t('sent', { time: timeAgo(notification.created_at, t) })}</div>
          <button
            type="button"
            className={styles.joinBtn}
            onClick={() => {
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

  return (
    <div className={styles.notifItem}>
      {notification.read === false && <span className={styles.unreadDot} />}
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

  async function markAsRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
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

  function toggleOpen() {
    if (!open) {
      setOpen(true);
    } else {
      markAsRead();
      setOpen(false);
    }
  }

  const showBell = !onlyShowWhenUnread || unreadCount > 0;

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`.trim()}>
      {showBell && (
      <button type="button" className={styles.bellBtn} onClick={toggleOpen}>
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
            <button type="button" onClick={() => toggleOpen()}>
              ✕
            </button>
          </div>
          <div className={styles.drawerList}>
            {notifications.filter(n => !n.read).length === 0 && (
              <div className={styles.empty}>{t('empty')}</div>
            )}
            {notifications.filter(n => !n.read).map((n) => (
              <NotificationItem key={n.id} notification={n} onClose={() => toggleOpen()} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
