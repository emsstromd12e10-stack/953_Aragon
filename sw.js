const CACHE='953-aragon-26b6b34'; // CI replaces this with 953-aragon-<commit> on every deploy
const CORE=['./','./index.html','./app.dc.html','./join.dc.html','./join.html','./support.js','./icons.js','./shipcalc.js','./fitness.js','./exercises.js','./assets/emblem-256.jpg','./assets/emblem-512.jpg','./manifest.webmanifest','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/rules-infographic.jpg','./assets/953-Aragon-Agreement-and-House-Rules.pdf'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));});
// a new version waits until the member taps the in-app update banner (it posts 'skip')
self.addEventListener('message',e=>{ if(e.data==='skip') self.skipWaiting(); });
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!=='953-cdn').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url); if(e.request.method!=='GET') return;
  // React and Babel come from unpkg at exact versions: keep a copy so the app opens with no signal (onboard)
  if(u.origin==='https://unpkg.com'&&/@\d+\.\d+\.\d+\//.test(u.pathname)){ e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{ if(r.ok){ const c=r.clone(); caches.open('953-cdn').then(x=>x.put(e.request,c)); } return r; }))); return; }
  if(u.origin!==location.origin) return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)); return r;}).catch(()=>caches.match(e.request)));});

// Web Push from the send-push Edge Function: {title, body, tag, link}
self.addEventListener('push',e=>{let d={}; try{ d=e.data?e.data.json():{}; }catch(_){ d={body:e.data?e.data.text():''}; }
  e.waitUntil(self.registration.showNotification(d.title||'953 C. Aragon',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,data:{link:d.link||'feed'}}));});
self.addEventListener('notificationclick',e=>{e.notification.close(); const link=(e.notification.data&&e.notification.data.link)||'feed';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){ if(w.url.startsWith(self.registration.scope)&&'focus' in w){ w.postMessage({type:'open',link}); return w.focus(); } }
    return self.clients.openWindow(new URL('./index.html#'+link,self.registration.scope).href); }));});
