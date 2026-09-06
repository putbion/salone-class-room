
exports.handler=async(event)=>{
 const H={'Content-Type':'application/json','Cache-Control':'no-store'},U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY,A=(process.env.ADMIN_EMAIL||'').toLowerCase().trim();
 if(!U||!K||!A)return{statusCode:500,headers:H,body:JSON.stringify({error:'Server configuration incomplete.'})};
 const auth=event.headers.authorization||'',t=auth.startsWith('Bearer ')?auth.slice(7):'';
 const vr=await fetch(U+'/auth/v1/user',{headers:{apikey:K,Authorization:'Bearer '+t}});if(!vr.ok)return{statusCode:401,headers:H,body:JSON.stringify({error:'Sign in required.'})};
 const au=await vr.json();if((au.email||'').toLowerCase()!==A)return{statusCode:403,headers:H,body:JSON.stringify({error:'Not authorized.'})};
 const sf=(p,o={})=>fetch(U+p,{...o,headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',...(o.headers||{})}});
 if(event.httpMethod==='POST'){
  let b=JSON.parse(event.body||'{}');
  if(b.action==='save_announcement'){if(b.active)await sf('/rest/v1/announcements?active=eq.true',{method:'PATCH',body:'{"active":false}'});let r=await sf('/rest/v1/announcements',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({message:String(b.message||'').trim(),active:!!b.active})});return{statusCode:r.ok?200:500,headers:H,body:JSON.stringify(r.ok?{ok:true}:{error:'Unable to save announcement.'})}}
  if(b.action==='save_settings'){let p=b.prices||{},row={id:1,free_access_enabled:!!b.free_access_enabled,free_access_until:b.free_access_until||null,orange_money_number:String(b.orange_money_number||'').trim(),price_primary:+p.primary||0,price_jss:+p.jss||0,price_sss:+p.sss||0,price_teacher:+p.teacher||0,price_university:+p.university||0};let r=await sf('/rest/v1/platform_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});return{statusCode:r.ok?200:500,headers:H,body:JSON.stringify(r.ok?{ok:true}:{error:'Unable to save settings.'})}}
  if(b.action==='profile_paid'){let r=await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({paid_active:!!b.paid_active})});return{statusCode:r.ok?200:500,headers:H,body:'{"ok":true}'}}
  if(b.action==='payment_status'){let pr=await sf('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(b.id)+'&select=profile_id'),p=pr.ok?(await pr.json())[0]:null;let r=await sf('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({status:b.status,verified_at:b.status==='verified'?new Date().toISOString():null})});if(r.ok&&b.status==='verified'&&p)await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(p.profile_id),{method:'PATCH',body:'{"paid_active":true}'});return{statusCode:r.ok?200:500,headers:H,body:'{"ok":true}'}}

  if(b.action==='save_orange_api_settings'){
    const row={
      id:1,
      orange_payment_mode:String(b.payment_mode||'manual').slice(0,20),
      orange_api_base_url:String(b.api_base_url||'').trim().slice(0,500),
      orange_merchant_id:String(b.merchant_id||'').trim().slice(0,180),
      orange_webhook_url:String(b.webhook_url||'').trim().slice(0,500),
      orange_api_enabled:!!b.api_enabled
    };
    let r=await sf('/rest/v1/platform_settings?on_conflict=id',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(row)
    });
    return{statusCode:r.ok?200:500,headers:H,body:JSON.stringify(r.ok?{ok:true}:{error:'Unable to save Orange Money API settings.'})};
  }
  if(b.action==='test_orange_api'){
    const sr=await sf('/rest/v1/platform_settings?id=eq.1&select=orange_payment_mode,orange_api_base_url,orange_merchant_id,orange_webhook_url,orange_api_enabled');
    const s=sr.ok?(await sr.json())[0]||{}:{};
    if(s.orange_payment_mode!=='api'||!s.orange_api_enabled)
      return{statusCode:400,headers:H,body:JSON.stringify({error:'Orange Money API mode is not enabled.'})};
    if(!s.orange_api_base_url||!s.orange_merchant_id||!s.orange_webhook_url)
      return{statusCode:400,headers:H,body:JSON.stringify({error:'Complete the Orange Money API URL, merchant ID and webhook URL first.'})};
    const secretsReady=!!(process.env.ORANGE_MONEY_CLIENT_ID&&process.env.ORANGE_MONEY_CLIENT_SECRET);
    return{
      statusCode:secretsReady?200:400,
      headers:H,
      body:JSON.stringify(secretsReady
        ?{ok:true,message:'Orange Money API configuration is present. Live authentication can be enabled once the official Orange API request format is confirmed.'}
        :{error:'API settings are saved, but Orange Money API secrets are not yet configured in Netlify Environment Variables.'})
    };
  }

 }
 const arr=async p=>{let r=await sf(p);return r.ok?await r.json():[]};
 let users=[];try{let r=await sf('/auth/v1/admin/users?per_page=1000');if(r.ok)users=(await r.json()).users||[]}catch{}
 const [events,messages,profiles,payments,settings,anns]=await Promise.all([arr('/rest/v1/app_events?select=*&order=created_at.desc&limit=500'),arr('/rest/v1/support_messages?select=*&order=created_at.desc&limit=300'),arr('/rest/v1/user_profiles?select=*&order=created_at.desc&limit=500'),arr('/rest/v1/payment_requests?select=*,user_profiles(full_name,category)&order=created_at.desc&limit=500'),arr('/rest/v1/platform_settings?id=eq.1&select=*'),arr('/rest/v1/announcements?select=*&order=created_at.desc&limit=1')]);
 const now=Date.now(),d30=2592000000,e30=events.filter(e=>new Date(e.created_at).getTime()>=now-d30),contains=(e,w)=>w.some(x=>(((e.event_type||'')+' '+(e.section||'')+' '+(e.detail||'')).toLowerCase()).includes(x));
 const c={primary:e30.filter(e=>contains(e,['primary','npse'])).length,jss:e30.filter(e=>contains(e,['jss','bece'])).length,sss:e30.filter(e=>contains(e,['sss','wassce'])).length,teachers:e30.filter(e=>contains(e,['teacher','lesson note','scheme of work'])).length,university:e30.filter(e=>contains(e,['university','topic finder','proposal','dissertation','defense','lecturer'])).length};
 const m={npseCount:e30.filter(e=>contains(e,['npse'])).length,beceCount:e30.filter(e=>contains(e,['bece'])).length,wassceCount:e30.filter(e=>contains(e,['wassce'])).length,reviewCount:e30.filter(e=>contains(e,['review'])).length,teacherEvents:c.teachers,schemeEvents:e30.filter(e=>contains(e,['scheme of work'])).length,lessonEvents:e30.filter(e=>contains(e,['lesson note','lesson plan'])).length,otherTeacherEvents:c.teachers,universityEvents:c.university,topicEvents:e30.filter(e=>contains(e,['topic finder'])).length,proposalEvents:e30.filter(e=>contains(e,['proposal','research'])).length,dissertationEvents:e30.filter(e=>contains(e,['dissertation','defense','thesis'])).length};
 const pays=payments.map(p=>({...p,full_name:p.user_profiles?.full_name,category:p.user_profiles?.category}));
 return{statusCode:200,headers:H,body:JSON.stringify({summary:{registered_users:users.length,new_users_30d:users.filter(u=>new Date(u.created_at).getTime()>=now-d30).length,events_30d:e30.length,new_messages:messages.filter(x=>(x.status||'new')==='new').length},categories:c,metrics:m,users,events,messages,profiles,payments:pays,platform_settings:settings[0]||{},announcement:anns[0]||null,system:{supabase:true,events_table:true,messages_table:true}})};
};
