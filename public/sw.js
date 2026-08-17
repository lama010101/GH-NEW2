const SW_VERSION = '__SW_VERSION__';
const CACHE_PREFIX = 'gh-cache-v1';
const ACTIVE_CACHE = `${CACHE_PREFIX}-${SW_VERSION}`;

const DB_NAME = 'gh-sw';
const DB_VERSION = 1;
const STORE_NAME = 'meta';
const VERSION_KEY = 'sw-version';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredVersion() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(VERSION_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setStoredVersion(version) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(version, VERSION_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const stored = await getStoredVersion();
      if (stored !== SW_VERSION) {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== ACTIVE_CACHE)
          .map((key) => caches.delete(key))
      );
      await setStoredVersion(SW_VERSION);
    })()
  );
});

self.addEventListener('push', (event) => {
  console.log('[sw] push event received', { hasData: !!event.data, timestamp: Date.now() });

  let payload = {};
  try {
    payload = event.data?.json?.() || {};
    if (event.data) {
      console.log('[sw] push payload parsed', payload);
    }
  } catch (err) {
    console.warn('[SW] push event data could not be parsed as JSON');
    console.error('[sw] push payload parse error', { message: err?.message, stack: err?.stack, error: err });
  }

  const title = payload.title || 'Guess History';
  const options = {
    body: payload.body || '',
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    data: { url: payload.url || '/' },
  };

  console.log('[sw] calling showNotification', { title, options });

  event.waitUntil(
    self.registration.showNotification(title, options).then(
      () => {
        console.log('[sw] showNotification resolved');
      },
      (err) => {
        console.error('[sw] showNotification REJECTED', { message: err?.message, stack: err?.stack, error: err });
        throw err;
      }
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification?.data?.url;
  if (url) {
    event.waitUntil(self.clients.openWindow(url));
  } else {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clientList) => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return self.clients.openWindow('/');
      })
    );
  }
});
