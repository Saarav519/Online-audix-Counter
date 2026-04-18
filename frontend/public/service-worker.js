// Audix Stock Management - Offline-First Service Worker
// Works completely offline without any internet connection

const CACHE_VERSION = 'v5';
const CACHE_NAME = `audix-app-${CACHE_VERSION}`;

// Install event - just activate immediately
self.addEventListener('install', (event) => {
  console.log('[Audix SW] Installing...');
  self.skipWaiting();
});

// Listen for SKIP_WAITING message from page (force immediate activation on update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate event - take control immediately
self.addEventListener('activate', (event) => {
  console.log('[Audix SW] Activating...');
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('audix-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      }),
      // Take control of all pages
      self.clients.claim()
    ])
  );
});

// Fetch event - smart strategy:
// • JS/CSS bundles and navigation → NETWORK-FIRST (fresh code always), fallback to cache
// • Other static assets (images, fonts, etc.) → CACHE-FIRST (fast + offline)
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API calls
  if (request.url.includes('/api/')) {
    return;
  }

  const url = new URL(request.url);
  const isAssetRequest = /\.(js|css|map|html)$/i.test(url.pathname);
  const isNavigate = request.mode === 'navigate';

  if (isAssetRequest || isNavigate) {
    // NETWORK-FIRST for JS/CSS/HTML & navigation — guarantees fresh code
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed → use cache
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            if (isNavigate) return caches.match('/index.html');
            return new Response('', { status: 200 });
          });
        })
    );
    return;
  }

  // CACHE-FIRST for everything else (images, fonts, etc.)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => new Response('', { status: 200 }));
      })
  );
});

console.log('[Audix SW] Loaded');
