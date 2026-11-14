const CACHE='953-aragon-c275e96'; // CI replaces this with 953-aragon-<commit> on every deploy
// v18 L: games.js, videos.js, chess.js and facecheck.js are not precached (loaded on first use); the fetch handler below saves each in CACHE on its first successful load, so they work offline after one use.
const CORE=['./','./index.html','./app.dc.html','./join.dc.html','./join.html','./support.js','./lowdata.js','./icons.js','./shipcalc.js','./feed-rank.js','./feed-cards.js','./results-card.js','./transparency.js','./weather-bg.js','./birthday-card.js','./cards.js','./assets/emblem-256.jpg','./assets/emblem-512.jpg','./manifest.webmanifest','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/fonts/playfair-display-latin.woff2','./assets/fonts/playfair-display-italic-latin.woff2','./assets/fonts/great-vibes-latin.woff2','./assets/fonts/plus-jakarta-sans-latin.woff2','./assets/covers/house-cover.webp','./assets/covers/me-cover.webp','./assets/covers/offline.webp','./assets/covers/tools-money.webp','./assets/rules-infographic.jpg','./assets/953-Aragon-Agreement-and-House-Rules.pdf']; const GUIDES=['./guides/members/index.html','./guides/admin/index.html','./guides/finance/index.html','./assets/birthday/messages.json']; // picture guides: cached on the side, a missing page can never stop the install;
const CORE_PATHS=new Set(CORE.map(x=>new URL(x,self.registration.scope).pathname)); // v18.2 S: CORE files are saved at install and not re-fetched on every open
const CDN=['https://unpkg.com/react@18.3.1/umd/react.production.min.js','https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js','https://unpkg.com/@babel/standalone@7.29.0/babel.min.js']; // the exact files support.js loads: copied at install so one online visit is enough
self.addEventListener('install',e=>{e.waitUntil(Promise.all([caches.open(CACHE).then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:'reload'}))).then(()=>Promise.allSettled(GUIDES.map(u=>c.add(new Request(u,{cache:'reload'})))))),caches.open('953-cdn').then(c=>Promise.allSettled(CDN.map(u=>c.match(u).then(h=>h||fetch(u).then(r=>{ if(!r.ok) throw 0; return c.put(u,r); })))))]));});
// a new version waits quietly; the app posts 'skip' on the next open (never mid-edit) and 'wipe' on sign-out
self.addEventListener('message',e=>{ if(e.data==='skip') self.skipWaiting(); if(e.data==='wipe'){ gen++; e.waitUntil(idbDo('readwrite',s=>s.clear()).catch(()=>{})); } });
// v17.1 X4 (owner ruling 6): onboard offline bundle. The app posts {type:'warm',urls} at most once a day while the member is onboard and online; same-origin files only, never a video or third party,
// kept in '953-sea' with a running 80 MB cap (the rest is skipped). The cache is rebuilt each time so it can never grow past the cap.
const SEA_CAP=80*1024*1024;
self.addEventListener('message',e=>{ const d=e.data; if(!d||d.type!=='warm'||!Array.isArray(d.urls)) return; const src=e.source;
  e.waitUntil((async()=>{ let n=0, bytes=0; try{ await caches.delete('953-sea-new'); const c=await caches.open('953-sea-new');   // built on the side: a dropped connection at sea keeps the last bundle
    const q=d.urls.slice(0,100), seen=new Set();
    for(let i=0;i<q.length&&i<400;i++){ try{ const u=new URL(q[i],self.registration.scope); if(u.origin!==location.origin||/\.(webm|mp4|mov)$/i.test(u.pathname)||seen.has(u.pathname)) continue; seen.add(u.pathname);
      const r=await fetch(u.href,{cache:'no-cache'}); if(!r.ok||r.status!==200) continue; const b=await r.clone().blob(); if(bytes+b.size>SEA_CAP) continue;
      if(/\/guides\/[a-z]+\/index\.html$/.test(u.pathname)){ const t=await b.text(); for(const m of t.matchAll(/src="(img\/[^"]+\.(?:png|jpe?g|webp))"/g)) q.push(new URL(m[1],u.href).href); } // a picture guide needs its pictures offline too
      await c.put(u.pathname,r); n++; bytes+=b.size; }catch(_){} }
    if(n){ await caches.delete('953-sea'); const live=await caches.open('953-sea'); for(const k of await c.keys()) await live.put(k,await c.match(k)); } await caches.delete('953-sea-new'); }catch(_){}
    if(src) src.postMessage({type:'sea',n,bytes}); })()); });
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!=='953-cdn'&&k!=='953-videos'&&k!=='953-sea'&&k!=='953-sea-new').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
// last good Supabase REST answer per URL + signed-in member, kept in IndexedDB (keyed by the token's sub claim, so an hourly token refresh keeps the copy; newest 300 kept)
let gen=0; // bumps on sign-out: answers that finish after it are never saved
const idbDo=(mode,fn)=>new Promise((ok,no)=>{const o=indexedDB.open('953-sw',2); o.onupgradeneeded=()=>{ const d=o.result, s=d.objectStoreNames.contains('rest')?o.transaction.objectStore('rest'):d.createObjectStore('rest'); if(!s.indexNames.contains('at')) s.createIndex('at','at'); }; o.onerror=()=>no(o.error);
  o.onsuccess=()=>{const t=o.result.transaction('rest',mode), q=fn(t.objectStore('rest')); t.oncomplete=()=>ok(q&&q.result); t.onerror=()=>no(t.error);};});
