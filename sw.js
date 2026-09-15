const CACHE='rda-v435-mobile-calendar-flyers';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/rda-mark.png','./assets/calendario-settembre-2026.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);const fresh=/\/(data\.js|index\.html|app\.js|styles\.css|sw\.js)$/.test(u.pathname)||u.pathname.endsWith('/rda-race-manager/');if(fresh)e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));else e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
