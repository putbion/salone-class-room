const CACHE = 'salone-class-room-v7-secure';
const CORE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // STRICT EXCLUSIONS: Never cache backend serverless functions, admin pages, or sensitive endpoints
  const path = url.pathname.toLowerCase();
  if (
    path.startsWith('/.netlify/') ||
    path.startsWith('/admin') ||
    path === '/admin.html' ||
    req.headers.has('authorization') ||
    req.headers.has('x-admin-token')
  ) {
    // Direct network passthrough without caching
    return;
  }

  // Navigation requests: Network-first, fallback to cached page or /offline.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) return offlinePage;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Static assets (images, icons, manifest, fonts): Cache-first with network fallback
  const isStatic = /\.(?:png|jpg|jpeg|svg|webp|ico|webmanifest|css|js|woff2?)$/i.test(path);
  if (isStatic) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // General GET requests for static pages: Network-first with cache fallback
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
