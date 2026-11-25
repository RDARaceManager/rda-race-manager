/* Imported by the existing service worker; no cache or fetch behaviour changed. */
self.addEventListener('message',event=>{
 if(event.data?.type==='rda-push-version')event.ports?.[0]?.postMessage({version:1});
 if(event.data?.type==='rda-push-activate')event.waitUntil(self.skipWaiting());
});
self.addEventListener('push',event=>{
 let p={};try{p=event.data?.json()||{};}catch{}
 const title=typeof p.title==='string'?p.title.slice(0,75):'RDA Mobile';
 const body=typeof p.body==='string'?p.body.slice(0,300):'Sono disponibili nuovi aggiornamenti RDA.';
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:new URL('assets/rda-icon-192.png?v=rda-logo-v38',self.registration.scope).href,
  badge:new URL('assets/rda-icon-192.png?v=rda-logo-v38',self.registration.scope).href,
  tag:typeof p.id==='string'?p.id.slice(0,90):'rda-mobile-update',
  data:{rdaMobile:true},silent:true,
  actions:typeof Notification!=='undefined'&&Notification.maxActions>0?[{action:'open',title:'Apri RDA Mobile'},{action:'ignore',title:'Ignora'}]:[]
 }));
});
self.addEventListener('notificationclick',event=>{
 if(!event.notification.data?.rdaMobile)return;
 event.notification.close();if(event.action==='ignore')return;
 const home=new URL('./',self.registration.scope).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>c.url.startsWith(self.registration.scope));
  if(existing)return existing.focus();
  return self.clients.openWindow(home);
 })());
});
