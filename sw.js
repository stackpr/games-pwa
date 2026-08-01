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
const CACHE_VERSION = 'v18';
const CACHE_NAME = `games-pwa-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/players.css',
  'css/dice.css',
  'css/modal.css',
  'css/party.css',
  'css/cards.css',
  'js/lib/store.js',
  'js/lib/dice.js',
  'js/lib/modal.js',
  'js/lib/vocab.js',
  'js/lib/timer.js',
  'js/lib/names.js',
  'js/lib/party.js',
  'js/lib/setup.js',
  'js/lib/deck.js',
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
  'games/counter/counter.js',
  'games/four-in-a-row/',
  'games/four-in-a-row/index.html',
  'games/four-in-a-row/four-in-a-row.js',
  'games/tic-tac-toe/',
  'games/tic-tac-toe/index.html',
  'games/tic-tac-toe/tic-tac-toe.js',
  'games/ten-thousand/',
  'games/ten-thousand/index.html',
  'games/ten-thousand/ten-thousand.js',
  'games/dice/',
  'games/dice/index.html',
  'games/dice/dice.js',
  'games/spades/',
  'games/spades/index.html',
  'games/spades/spades.js',
  'games/checkers/',
  'games/checkers/index.html',
  'games/checkers/checkers.js',
  'games/reversi/',
  'games/reversi/index.html',
  'games/reversi/reversi.js',
  'games/mancala/',
  'games/mancala/index.html',
  'games/mancala/mancala.js',
  'games/forbidden-words/',
  'games/forbidden-words/index.html',
  'games/forbidden-words/forbidden-words.js',
  'games/star-words/',
  'games/star-words/index.html',
  'games/star-words/star-words.js',
  'games/what-am-i/',
  'games/what-am-i/index.html',
  'games/what-am-i/what-am-i.js',
  'games/pitch/',
  'games/pitch/index.html',
  'games/pitch/pitch.js',
  'games/somewhere-between/',
  'games/somewhere-between/index.html',
  'games/somewhere-between/somewhere-between.js',
  'games/blackjack/',
  'games/blackjack/index.html',
  'games/blackjack/blackjack.js'
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