const who=r=>{ try{ const p=(r.headers.get('authorization')||'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); return JSON.parse(atob(p)).sub||''; }catch(_){ return ''; } };
const trim=s=>{ const q=s.count(); q.onsuccess=()=>{ let n=q.result-300; if(n>0) s.index('at').openKeyCursor().onsuccess=e=>{ const c=e.target.result; if(c&&n-->0){ s.delete(c.primaryKey); c.continue(); } }; }; };
// v18.6 F: stale-while-revalidate. A saved answer younger than 24 h answers at once ('x-953-swr' + 'x-953-at' mark it; 'x-953-saved' stays the offline-only mark) and is refreshed behind;
// when the fresh body differs, clients get {type:'953-data-fresh',url}; when it is the same, {type:'953-data-fresh',url,same:true}. Older or missing: restFirst (network first).
// Network first as well: while the app runs its own refresh after a fresh message ({type:'netfirst'} ... {type:'netdone'}, 20 s at most; so that refresh can never start another one: no loop) and any GET within 60 s of a write (read-after-write).
// (Not keyed on request.cache: Chromium reports 'reload' for every request of a reloaded page, and Playwright routing makes all of them 'reload'.)
// Only GETs reach swr; writes, RPC POSTs, auth and storage never come from cache.
const FRESH_MS=864e5, WRITE_MS=6e4; let lastWrite=0, netUntil=0; self.addEventListener('message',e=>{ const d=e.data; if(d&&d.type==='netfirst') netUntil=Date.now()+2e4; if(d&&d.type==='netdone') netUntil=0; });
const WRITE_RPC=/^\/rest\/v1\/rpc\/(add_post_comment|admin_member_status|admin_set_|block_my_device|docs_nudge|house_status_request|open_member_review|photo_nudge|remind_birthdate|remind_profile_gaps|board_decide|claim_(approve|reject|undo)|close_member_review|confirm_import_batch|delete_my_story|handover_(cancel|respond|start)|leave_thread|post_story|presence_confirm_wifi|react_message|review_records|send_message|send_reminder|set_|start_thread|status_proposal_decide|thread_mute|toggle_post_like|void_duplicate_dues)/; // most RPC POSTs only read (the app sends dozens at boot): only these change data
const noteWrite=u=>{ if(u.pathname.startsWith('/rest/v1/rpc/')&&!WRITE_RPC.test(u.pathname)) return; lastWrite=Date.now(); idbDo('readwrite',s=>s.put({at:lastWrite},'__lw')).catch(()=>{}); };
const tell=m=>self.clients.matchAll({includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage(m)));
const swr=(e,hit,g)=>{ const r=e.request, key=r.url+'|'+who(r);
  e.waitUntil(fetch(r).then(async res=>{ if(!(res.ok&&res.status===200)) return; const t=await res.clone().text(); if(t.length>=2e6||g!==gen) return; const h={}; for(const k of ['content-type','content-range','content-profile']) if(res.headers.get(k)) h[k]=res.headers.get(k);
    if(t===hit.t){ if(g===gen) await idbDo('readwrite',s=>s.put({t,h,at:Date.now()},key)).catch(()=>{}); return tell({type:'953-data-fresh',url:r.url,same:true}); } // same answer: only the age restarts
    if(g!==gen) return; await idbDo('readwrite',s=>{ const q=s.put({t,h,at:Date.now()},key); trim(s); return q; }).catch(()=>{});
    await tell({type:'953-data-fresh',url:r.url}); }).catch(()=>{}));
  return new Response(hit.t,{status:200,headers:Object.assign({'content-type':'application/json'},hit.h,{'x-953-swr':'1','x-953-at':String(hit.at)})}); };
const restRoute=e=>{ const g=gen, r=e.request, key=r.url+'|'+who(r); if(r.url.includes('/rest/v1/signin_names')) return restFirst(e); // the sign-in probe (sbProbe) must see a real offline answer: x-953-saved, never a silent saved copy
  if(Date.now()<netUntil||Date.now()-lastWrite<WRITE_MS) return restFirst(e);
  let lw=0; return idbDo('readonly',s=>{ s.get('__lw').onsuccess=ev=>{ lw=(ev.target.result||{}).at||0; }; return s.get(key); }).catch(()=>null).then(hit=>hit&&Date.now()-hit.at<FRESH_MS&&Date.now()-lw>=WRITE_MS?swr(e,hit,g):restFirst(e)); };
const restFirst=e=>{const r=e.request, key=r.url+'|'+who(r), g=gen;
  return fetch(r).then(res=>{ if(res.ok&&res.status===200){ const c=res.clone(), h={}; for(const k of ['content-type','content-range','content-profile']) if(c.headers.get(k)) h[k]=c.headers.get(k); c.text().then(t=>{ if(t.length<2e6&&g===gen) idbDo('readwrite',s=>{ const q=s.put({t,h,at:Date.now()},key); trim(s); return q; }).catch(()=>{}); }).catch(()=>{}); } return res; })
    .catch(err=>idbDo('readonly',s=>s.get(key)).catch(()=>null).then(hit=>{ if(!hit) throw err; return new Response(hit.t,{status:200,headers:Object.assign({'content-type':'application/json'},hit.h,{'x-953-saved':'1'})}); }));};
self.addEventListener('fetch',e=>{const u=new URL(e.request.url); if(e.request.method!=='GET'){ if(/\.supabase\.co$/.test(u.hostname)&&u.pathname.startsWith('/rest/v1/')) noteWrite(u); return; }
  // v18.1 W: weather clips (assets/wx/*.webm|mp4) never go through this worker: not cached, the network answers range requests itself; the small posters are cached like other files
  if(u.origin===location.origin&&/\/assets\/wx\/[^/]+\.(webm|mp4)$/.test(u.pathname)) return;
  // React and Babel come from unpkg at exact versions: keep a copy so the app opens with no signal (onboard)
  if(u.origin==='https://unpkg.com'&&/@\d+\.\d+\.\d+\//.test(u.pathname)){ e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{ if(r.ok||r.type==='opaque'){ const c=r.clone(); caches.open('953-cdn').then(x=>x.put(e.request,c)); } return r; }))); return; }
  // v17.5: the pinned face-check files (MediaPipe code + wasm + model) and the pinned chess.js copy are kept after the first load; exact versions only, so a saved copy never goes stale
  if((u.hostname==='cdn.jsdelivr.net'&&(u.pathname.startsWith('/npm/chess.js@1.4.0/')||u.pathname.startsWith('/npm/@mediapipe/tasks-vision@1.0.1/')))||(u.hostname==='storage.googleapis.com'&&u.pathname.startsWith('/mediapipe-models/'))){ e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{ if(r.status===200||r.type==='opaque'){ const c=r.clone(); caches.open('953-cdn').then(x=>x.put(e.request,c)).catch(()=>{}); } return r; }))); return; }
  // data calls: network first, saved answer when the network fails; sign-in, token and storage calls are never kept
  if(/\.supabase\.co$/.test(u.hostname)){ if(u.pathname.startsWith('/rest/v1/')) e.respondWith(restRoute(e)); return; }
  // v17 lane I: offline exercise videos (Wikimedia Commons CC0 / CC BY only, saved by videos.js in '953-videos'): the saved copy first, with Range support for the video element; nothing else is kept, never a YouTube URL
  if(u.hostname==='upload.wikimedia.org'){ e.respondWith(caches.open('953-videos').then(c=>c.match(u.origin+u.pathname)).then(async hit=>{ if(!hit) return fetch(e.request);
    const m=/^bytes=(\d*)-(\d*)$/.exec(e.request.headers.get('range')||''); if(!m) return hit;
    const b=await hit.blob(), n=b.size, a=m[1]===''?Math.max(0,n-Number(m[2])):Number(m[1]), z=m[1]!==''&&m[2]!==''?Math.min(n-1,Number(m[2])):n-1;
    return new Response(b.slice(a,z+1),{status:206,headers:{'content-type':hit.headers.get('content-type')||'video/webm','content-range':'bytes '+a+'-'+z+'/'+n,'content-length':String(z-a+1),'accept-ranges':'bytes'}}); })); return; }
  if(u.origin!==location.origin) return;
  // app files: the saved copy opens at once. v18.2 S: an exact match first (10x faster than ignoreSearch), ignoreSearch only on a miss (?demo, ?v=); a file in CORE is not fetched again behind the hit (CI gives every deploy a new CACHE, so a new worker re-saves all of them), anything else still refreshes behind the hit
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(h=>h||c.match(e.request,{ignoreSearch:true})).then(hit=>{
    const net=()=>fetch(e.request,{cache:'no-cache'}).then(r=>{ if(r.status===200) c.put(e.request,r.clone()); return r; });
    if(hit){ if(!CORE_PATHS.has(u.pathname)) e.waitUntil(net().catch(()=>{})); return hit; }
    return net().catch(()=>caches.open('953-sea').then(x=>x.match(new URL(e.request.url).pathname)).then(h=>h||(e.request.mode==='navigate'?c.match('./index.html'):Response.error())));})));});

// Web Push from the send-push Edge Function: {title, body, tag, link}
self.addEventListener('push',e=>{let d={}; try{ d=e.data?e.data.json():{}; }catch(_){ d={body:e.data?e.data.text():''}; }
  e.waitUntil(self.registration.showNotification(d.title||'953 C. Aragon',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,data:{link:d.link||'feed'}}));});
self.addEventListener('notificationclick',e=>{e.notification.close(); const link=(e.notification.data&&e.notification.data.link)||'feed';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){ if(w.url.startsWith(self.registration.scope)&&'focus' in w){ w.postMessage({type:'open',link}); return w.focus(); } }
    return self.clients.openWindow(new URL('./index.html#'+link,self.registration.scope).href); }));});
