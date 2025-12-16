
const CACHE_NAME = 'ai-exam-grader-v8'; // Bumped version to invalidate old caches
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Domains that should be cached dynamically (CDNs)
const EXTERNAL_DOMAINS = [
  'cdn.tailwindcss.com',
  'aistudiocdn.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching local assets');
      // We try to cache both / and /index.html to be safe
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Navigation Requests (HTML) - Network First, then Cache, then Fallback
  // This ensures we always try to get the fresh page from the server first.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
           // Only cache valid responses (Status 200) to avoid caching 404s or error pages
           if (response && response.status === 200 && response.type === 'basic') {
               const responseClone = response.clone();
               caches.open(CACHE_NAME).then(cache => {
                   cache.put(event.request, responseClone);
               });
           }
           return response;
        })
        .catch(() => {
          // If network fails (Offline), try cache
          return caches.match(event.request).then(response => {
              if (response) return response;
              
              // SPA Fallback: If the specific URL isn't cached, serve index.html
              // We check both '/' and '/index.html' to be sure
              return caches.match('/')
                .then(rootResp => rootResp || caches.match('/index.html'));
          });
        })
    );
    return;
  }

  // 2. External Assets (CDNs for React, Fonts, Tailwind) - Stale-While-Revalidate
  if (EXTERNAL_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(err => {
             console.warn('[SW] Fetch failed for CDN asset', err);
          });

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Local Static Assets - Cache First, Network Fallback
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

