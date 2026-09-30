// Service worker for the HeliCarrier Fleet Performance & Power Assurance app
//
// Strategy: cache the app shell on install, then network-first with a
// cache fallback on every fetch. The app is a single-page application now -
// the Main Menu and every helicopter view (BV234, S-61, AS332, AS332 L2,
// H225) live inside one HTML file and are swapped in/out with JS, so the
// whole app shell is just that one file.

const CACHE_NAME = 'heli-fleet-spa-v8';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache.addAll() is all-or-nothing: if ANY one of these files 404s
      // (wrong filename, wrong case, missed upload), the whole app shell
      // silently fails to cache and the app never works offline - even
      // though every other file was fine. Cache each file independently
      // instead, so one bad/missing file can't sink the rest, and log
      // exactly which one(s) failed for easier debugging.
      Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('SW install: failed to cache', url, err);
            throw err;
          })
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for our own origin; let everything else
  // (e.g. cross-origin font/CDN requests, if any are ever added) pass
  // straight through to the network untouched.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Keep the cache warm with the latest successful response so
        // the offline copy stays up to date.
        const responseCopy = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, responseCopy))
          .catch(() => {});
        return response;
      })
      .catch(() =>
        // Offline (or request failed): serve the cached copy if we
        // have one.
        caches.match(event.request).then((cached) => cached || Promise.reject('no-cache-match'))
      )
  );
});
