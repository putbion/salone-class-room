const crypto=require('crypto');
const {json,enforceRate,bodyTooLarge}=require('./_security');
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const hashPassword=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');
exports.handler=async(event)=>{
 if(bodyTooLarge(event,32768))return json(413,{error:'Request is too large.'});
 const generalLimit=enforceRate(event,{name:'admin-api',limit:120,windowMs:60000});if(generalLimit)return generalLimit;
 const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY,A=(process.env.ADMIN_EMAIL||'').toLowerCase().trim();
 if(!U||!K)return json(500,{error:'Server configuration incomplete.'});
 const sf=(p,o={})=>fetch(U+p,{...o,headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',...(o.headers||{})}});
 const arr=async p=>{const r=await sf(p);return r.ok?await r.json():[]};
 let b={};if(event.httpMethod==='POST'){try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}}
 const adminAllowed=async(email)=>{email=(email||'').toLowerCase().trim();if(A&&email===A)return {allowed:true,role:'owner'};const rows=await arr('/rest/v1/admin_users?email=eq.'+encodeURIComponent(email)+'&active=eq.true&select=email,role,active&limit=1');return rows[0]?{allowed:true,role:rows[0].role||'assistant'}:{allowed:false,role:null}};
 if(event.httpMethod==='POST'&&b.action==='admin_login'){
   const rl=enforceRate(event,{name:'admin-login',limit:8,windowMs:15*60*1000});if(rl)return rl;
   const email=clean(b.email,180).toLowerCase(),password=String(b.password||'');if(password.length>128)return json(401,{error:'Administrator email or password is incorrect.'});const access=await adminAllowed(email);if(!access.allowed)return json(401,{error:'Administrator email or password is incorrect.'});
   const lr=await fetch(U+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:K,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
   const ld=await lr.json().catch(()=>({}));if(!lr.ok)return json(401,{error:ld.error_description||ld.msg||'Administrator email or password is incorrect.'});
   return json(200,{access_token:ld.access_token,expires_in:ld.expires_in||3600,email,role:access.role});
 }
 const auth=event.headers.authorization||'',t=auth.startsWith('Bearer ')?auth.slice(7):'';
 const vr=await fetch(U+'/auth/v1/user',{headers:{apikey:K,Authorization:'Bearer '+t}});if(!vr.ok)return json(401,{error:'Sign in required.'});
 const au=await vr.json(),access=await adminAllowed((au.email||'').toLowerCase());if(!access.allowed)return json(403,{error:'Not authorized.'});
 if(event.httpMethod==='POST'){
  if(b.action==='admin_add'){
   if(access.role!=='owner')return json(403,{error:'Only the main administrator can add or remove administrators.'});
   const email=clean(b.email,180).toLowerCase(),password=String(b.password||''),role='assistant';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>128)return json(400,{error:'Enter a valid email and a temporary password of at least 12 characters.'});
   let uid=null;const cr=await fetch(U+'/auth/v1/admin/users',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{salone_admin_role:role}})});if(cr.ok){const cd=await cr.json();uid=cd.id||cd.user?.id||null}else{const txt=await cr.text();if(!txt.toLowerCase().includes('already'))return json(500,{error:'Unable to create the assistant administrator login.'})}
   const row={email,role,active:true,auth_user_id:uid,added_by:(au.email||'').toLowerCase(),updated_at:new Date().toISOString()};const r=await sf('/rest/v1/admin_users?on_conflict=email',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to authorize the assistant administrator.'});
  }
  if(b.action==='admin_toggle'){
   if(access.role!=='owner')return json(403,{error:'Only the main administrator can change administrator access.'});const email=clean(b.email,180).toLowerCase();if(A&&email===A)return json(400,{error:'The main administrator cannot be disabled here.'});const r=await sf('/rest/v1/admin_users?email=eq.'+encodeURIComponent(email),{method:'PATCH',body:JSON.stringify({active:!!b.active,updated_at:new Date().toISOString()})});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to update administrator access.'});
  }
  if(b.action==='password_reset_resolve'){
   const r=await sf('/rest/v1/password_reset_requests?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({status:'resolved',resolved_at:new Date().toISOString(),resolved_by:(au.email||'').toLowerCase()})});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to update reset request.'});
  }
  if(b.action==='update_announcement'){
   if(!b.id)return json(400,{error:'Announcement ID is required.'});const row={message:clean(b.message,1000),active:!!b.active,starts_at:b.starts_at||null,ends_at:b.ends_at||null,target_category:clean(b.target_category,30)||null};const r=await sf('/rest/v1/announcements?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify(row)});if(r.ok&&b.active)await sf('/rest/v1/announcements?active=eq.true&id=neq.'+encodeURIComponent(b.id),{method:'PATCH',body:'{"active":false}'});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to update announcement.'});
  }
  if(b.action==='delete_announcement'){
   if(!b.id)return json(400,{error:'Announcement ID is required.'});const r=await sf('/rest/v1/announcements?id=eq.'+encodeURIComponent(b.id),{method:'DELETE'});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to delete announcement.'});
  }
  if(b.action==='save_announcement'){
   const row={message:clean(b.message,1000),active:!!b.active,starts_at:b.starts_at||null,ends_at:b.ends_at||null,target_category:clean(b.target_category,30)||null};
   const r=await sf('/rest/v1/announcements',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});if(!r.ok)return json(500,{error:'Unable to save announcement.'});const saved=(await r.json().catch(()=>[]))[0];if(b.active&&saved?.id)await sf('/rest/v1/announcements?active=eq.true&id=neq.'+encodeURIComponent(saved.id),{method:'PATCH',body:'{"active":false}'});return json(200,{ok:true});
  }
  if(b.action==='end_free_period'){
   if(access.role!=='owner')return json(403,{error:'Only the main administrator can end free access.'});
   const r=await sf('/rest/v1/platform_settings?id=eq.1',{method:'PATCH',body:JSON.stringify({free_access_enabled:false,free_access_until:new Date(Date.now()-1000).toISOString(),updated_at:new Date().toISOString()})});
   return r.ok?json(200,{ok:true}):json(500,{error:'Unable to end the free period.'});
  }
  if(b.action==='save_settings'){
   const p=b.prices||{},row={id:1,free_access_enabled:!!b.free_access_enabled,free_access_start:b.free_access_start||null,free_access_until:b.free_access_until||null,orange_money_number:clean(b.orange_money_number,60),price_primary:+p.primary||0,price_jss:+p.jss||0,price_sss:+p.sss||0,price_teacher:+p.teacher||0,price_university:+p.university||0,default_access_days:Math.max(1,Math.min(365,+b.default_access_days||30)),ai_enabled:b.ai_enabled!==false,ai_model:clean(b.ai_model,80)||'openai/gpt-oss-20b',primary_free:!!b.primary_free,jss_free:!!b.jss_free,sss_free:!!b.sss_free,teacher_free:!!b.teacher_free,university_free:!!b.university_free,updated_at:new Date().toISOString()};
   const r=await sf('/rest/v1/platform_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to save settings.'});
  }
  if(b.action==='profile_access'){
   const status=['active','blocked'].includes(b.account_status)?b.account_status:'active';const row={account_status:status,free_access_start:b.free_access_start||null,free_access_end:b.free_access_end||null,paid_access_start:b.paid_access_start||null,paid_access_end:b.paid_access_end||null,paid_active:!!b.paid_active,admin_note:clean(b.admin_note,1000)||null,updated_at:new Date().toISOString()};
   const r=await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify(row)});if(status==='blocked')await sf('/rest/v1/user_sessions?profile_id=eq.'+encodeURIComponent(b.id),{method:'DELETE'}).catch(()=>{});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to update user access.'});
  }
  if(b.action==='profile_remove'){
   await sf('/rest/v1/user_sessions?profile_id=eq.'+encodeURIComponent(b.id),{method:'DELETE'}).catch(()=>{});const r=await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(b.id),{method:'DELETE'});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to remove user.'});
  }
  if(b.action==='profile_reset_password'){
   const password=String(b.password||'');if(password.length<6||password.length>128)return json(400,{error:'Temporary password must contain 6 to 128 characters.'});const salt=crypto.randomBytes(16).toString('hex');const r=await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({password_salt:salt,password_hash:hashPassword(password,salt),updated_at:new Date().toISOString()})});await sf('/rest/v1/user_sessions?profile_id=eq.'+encodeURIComponent(b.id),{method:'DELETE'}).catch(()=>{});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to reset password.'});
  }
  if(b.action==='manual_payment_save'){
   const id=clean(b.id,80),profile_id=clean(b.profile_id,80),amount=Number(b.amount),sender_number=clean(b.sender_number,30),transaction_reference=clean(b.transaction_reference,150);
   if(!/^[0-9a-f-]{36}$/i.test(profile_id)||!Number.isFinite(amount)||amount<=0||amount>100000000||!sender_number||!transaction_reference)return json(400,{error:'Valid subscriber, amount, sender and transaction reference are required.'});
   const profiles=await arr('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(profile_id)+'&select=id&limit=1');if(!profiles.length)return json(400,{error:'Subscriber not found.'});
   const row={profile_id,amount,sender_number,transaction_reference};
   if(id){const old=await arr('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(id)+'&select=id,status&limit=1');if(!old.length)return json(404,{error:'Payment not found.'});if(old[0].status==='verified')return json(409,{error:'Verified payments cannot be edited.'});const r=await sf('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to edit payment.'});}
   const r=await sf('/rest/v1/payment_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...row,status:'pending'})});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to save payment. Check database requirements.'});
  }
  if(b.action==='manual_payment_delete'){
   const id=clean(b.id,80);if(!id)return json(400,{error:'Payment ID required.'});const old=await arr('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(id)+'&select=id,status&limit=1');if(!old.length)return json(404,{error:'Payment not found.'});if(old[0].status==='verified')return json(409,{error:'Verified payments cannot be deleted here.'});const r=await sf('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(id),{method:'DELETE'});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to delete payment.'});
  }
  if(b.action==='payment_status'){
   if(!['verified','rejected','pending'].includes(b.status))return json(400,{error:'Invalid payment status.'});
   const pr=await arr('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(b.id)+'&select=profile_id'),p=pr[0];const r=await sf('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({status:b.status,verified_at:b.status==='verified'?new Date().toISOString():null})});
   if(r.ok&&b.status==='verified'&&p){const s=(await arr('/rest/v1/platform_settings?id=eq.1&select=default_access_days'))[0]||{},days=+s.default_access_days||30,start=new Date(),end=new Date(start.getTime()+days*86400000);await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(p.profile_id),{method:'PATCH',body:JSON.stringify({paid_active:true,paid_access_start:start.toISOString(),paid_access_end:end.toISOString(),updated_at:new Date().toISOString()})})}
   return r.ok?json(200,{ok:true}):json(500,{error:'Unable to update payment.'});
  }

  if(b.action==='reply_feedback'){
   const id=clean(b.id,90),reply=clean(b.reply,3000);
   if(!/^[0-9a-f-]{8,90}$/i.test(id)||!reply)return json(400,{error:'Select a message and enter a reply.'});
   const msg=(await arr('/rest/v1/support_messages?id=eq.'+encodeURIComponent(id)+'&select=id&limit=1'))[0];
   if(!msg)return json(404,{error:'Message not found.'});
   const r=await sf('/rest/v1/support_message_replies',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({message_id:id,reply_text:reply,replied_by:(au.email||'').toLowerCase()})});
   if(!r.ok){console.error('[admin-api][reply]',r.status,(await r.text()).slice(0,300));return json(503,{error:'Reply could not be saved. Check SQL setup.'})}
   await sf('/rest/v1/support_messages?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status:'replied'})});
   return json(200,{ok:true});
  }
  if(b.action==='feature_save'){
   const key=clean(b.feature_key,80).toLowerCase().replace(/[^a-z0-9_-]+/g,'_'),name=clean(b.feature_name,120);if(!key||!name)return json(400,{error:'Feature key and feature name are required.'});
   const row={feature_key:key,feature_name:name,section:clean(b.section,30)||'general',description:clean(b.description,800)||null,target_category:clean(b.target_category,30)||'all',enabled:b.enabled!==false,paid:!!b.paid,price:Math.max(0,+b.price||0),display_order:Math.max(0,+b.display_order||100),updated_at:new Date().toISOString()};
   let r;if(b.id)r=await sf('/rest/v1/platform_features?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify(row)});else r=await sf('/rest/v1/platform_features?on_conflict=feature_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to save feature.'});
  }
  if(b.action==='feature_toggle'){const r=await sf('/rest/v1/platform_features?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({enabled:!!b.enabled,updated_at:new Date().toISOString()})});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to update feature.'});}

  if(b.action==='save_orange_api_settings'){
   const row={id:1,orange_payment_mode:clean(b.payment_mode,20)||'manual',orange_api_base_url:clean(b.api_base_url,500)||null,orange_merchant_id:clean(b.merchant_id,180)||null,orange_webhook_url:clean(b.webhook_url,500)||null,orange_api_enabled:!!b.api_enabled};let r=await sf('/rest/v1/platform_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to save Orange Money API settings.'});
  }
  if(b.action==='test_orange_api'){const sr=await arr('/rest/v1/platform_settings?id=eq.1&select=orange_payment_mode,orange_api_base_url,orange_merchant_id,orange_webhook_url,orange_api_enabled'),s=sr[0]||{};if(s.orange_payment_mode!=='api'||!s.orange_api_enabled)return json(400,{error:'Orange Money API mode is not enabled.'});if(!s.orange_api_base_url||!s.orange_merchant_id||!s.orange_webhook_url)return json(400,{error:'Complete the Orange Money API URL, merchant ID and webhook URL first.'});const ready=!!(process.env.ORANGE_MONEY_CLIENT_ID&&process.env.ORANGE_MONEY_CLIENT_SECRET);return ready?json(200,{ok:true,message:'Orange Money API configuration is present.'}):json(400,{error:'Orange Money API secrets are not yet configured in Netlify Environment Variables.'});}
 }
 let users=[];try{let r=await sf('/auth/v1/admin/users?per_page=1000');if(r.ok)users=(await r.json()).users||[]}catch{}
 const [events,messages,profiles,payments,settings,anns,aiUsage,admins,resetRequests,features]=await Promise.all([arr('/rest/v1/app_events?select=*&order=created_at.desc&limit=500'),arr('/rest/v1/support_messages?select=*&order=created_at.desc&limit=300'),arr('/rest/v1/user_profiles?select=id,device_id,full_name,contact,email,phone,category,town,paid_active,account_status,last_login_at,last_seen_at,current_tool,free_access_start,free_access_end,paid_access_start,paid_access_end,admin_note,created_at,updated_at&order=created_at.desc&limit=1000'),arr('/rest/v1/payment_requests?select=*,user_profiles(full_name,category)&order=created_at.desc&limit=500'),arr('/rest/v1/platform_settings?id=eq.1&select=*'),arr('/rest/v1/announcements?select=*&order=active.desc,created_at.desc&limit=1'),arr('/rest/v1/ai_usage_log?select=*&order=created_at.desc&limit=1000'),arr('/rest/v1/admin_users?select=*&order=created_at.asc'),arr('/rest/v1/password_reset_requests?select=*,user_profiles(full_name,contact,email,phone)&order=created_at.desc&limit=200'),arr('/rest/v1/platform_features?select=*&order=display_order.asc,feature_name.asc')]);
 const countAll=async(table,filter='')=>{try{const r=await sf('/rest/v1/'+table+'?select=id'+filter,{headers:{Prefer:'count=exact',Range:'0-0'}});if(!r.ok)return null;const range=r.headers.get('content-range')||'';const m=range.match(/\/(\d+)$/);return m?Number(m[1]):null}catch{return null}};
 const since=(days)=>'&created_at=gte.'+encodeURIComponent(new Date(Date.now()-days*86400000).toISOString());
 const fetchPaged=async(path,maxPages=25)=>{const out=[];for(let i=0;i<maxPages;i++){const url=path+(path.includes('?')?'&':'?')+'limit=1000&offset='+(i*1000);const response=await sf(url);if(!response.ok)throw new Error('Database pagination failed: '+response.status);const rows=await response.json();if(!Array.isArray(rows))throw new Error('Unexpected database response');out.push(...rows);if(rows.length<1000)return out;}throw new Error('Pagination safety limit reached; totals unavailable');};
 const [eventCount30,pwaDevices,pwaUsers]=await Promise.all([countAll('app_events',since(30)),countAll('pwa_installations'),(async()=>{try{const rows=await fetchPaged('/rest/v1/pwa_installations?select=profile_id');return new Set(rows.filter(x=>x.profile_id).map(x=>x.profile_id)).size}catch{return null}})()]);
 const [totalProfiles,dayProfiles,weekProfiles,monthProfiles,dayAI,weekAI,monthAI,eventAI24,eventAI7,eventAI30]=await Promise.all([countAll('user_profiles'),countAll('user_profiles',since(1)),countAll('user_profiles',since(7)),countAll('user_profiles',since(30)),countAll('ai_usage_log',since(1)),countAll('ai_usage_log',since(7)),countAll('ai_usage_log',since(30)),countAll('app_events','&event_type=eq.ai_usage'+since(1)),countAll('app_events','&event_type=eq.ai_usage'+since(7)),countAll('app_events','&event_type=eq.ai_usage'+since(30))]);

 let aiComplete=[];try{aiComplete=await fetchPaged('/rest/v1/ai_usage_log?select=*&created_at=gte.'+encodeURIComponent(new Date(Date.now()-30*86400000).toISOString())+'&order=created_at.desc')}catch(err){console.error('AI detail history unavailable:',err.message)}
 const replyRows=await arr('/rest/v1/support_message_replies?select=message_id,reply_text,replied_at&order=replied_at.desc&limit=500');
 const replyMap=new Map();for(const r of replyRows)if(!replyMap.has(String(r.message_id)))replyMap.set(String(r.message_id),r);
 for(const msg of messages)msg.admin_reply=replyMap.get(String(msg.id))||null;
 let completeEvents=null;try{completeEvents=await fetchPaged('/rest/v1/app_events?select=*&created_at=gte.'+encodeURIComponent(new Date(Date.now()-30*86400000).toISOString())+'&order=created_at.desc')}catch(err){console.error('Activity breakdown unavailable:',err.message)}
 const now=Date.now(),d30=2592000000,e30=completeEvents||[],contains=(e,w)=>w.some(x=>(((e.event_type||'')+' '+(e.section||'')+' '+(e.detail||'')).toLowerCase()).includes(x));
 const c={primary:e30.filter(e=>contains(e,['primary','npse'])).length,jss:e30.filter(e=>contains(e,['jss','bece'])).length,sss:e30.filter(e=>contains(e,['sss','wassce'])).length,teachers:e30.filter(e=>contains(e,['teacher','lesson note','scheme of work'])).length,university:e30.filter(e=>contains(e,['university','topic finder','proposal','dissertation','defense','lecturer'])).length};
 const m={npseCount:e30.filter(e=>contains(e,['npse'])).length,beceCount:e30.filter(e=>contains(e,['bece'])).length,wassceCount:e30.filter(e=>contains(e,['wassce'])).length,reviewCount:e30.filter(e=>contains(e,['review'])).length,teacherEvents:c.teachers,schemeEvents:e30.filter(e=>contains(e,['scheme of work'])).length,lessonEvents:e30.filter(e=>contains(e,['lesson note','lesson plan'])).length,otherTeacherEvents:c.teachers,universityEvents:c.university,topicEvents:e30.filter(e=>contains(e,['topic finder'])).length,proposalEvents:e30.filter(e=>contains(e,['proposal','research'])).length,dissertationEvents:e30.filter(e=>contains(e,['dissertation','defense','thesis'])).length};
 if(completeEvents===null){for(const k of Object.keys(c))c[k]=null;for(const k of Object.keys(m))m[k]=null;}
 const active5=await countAll('user_profiles','&last_seen_at=gte.'+encodeURIComponent(new Date(now-300000).toISOString())),activeToday=await countAll('user_profiles','&last_seen_at=gte.'+encodeURIComponent(new Date(now-86400000).toISOString()));
 if(completeEvents===null){for(const key of Object.keys(c))c[key]=null;for(const key of Object.keys(m))m[key]=null;}
 const activeWindows={};for(const [key,ms] of Object.entries({day:86400000,week:604800000,month:2592000000})){
  const active=await countAll('user_profiles','&last_seen_at=gte.'+encodeURIComponent(new Date(now-ms).toISOString()));
  activeWindows[key]={active,inactive:totalProfiles==null||active==null?null:Math.max(0,totalProfiles-active)};
 }
 const pays=payments.map(p=>({...p,full_name:p.user_profiles?.full_name,category:p.user_profiles?.category}));
 const fallbackAI=events.filter(e=>e.event_type==='ai_usage').map(e=>{let d={};try{d=JSON.parse(e.detail||'{}')}catch{};const section=String(e.section||'');const matched=profiles.find(p=>String(p.id)===section||!!section&&String(p.device_id||'')===section);return {id:'event_'+e.id,profile_id:matched?matched.id:null,device_id:matched?matched.device_id:section,tool_key:d.tool_key||'learning-tool',model:d.model||'',source:d.source||'ai',created_at:e.created_at};});
 const dedicatedKeys=new Set(aiUsage.map(x=>[String(x.profile_id||''),String(x.tool_key||''),String(x.created_at||'').slice(0,16)].join('|')));
 const matchedAI=aiComplete.map(x=>{if(x.profile_id)return x;const match=profiles.find(p=>x.device_id&&String(p.device_id||'')===String(x.device_id));return match?{...x,profile_id:match.id}:x});
 const mergedAI=[...matchedAI,...fallbackAI.filter(x=>!dedicatedKeys.has([String(x.profile_id||''),String(x.tool_key||''),String(x.created_at||'').slice(0,16)].join('|')))];
 return json(200,{features,admin_identity:{email:(au.email||'').toLowerCase(),role:access.role},admins,reset_requests:resetRequests,summary:{registered_users:totalProfiles,new_users_24h:dayProfiles,new_users_today:await countAll('user_profiles','&created_at=gte.'+encodeURIComponent(new Date().toISOString().slice(0,10)+'T00:00:00Z')),new_users_7d:weekProfiles,new_users_30d:monthProfiles,ai_calls_24h:dayAI==null&&eventAI24==null?null:Math.max(dayAI||0,eventAI24||0),ai_calls_7d:weekAI==null&&eventAI7==null?null:Math.max(weekAI||0,eventAI7||0),ai_calls_30d_exact:monthAI==null&&eventAI30==null?null:Math.max(monthAI||0,eventAI30||0),events_30d:eventCount30,new_messages:messages.filter(x=>(x.status||'new')==='new').length,online_now:active5,active_today:await countAll('user_profiles','&last_seen_at=gte.'+encodeURIComponent(new Date().toISOString().slice(0,10)+'T00:00:00Z')),active_last_24h:activeToday,activity_windows:activeWindows,pwa_installed_devices:pwaDevices,pwa_installed_users:pwaUsers,pwa_tracking_note:"Only confirmed installation events recorded after deployment are counted.",ai_logging_status:monthAI===0&&fallbackAI.length>0?"Dedicated AI usage table has no recent records; event fallback detected.":"See AI usage logs for individual records.",ai_calls_30d:monthAI==null&&eventAI30==null?null:Math.max(monthAI||0,eventAI30||0)},categories:c,metrics:m,users,events,messages,profiles,payments:pays,ai_usage:mergedAI,platform_settings:settings[0]||{},announcement:anns[0]||null,system:{supabase:true,events_table:true,messages_table:true}});
}
;
