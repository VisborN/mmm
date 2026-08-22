"use strict";
(() => {
  // sw.ts
  var sw_default = null;
  var CACHE_NAME = `mmm-pwa-${"2026-08-22 19:25:36 +0300" ? "2026-08-22 19:25:36 +0300".replace(/\s+/g, "-") : "v1"}`;
  var PRECACHE_ASSETS = [
    "./",
    "./index.html",
    "./app.webmanifest",
    "./assets/icons/icon-192x192.png",
    "./assets/icons/icon-512x512.png",
    "./assets/icons/icon-maskable-512x512.png",
    "./assets/icons/shortcut-minus.png",
    "./assets/icons/shortcut-plus.png"
  ];
  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const toCache = [...PRECACHE_ASSETS];
        if ("/domain/recalculate_worker-KNJTZRHR.js") {
          toCache.push("/domain/recalculate_worker-KNJTZRHR.js");
        }
        await cache.addAll(toCache).catch((err) => {
          console.warn("Service Worker: Error pre-caching static assets", err);
        });
        try {
          const response = await fetch("./index.html");
          if (response.ok) {
            const html = await response.text();
            const dynamicAssets = [];
            const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/g);
            for (const match of scriptMatches) {
              const src = match[1];
              if (src && !src.startsWith("http://") && !src.startsWith("https://")) {
                dynamicAssets.push(src);
              }
            }
            const linkMatches = html.matchAll(/<link[^>]+href=["']([^"']+)["']/g);
            for (const match of linkMatches) {
              const href = match[1];
              if (href && !href.startsWith("http://") && !href.startsWith("https://")) {
                dynamicAssets.push(href);
              }
            }
            const uniqueAssets = Array.from(new Set(dynamicAssets));
            if (uniqueAssets.length > 0) {
              await cache.addAll(uniqueAssets);
            }
          }
        } catch (err) {
          console.warn("Service Worker: Failed to discover dynamic assets from index.html", err);
        }
      })()
    );
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log("Service Worker: Clearing Old Cache", cache);
              return caches.delete(cache);
            }
          })
        );
        await self.clients.claim();
      })()
    );
  });
  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") {
      return;
    }
    const url = new URL(request.url);
    if (url.hostname === "www.googleapis.com" || url.hostname === "accounts.google.com" || url.hostname.includes("tinkoff.ru") || url.pathname.startsWith("/proxy")) {
      return;
    }
    if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
      event.respondWith(
        (async () => {
          try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(request, networkResponse.clone());
              cache.put("./index.html", networkResponse.clone());
            }
            return networkResponse;
          } catch {
            const cachedResponse = await caches.match(request) || await caches.match("./index.html") || await caches.match("/index.html") || await caches.match("./") || await caches.match("/");
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
          }
        })()
      );
      return;
    }
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(request, { ignoreSearch: true }) || await caches.match(request.url);
        if (cachedResponse) {
          return cachedResponse;
        }
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === "opaque")) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          const fallback = await caches.match(request);
          if (fallback) {
            return fallback;
          }
          throw err;
        }
      })()
    );
  });
})();
//# sourceMappingURL=sw.ts.js.map
