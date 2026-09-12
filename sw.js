const CACHE='rda-web-v1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./data.js','./manifest.webmanifest','./assets/rda-mark.png','./assets/calendario-settembre-2026.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
