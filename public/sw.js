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
  console.log('[SW] push event received', event);
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] notificationclick event received', event);
  event.notification.close();
});
