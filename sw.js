const CACHE='salone-class-room-v11';
const CORE=['/','/index.html','/offline.html','/manifest.webmanifest','/icon-192.png','/icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  // API/function calls must always use the network and must never receive cached HTML.
  if(url.pathname.startsWith('/.netlify/functions/'))return;

  // Open the installed app quickly from its cached shell, then refresh the cache in
  // the background. A new service-worker version replaces this cache on deployment.
  if(request.mode==='navigate'){
    // Never serve the learner app shell for the admin dashboard.
    // /admin is resolved by Netlify to /admin.html and must stay network-first.
    if(url.pathname==='/admin' || url.pathname==='/admin/' || url.pathname==='/admin.html'){
      event.respondWith(
        fetch(request, {cache:'no-store'}).catch(async()=>{
          const cache=await caches.open(CACHE);
          return (await cache.match('/offline.html')) || Response.error();
        })
      );
      return;
    }

    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match('/index.html');
      const refresh=fetch(request).then(response=>{
        if(response&&response.ok)cache.put('/index.html',response.clone());
        return response;
      }).catch(()=>null);
      if(cached){event.waitUntil(refresh);return cached;}
      const network=await refresh;
      return network||cache.match('/offline.html');
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request);
    if(cached){
      event.waitUntil(fetch(request).then(response=>{
        if(response&&response.ok)cache.put(request,response.clone());
      }).catch(()=>{}));
      return cached;
    }
    try{
      const response=await fetch(request);
      if(response&&response.ok)cache.put(request,response.clone());
      return response;
    }catch(_){
      return Response.error();
    }
  })());
});
