const crypto=require('crypto');
const H={'Content-Type':'application/json','Cache-Control':'no-store'};
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const json=(status,body)=>({statusCode:status,headers:H,body:JSON.stringify(body)});
const tokenHash=t=>crypto.createHash('sha256').update(t).digest('hex');
const normalizeContact=v=>{const x=clean(v,180);if(x.includes('@'))return x.toLowerCase();return x.replace(/[\s()-]/g,'').replace(/^00/,'+');};
const validContact=v=>v.includes('@')?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v):/^\+?\d{7,15}$/.test(v);
const hashPassword=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
const verifyPassword=(password,salt,stored)=>{try{const a=Buffer.from(hashPassword(password,salt),'hex'),b=Buffer.from(stored||'','hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}};
const nowIn=(start,end)=>{const n=Date.now(),s=start?new Date(start).getTime():null,e=end?new Date(end).getTime():null;return (!s||n>=s)&&(!e||n<=e)};

exports.handler=async(event)=>{
 const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!U||!K){console.error('[platform-api] Missing Supabase environment variables');return json(500,{error:'Platform backend is not configured.'})}
 const sf=(p,o={})=>fetch(U+p,{...o,headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',...(o.headers||{})}});
 const arr=async p=>{const r=await sf(p);if(!r.ok)throw new Error(await r.text());return r.json()};
 const settings=async()=>{try{return (await arr('/rest/v1/platform_settings?id=eq.1&select=*'))[0]||{}}catch{return {}}};
 const accessFor=(p,s)=>{
   if(!p)return{allowed:false,reason:'registration_required',status:'SIGNED OUT'};
   if((p.account_status||'active')!=='active')return{allowed:false,reason:'blocked',status:'BLOCKED'};
   if(s.free_access_enabled&&nowIn(s.free_access_start,s.free_access_until))return{allowed:true,reason:'global_free',status:'FREE'};
   if(s[p.category+'_free'])return{allowed:true,reason:'category_free',status:'FREE'};
   if(nowIn(p.free_access_start,p.free_access_end)&&(p.free_access_start||p.free_access_end))return{allowed:true,reason:'individual_free',status:'FREE'};
   if(p.paid_active&&nowIn(p.paid_access_start,p.paid_access_end))return{allowed:true,reason:'paid',status:'PAID ACTIVE'};
   if(p.paid_active&&!p.paid_access_end)return{allowed:true,reason:'paid_legacy',status:'PAID ACTIVE'};
   return{allowed:false,reason:'payment_required',status:p.paid_access_end&&new Date(p.paid_access_end)<new Date()?'EXPIRED':'PAYMENT REQUIRED'};
 };
 const sessionProfile=async()=>{
   const auth=event.headers.authorization||event.headers.Authorization||'';const t=auth.startsWith('Bearer ')?auth.slice(7):'';if(!t)return null;
   try{
    const ss=await arr('/rest/v1/user_sessions?token_hash=eq.'+encodeURIComponent(tokenHash(t))+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=id,profile_id&limit=1');
    if(!ss[0])return null;
    const ps=await arr('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(ss[0].profile_id)+'&select=*&limit=1');
    if(!ps[0])return null;
    await sf('/rest/v1/user_sessions?id=eq.'+encodeURIComponent(ss[0].id),{method:'PATCH',body:JSON.stringify({last_seen_at:new Date().toISOString()})}).catch(()=>{});
    return ps[0];
   }catch(e){console.error('[platform-api][session]',e.message);return null}
 };
 const createSession=async(profileId,deviceId)=>{
   const token=crypto.randomBytes(32).toString('hex'),expires=new Date(Date.now()+90*86400000).toISOString();
   const row={profile_id:profileId,token_hash:tokenHash(token),device_id:clean(deviceId,120)||null,expires_at:expires,user_agent:clean(event.headers['user-agent'],300)||null};
   const r=await sf('/rest/v1/user_sessions',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});if(!r.ok)throw new Error(await r.text());return{token,expires_at:expires};
 };
 try{
  if(event.httpMethod==='GET'){
    const s=await settings();
    let a=null;try{const aa=await arr('/rest/v1/announcements?active=eq.true&select=message,active,created_at,starts_at,ends_at,target_category&order=created_at.desc&limit=5');const n=Date.now();a=aa.find(x=>(!x.starts_at||new Date(x.starts_at).getTime()<=n)&&(!x.ends_at||new Date(x.ends_at).getTime()>=n))||null}catch{}
    const p=await sessionProfile();
    return json(200,{free_access_enabled:!!s.free_access_enabled,free_access_start:s.free_access_start||null,free_access_until:s.free_access_until||null,orange_money_number:s.orange_money_number||'',prices:{primary:+s.price_primary||0,jss:+s.price_jss||0,sss:+s.price_sss||0,teacher:+s.price_teacher||0,university:+s.price_university||0},announcement:a,profile:p?{...p,password_hash:undefined,password_salt:undefined}:null,access:p?accessFor(p,s):null});
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
  let b={};try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
  if(b.action==='register'){
    const contact=normalizeContact(b.contact),password=String(b.password||'');
    const row={device_id:clean(b.device_id,120)||('acct_'+crypto.randomBytes(10).toString('hex')),full_name:clean(b.full_name,120),contact,contact_normalized:contact,category:clean(b.category,30),town:clean(b.town,120),paid_active:false,account_status:'active',last_login_at:new Date().toISOString(),last_seen_at:new Date().toISOString()};
    if(!row.full_name||!validContact(contact)||password.length<6||!['primary','jss','sss','teacher','university'].includes(row.category)||!row.town)return json(400,{error:'Complete your name, phone number or email, password, category and town/city.'});
    const exists=await arr('/rest/v1/user_profiles?contact_normalized=eq.'+encodeURIComponent(contact)+'&select=id&limit=1').catch(()=>[]);if(exists[0])return json(409,{error:'An account already exists for this phone number or email. Please use Login.'});
    const salt=crypto.randomBytes(16).toString('hex');row.password_salt=salt;row.password_hash=hashPassword(password,salt);if(contact.includes('@'))row.email=contact;else row.phone=contact;
    const r=await sf('/rest/v1/user_profiles',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});if(!r.ok){const detail=await r.text();console.error('[platform-api][register]',r.status,detail);return json(500,{error:'Unable to create your account right now.',diagnostic:detail.slice(0,400)})}
    const p=(await r.json())[0],ses=await createSession(p.id,row.device_id),s=await settings();delete p.password_hash;delete p.password_salt;return json(200,{profile:p,session:ses,access:accessFor(p,s)});
  }
  if(b.action==='login'){
    const contact=normalizeContact(b.contact),password=String(b.password||'');const ps=await arr('/rest/v1/user_profiles?contact_normalized=eq.'+encodeURIComponent(contact)+'&select=*&limit=1').catch(()=>[]);const p=ps[0];
    if(!p||!verifyPassword(password,p.password_salt,p.password_hash))return json(401,{error:'Phone number/email or password is incorrect.'});
    if((p.account_status||'active')!=='active')return json(403,{error:'This account is blocked. Please contact Salone Class Room support.'});
    const t=new Date().toISOString();await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',body:JSON.stringify({last_login_at:t,last_seen_at:t,device_id:clean(b.device_id,120)||p.device_id})});
    const ses=await createSession(p.id,b.device_id),s=await settings();delete p.password_hash;delete p.password_salt;return json(200,{profile:p,session:ses,access:accessFor(p,s)});
  }
  if(b.action==='logout'){
    const auth=event.headers.authorization||'',t=auth.startsWith('Bearer ')?auth.slice(7):'';if(t)await sf('/rest/v1/user_sessions?token_hash=eq.'+encodeURIComponent(tokenHash(t)),{method:'DELETE'}).catch(()=>{});return json(200,{ok:true});
  }
  if(b.action==='heartbeat'){
    const p=await sessionProfile();if(!p)return json(401,{error:'Sign in required.'});const tool=clean(b.current_tool,120)||null;await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',body:JSON.stringify({last_seen_at:new Date().toISOString(),current_tool:tool})});const s=await settings();return json(200,{ok:true,access:accessFor(p,s)});
  }
  if(b.action==='tool_use'){
    await sf('/rest/v1/tool_usage',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({device_id:clean(b.device_id,120),tool_key:clean(b.tool_key,100)})}).catch(()=>{});return json(200,{ok:true});
  }
  if(b.action==='payment_request'){
    const p=await sessionProfile();if(!p)return json(401,{error:'Please log in before submitting payment.'});const s=await settings();const row={profile_id:p.id,amount:+s['price_'+p.category]||0,sender_number:clean(b.sender_number,60),transaction_reference:clean(b.transaction_reference,120),status:'pending'};if(!row.sender_number||!row.transaction_reference)return json(400,{error:'Provide the Orange Money sender number and transaction reference.'});const r=await sf('/rest/v1/payment_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to save payment request.'});
  }
  return json(400,{error:'Unknown action.'});
 }catch(e){console.error('[platform-api] Unexpected error',e);return json(500,{error:'The platform could not complete this request. Please try again.'})}
};
