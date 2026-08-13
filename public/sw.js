const SW_VERSION = '__SW_VERSION__';

const ASSET_CACHE = `gh-assets-${SW_VERSION}`;
const API_CACHE = `gh-api-${SW_VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('gh-') && key !== ASSET_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate' || url.pathname === '/';
  const isApi = url.pathname.startsWith('/api/');
  const isStaticAsset =
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/static');

  if (isNavigation || isApi) {
    event.respondWith(networkFirst(request));
  } else if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      await cache.put(request, networkResponse.clone()).catch(() => {});
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cachedResponse = await cache.match(request);
  const networkResponsePromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cachedResponse);
  return cachedResponse || networkResponsePromise;
}

self.addEventListener('push', () => {
  // Inert placeholder: push/notificationclick handlers are stubs pending
  // VAPID backend wiring (future task).
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Inert placeholder; future implementation will open the relevant route.
});
