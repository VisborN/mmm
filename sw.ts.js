"use strict";
(() => {
  // sw.ts
  var sw_default = null;
  var CACHE_NAME = "pwa-cache-v2";
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        console.log("Service Worker: Caching root index");
        return cache.addAll(["./"]);
      })
    );
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log("Service Worker: Clearing Old Cache", cache);
              return caches.delete(cache);
            }
          })
        );
      }).then(() => self.clients.claim())
      // Claim all clients immediately
    );
  });
  self.addEventListener("fetch", (event) => {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || event.request.method !== "GET") {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
  });
})();
//# sourceMappingURL=sw.ts.js.map
