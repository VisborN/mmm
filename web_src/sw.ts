/// <reference lib="webworker" />
// We export an empty object to force TS to treat this as a module
export default null;
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME: string = 'pwa-cache-v2';

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache: Cache) => {
      console.log('Service Worker: Caching root index');
      // We no longer pre-cache app.js here since the filename is dynamically hashed.
      // We will cache assets as they are fetched.
      return cache.addAll(['./']);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames: string[]) => {
      return Promise.all(
        cacheNames.map((cache: string) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Claim all clients immediately
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  // Cache-first strategy for static assets, network-first for index
  event.respondWith(
    caches.match(event.request).then((cachedResponse: Response | undefined) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Don't cache non-successful responses or non-GET requests
        if (!networkResponse || networkResponse.status !== 200 || event.request.method !== 'GET') {
          return networkResponse;
        }

        // Cache the dynamically fetched assets (like hashed JS files)
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});