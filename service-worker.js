const CACHE='salone-class-room-shell-v1';
const SHELL=['/','/index.html','/manifest.webmanifest','/offline.html','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
function isPrivateOrDynamic(url,request){return request.method!=='GET'||url.pathname.startsWith('/.netlify/functions/')||url.pathname.startsWith('/api/')||url.hostname==='formsubmit.co'||request.headers.has('authorization');}
self.addEventListener('fetch',event=>{
  const req=event.request; const url=new URL(req.url);
  if(url.origin!==self.location.origin||isPrivateOrDynamic(url,req)){event.respondWith(fetch(req));return;}
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(r=>r).catch(()=>caches.match('/offline.html')));return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{
    if(resp && resp.ok && ['style','script','image','font','manifest'].includes(req.destination)){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(req,clone));}
    return resp;
  }).catch(()=>caches.match('/offline.html'))));
});
