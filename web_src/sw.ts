/// <reference lib="webworker" />
// We export an empty object to force TS to treat this as a module
export default null;
declare const self: ServiceWorkerGlobalScope;
declare const __COMMIT_TIME__: string;
declare const __WORKER_URL__: string;

const CACHE_NAME = `mmm-pwa-${typeof __COMMIT_TIME__ !== 'undefined' && __COMMIT_TIME__ ? __COMMIT_TIME__.replace(/\s+/g, '-') : 'v1'}`;

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.webmanifest',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/icon-maskable-512x512.png',
  './assets/icons/shortcut-minus.png',
  './assets/icons/shortcut-plus.png',
];

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    (async (): Promise<void> => {
      const cache = await caches.open(CACHE_NAME);
      const toCache = [...PRECACHE_ASSETS];
      if (typeof __WORKER_URL__ !== 'undefined' && __WORKER_URL__) {
        toCache.push(__WORKER_URL__);
      }

      // Pre-cache core static assets
      await cache.addAll(toCache).catch((err: unknown) => {
        console.warn('Service Worker: Error pre-caching static assets', err);
      });

      // Pre-cache Google Fonts CSS and font binaries (.woff2)
      try {
        const fontCssResponse = await fetch(GOOGLE_FONTS_URL);
        if (fontCssResponse.ok) {
          await cache.put(GOOGLE_FONTS_URL, fontCssResponse.clone());
          const cssText = await fontCssResponse.text();
          const fontUrlMatches = cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g);
          const fontFileUrls: string[] = [];
          for (const match of fontUrlMatches) {
            if (match[1]) {
              fontFileUrls.push(match[1]);
            }
          }
          if (fontFileUrls.length > 0) {
            await Promise.all(
              fontFileUrls.map(async (fontUrl) => {
                try {
                  const fontRes = await fetch(fontUrl);
                  if (fontRes.ok || fontRes.type === 'opaque') {
                    await cache.put(fontUrl, fontRes);
                  }
                } catch (err: unknown) {
                  console.warn('Service Worker: Failed to pre-cache font file:', fontUrl, err);
                }
              })
            );
          }
        }
      } catch (err: unknown) {
        console.warn('Service Worker: Failed to pre-cache Google Fonts:', err);
      }

      // Parse index.html to discover and pre-cache dynamically hashed scripts and stylesheets
      try {
        const response = await fetch('./index.html');
        if (response.ok) {
          const html = await response.text();
          const dynamicAssets: string[] = [];

          // Match script src
          const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/g);
          for (const match of scriptMatches) {
            const src = match[1];
            if (src && !src.startsWith('http://') && !src.startsWith('https://')) {
              dynamicAssets.push(src);
            }
          }

          // Match link href (stylesheets, manifest, etc.)
          const linkMatches = html.matchAll(/<link[^>]+href=["']([^"']+)["']/g);
          for (const match of linkMatches) {
            const href = match[1];
            if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
              dynamicAssets.push(href);
            }
          }

          const uniqueAssets = Array.from(new Set(dynamicAssets));
          if (uniqueAssets.length > 0) {
            await cache.addAll(uniqueAssets);
          }
        }
      } catch (err: unknown) {
        console.warn('Service Worker: Failed to discover dynamic assets from index.html', err);
      }
    })()
  );
  // Force waiting service worker to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async (): Promise<void> => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Skip caching external API requests
  if (
    url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('tinkoff.ru') ||
    url.pathname.startsWith('/proxy')
  ) {
    return;
  }

  // 1. Navigation requests (HTML document) - Network-first with cache fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async (): Promise<Response> => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
            cache.put('./index.html', networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedResponse =
            (await caches.match(request)) ||
            (await caches.match('./index.html')) ||
            (await caches.match('/index.html')) ||
            (await caches.match('./')) ||
            (await caches.match('/'));

          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        }
      })()
    );
    return;
  }

  // 2. Same-origin assets (JS, CSS, images, worker, manifest) - Cache-first with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async (): Promise<Response> => {
        const cachedResponse = await caches.match(request, { ignoreSearch: true });
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err: unknown) {
          const fallback = await caches.match(request);
          if (fallback) {
            return fallback;
          }
          throw err;
        }
      })()
    );
    return;
  }

  // 3. Third-party static assets (e.g. Google Fonts) - Cache-first with network fallback & background update
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      (async (): Promise<Response> => {
        const cachedResponse = (await caches.match(request)) || (await caches.match(request.url));
        if (cachedResponse) {
          // If online, update cache in background (Stale-While-Revalidate)
          fetch(request)
            .then(async (networkResponse) => {
              if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, networkResponse);
              }
            })
            .catch(() => {
              // Ignore background fetch failure when offline
            });
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          if (cachedResponse) return cachedResponse;
          return new Response('', { status: 408, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // 4. Default: Cache-first
  event.respondWith(
    (async (): Promise<Response> => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const networkResponse = await fetch(request);
      if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })()
  );
});