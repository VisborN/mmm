/// <reference lib="webworker" />
// We export an empty object to force TS to treat this as a module
export default null;
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME: string = 'pwa-cache-v1';
const ASSETS: string[] = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache: Cache) => {
      console.log('Service Worker: Caching files');
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames: string[]) => {
      return Promise.all(
        cacheNames.map((cache: string) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(
    caches.match(event.request).then((response: Response | undefined) => {
      return response || fetch(event.request);
    })
  );
});