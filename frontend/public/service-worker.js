// Audix Stock Management - Offline-First Service Worker
// Works completely offline without any internet connection

const CACHE_VERSION = 'v2';
const CACHE_NAME = `audix-app-${CACHE_VERSION}`;
const STATIC_CACHE = `audix-static-${CACHE_VERSION}`;

// Core assets that must be cached for offline use
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

// Install event - cache all core assets immediately
self.addEventListener('install', (event) => {
  console.log('[Audix SW] Installing service worker for offline support...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[Audix SW] Caching core assets for offline use');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => {
        console.log('[Audix SW] Core assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Audix SW] Failed to cache core assets:', error);
      })
  );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  console.log('[Audix SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old version caches
              return name.startsWith('audix-') && 
                     name !== CACHE_NAME && 
                     name !== STATIC_CACHE;
            })
            .map((name) => {
              console.log('[Audix SW] Removing old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[Audix SW] Service worker activated - taking control');
        return self.clients.claim();
      })
  );
});

// Fetch event - OFFLINE FIRST strategy
// 1. Try cache first
// 2. If not in cache, try network
// 3. If network fails, serve cached index.html for navigation
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external URLs (analytics, CDN scripts, etc.) - let them fail silently offline
  if (!url.origin.includes(self.location.origin)) {
    // For external resources, just try network and fail silently
    event.respondWith(
      fetch(request).catch(() => {
        // Return empty response for external scripts that fail
        if (request.destination === 'script') {
          return new Response('// Offline - external script not available', {
            headers: { 'Content-Type': 'application/javascript' }
          });
        }
        return new Response('', { status: 200 });
      })
    );
    return;
  }
  
  // Skip API requests - they should fail naturally when offline
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  // OFFLINE-FIRST: Cache first, then network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Found in cache - return immediately (works offline!)
          console.log('[Audix SW] Serving from cache:', url.pathname);
          
          // Also update cache in background if online (stale-while-revalidate)
          if (navigator.onLine) {
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse);
                  });
                }
              })
              .catch(() => {});
          }
          
          return cachedResponse;
        }
        
        // Not in cache - try network
        return fetch(request)
          .then((networkResponse) => {
            // Don't cache error responses
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            
            // Cache the new response for future offline use
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('[Audix SW] Caching new resource:', url.pathname);
                cache.put(request, responseToCache);
              });
            
            return networkResponse;
          })
          .catch((error) => {
            console.log('[Audix SW] Network failed, checking for fallback:', url.pathname);
            
            // Network failed - serve index.html for navigation requests
            // This allows the React app to handle routing offline
            if (request.mode === 'navigate' || request.destination === 'document') {
              return caches.match('/index.html');
            }
            
            // For other requests, try to serve from any cache
            return caches.match(request);
          });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Force cache update
  if (event.data && event.data.type === 'CACHE_ALL') {
    caches.open(CACHE_NAME).then((cache) => {
      // Cache all current pages
      const pagesToCache = ['/', '/locations', '/scan', '/master-data', '/reports', '/settings'];
      pagesToCache.forEach((page) => {
        fetch(page).then((response) => {
          if (response.ok) {
            cache.put(page, response);
          }
        }).catch(() => {});
      });
    });
  }
});

console.log('[Audix SW] Offline-first service worker loaded');
