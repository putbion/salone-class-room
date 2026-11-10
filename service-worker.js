const CACHE='salone-class-room-sync-release-20261110-h';
const APP_SHELL=['/','/index.html','/offline.html'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL.map(path => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('salone-class-room-') && key !== CACHE).map(key => caches.delete(key)));
    // Start the navigation without waiting for it. Its fetch can only run
    // after the worker finishes activating.
    for (const client of clients) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin && ['/', '/index.html'].includes(url.pathname)) {
        client.navigate(client.url).catch(() => {});
      }
    }
  })());
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
      if (response && response.ok && !url.pathname.endsWith('.html') && request.mode !== 'navigate') {
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
