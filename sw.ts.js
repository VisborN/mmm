"use strict";
(() => {
  // sw.ts
  var sw_default = null;
  var CACHE_NAME = "pwa-cache-v3";
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
    if (event.request.method !== "GET") {
      return;
    }
    event.respondWith(
      new Promise((resolve, reject) => {
        let networkHandled = false;
        const timeoutId = setTimeout(() => {
          caches.match(event.request).then((cachedResponse) => {
            if (!networkHandled && cachedResponse) {
              resolve(cachedResponse);
            }
          });
        }, 200);
        fetch(event.request).then((networkResponse) => {
          networkHandled = true;
          clearTimeout(timeoutId);
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          resolve(networkResponse);
        }).catch((error) => {
          if (!networkHandled) {
            caches.match(event.request).then((cachedResponse) => {
              if (cachedResponse) {
                resolve(cachedResponse);
              } else {
                reject(error);
              }
            });
          }
        });
      })
    );
  });
})();
//# sourceMappingURL=sw.ts.js.map
