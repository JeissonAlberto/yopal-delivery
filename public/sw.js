// LUPIN EXPRESS - SERVICE WORKER (V2.5 RESILIENTE OFFLINE)
const CACHE_NAME = 'lupin-express-v2.5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/styles.css?v=2.5.0',
  '/js/theme.js?v=2.5.0',
  '/js/auth.js?v=2.5.0',
  '/assets/logo.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/client/index.html',
  '/client/app.js?v=2.5.0',
  '/driver/index.html',
  '/driver/app.js?v=2.5.0',
  '/merchant/index.html',
  '/merchant/app.js?v=2.5.0',
  '/admin/index.html',
  '/admin/app.js?v=2.5.0'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('SW cache skip:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/') || e.request.url.includes('/socket.io/')) {
    return; // Pass dynamic network calls directly
  }

  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
      });
    })
  );
});
