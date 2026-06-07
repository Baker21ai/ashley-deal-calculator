/* Deal Depth service worker — dependency-free, offline-capable.
   Strategy:
   - Navigations: network-first, fall back to cached app shell (SPA offline).
   - Same-origin static assets (hash-named JS/CSS/images/fonts): stale-while-revalidate.
   - Cross-origin (Google Fonts): cache-first runtime cache.
   - Never cache the coach API or any non-GET request. */
const VERSION = 'v1';
const SHELL_CACHE = `dd-shell-${VERSION}`;
const ASSET_CACHE = `dd-assets-${VERSION}`;
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/pwa-192.png',
  '/icons/pwa-512.png',
  '/icons/apple-touch-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept the coach function — it must always hit the network fresh.
  if (url.pathname.startsWith('/.netlify/functions/')) return;

  // App navigations: network-first so deploys are picked up, offline falls back to shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets (same-origin and Google Fonts): stale-while-revalidate.
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com';
  if (sameOrigin || isFont) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res && res.status === 200) cache.put(request, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
  }
});
