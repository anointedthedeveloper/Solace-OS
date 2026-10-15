/* Solace OS service worker: makes the desktop shell load offline.
 * - Navigations: network first, falling back to the cached shell (so a refresh offline still works).
 * - Hashed build assets (/assets/*): cache first (they are immutable).
 * - /api/* is NEVER cached or intercepted: server data and cloud files need the network.
 * Local features (notes, tasks, files in this browser…) work offline because their data is in IndexedDB. */
const VERSION = 'solace-shell-v1';
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll([SCOPE, SCOPE + 'manifest.webmanifest', SCOPE + 'favicon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(SCOPE, copy));
        return res;
      }).catch(() => caches.match(SCOPE)),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && (url.pathname.includes('/assets/') || /\.(svg|webmanifest)$/.test(url.pathname))) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
