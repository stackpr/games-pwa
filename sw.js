/*
 * Service worker: precaches the app shell so everything works offline.
 *
 * Bump CACHE_VERSION whenever any precached file changes. The version is
 * appended to every precached URL as ?v=<version>, which makes each new
 * worker fetch a URL nothing has seen before — so a stale copy in the
 * browser's HTTP cache or on a CDN edge (Cloudflare in front of Pages)
 * cannot be reused. Pages request these files without a query string, so
 * the fetch handler matches with ignoreSearch; see below.
 */
const CACHE_VERSION = 'v5';
const CACHE_NAME = `games-pwa-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/games.js',
  'js/install.js',
  'js/version.js',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  // Both the directory URL a link points at and the file it resolves to,
  // so an offline navigation matches without depending on server rewrites.
  'games/scorekeeper/',
  'games/scorekeeper/index.html',
  'games/scorekeeper/scorekeeper.js',
  'games/counter/',
  'games/counter/index.html',
  'games/counter/counter.js'
];

function versioned(url) {
  return `${url}${url.includes('?') ? '&' : '?'}v=${CACHE_VERSION}`;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(
        // cache: 'reload' keeps the HTTP cache out of the picture even if a
        // versioned URL was somehow fetched before.
        PRECACHE_URLS.map(url => new Request(versioned(url), { cache: 'reload' }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Lets a page ask which version is serving it (shown in the footer).
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'version' && event.ports[0]) {
    event.ports[0].postMessage(CACHE_VERSION);
  }
});

// Cache-first for same-origin GET requests, falling back to the network.
// ignoreSearch is load-bearing: it matches a page's request for app.css
// against the precached app.css?v=v4. It also means a game must not rely
// on query strings to serve different content.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
