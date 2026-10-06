const CACHE='salone-class-room-curriculum-fix-20261006-2';
const APP_SHELL=['/','/index.html','/offline.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Keep the admin dashboard and API calls completely outside PWA caching.
  if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html' ||
      url.pathname.startsWith('/admin/') || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Online: always prefer the current deployed file. Offline: use the last good copy.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return (await cache.match('/index.html')) || (await cache.match('/offline.html'));
      }
      return Response.error();
    }
  })());
});
