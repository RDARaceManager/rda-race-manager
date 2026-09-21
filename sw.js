const CACHE = 'rda-pwa-20260921-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './assets/rda-mark.png', './assets/calendario-settembre-2026.jpg',
  './assets/rda-home-hero-v460.png', './assets/rda-icon-192.png',
  './assets/rda-icon-512.png', './assets/rda-icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('rda-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  const file = url.pathname.split('/').pop();
  const fresh = request.mode === 'navigate' || ['data.js', 'index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest'].includes(file);
  if (fresh) {
    event.respondWith(fetch(request, {cache: 'no-store'}).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request)));
  } else {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
