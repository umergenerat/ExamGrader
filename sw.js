const CACHE_NAME = 'ai-exam-grader-v3'; // Bump version to trigger update
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx', // Cache the main script
  '/manifest.json' // Cache the manifest
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Use addAll for atomic operation
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Ensures the new service worker takes control of the page immediately.
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Use a cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Not in cache - fetch from network and cache it
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response.
            // We don't cache non-GET requests or requests to Chrome extensions.
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || event.request.method !== 'GET') {
              return networkResponse;
            }

            // Clone the response because it's a one-time-use stream
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
            console.error('Fetch failed:', error);
            // Optional: return a fallback page if network fails, e.g.,
            // return caches.match('/offline.html');
        });
      })
  );
});