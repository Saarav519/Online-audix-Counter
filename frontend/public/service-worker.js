// Audix Stock Management - Offline-First Service Worker
// Works completely offline without any internet connection

const CACHE_VERSION = 'v3';
const CACHE_NAME = `audix-app-${CACHE_VERSION}`;

// Install event - just activate immediately
self.addEventListener('install', (event) => {
  console.log('[Audix SW] Installing...');
  self.skipWaiting();
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

// Fetch event - CACHE FIRST, network fallback
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
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Try network
        return fetch(request)
          .then((networkResponse) => {
            // Cache successful responses
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed - return index.html for navigation
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            // Return empty response for other failed requests
            return new Response('', { status: 200 });
          });
      })
  );
});

console.log('[Audix SW] Loaded');
