const CACHE='salone-class-room-interactive-20261006-final-1';
const APP_SHELL=['/','/index.html','/offline.html'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).catch(()=>null));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);

  if(url.origin!==self.location.origin) return;

  // Never intercept admin dashboard or Netlify Functions with the learner app shell.
  if(url.pathname==='/admin' || url.pathname==='/admin/' || url.pathname==='/admin.html' ||
     url.pathname.startsWith('/admin/') || url.pathname.startsWith('/.netlify/functions/')){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response && response.ok){
          const cache=await caches.open(CACHE);
          cache.put(request,response.clone()).catch(()=>{});
        }
        return response;
      }catch{
        const cache=await caches.open(CACHE);
        return (await cache.match(request)) || (await cache.match('/index.html')) || (await cache.match('/offline.html'));
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request);
    if(cached) return cached;
    const response=await fetch(request);
    if(response && response.ok) cache.put(request,response.clone()).catch(()=>{});
    return response;
  })());
});
