const crypto=require('crypto');
const {json,enforceRate,bodyTooLarge}=require('./_security');
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const tokenHash=t=>crypto.createHash('sha256').update(t).digest('hex');
const questionHash=t=>crypto.createHash('sha256').update(String(t||'').trim().toLowerCase()).digest('hex');
const normalizeContact=v=>{const x=clean(v,180);if(x.includes('@'))return x.toLowerCase();return x.replace(/[\s()-]/g,'').replace(/^00/,'+');};
const validContact=v=>v.includes('@')?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v):/^\+?\d{7,15}$/.test(v);
const hashPassword=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
const verifyPassword=(password,salt,stored)=>{try{const a=Buffer.from(hashPassword(password,salt),'hex'),b=Buffer.from(stored||'','hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}};
const nowIn=(start,end)=>{const n=Date.now(),s=start?new Date(start).getTime():null,e=end?new Date(end).getTime():null;return(!s||n>=s)&&(!e||n<=e)};
const norm=v=>clean(v,240).toLowerCase().replace(/&/g,' and ').replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const subjectKey=v=>{
 const n=norm(v);
 const aliases={
  'information and communication technology':'ict','information communication technology':'ict','ict':'ict',
  'krio language':'krio','krio':'krio','english language':'english language','english':'english language',
  'mathematics':'mathematics','maths':'mathematics','integrated science':'integrated science',
  'religious and moral education':'religious and moral education','rme':'religious and moral education',
  'physical and health education':'physical and health education','physical health education':'physical and health education',
  'social studies and civics':'social studies','social studies':'social studies','civic education':'civic education',
  'agricultural science':'agricultural science','agriculture':'agricultural science',
  'french as a foreign language':'french','french':'french'
 };
 return aliases[n]||n;
};
const levelKey=v=>{const n=norm(v);if(n.includes('primary'))return'primary';if(n.includes('junior')||n==='jss')return'jss';if(n.includes('senior')||n==='sss')return'sss';return n};

exports.handler=async(event)=>{
 if(bodyTooLarge(event,32768))return json(413,{error:'Request is too large.'});
 const generalLimit=enforceRate(event,{name:'platform',limit:90,windowMs:60000});if(generalLimit)return generalLimit;
 const U=String(process.env.SUPABASE_URL||'').replace(/\/+$/,''),K=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!U||!K){console.error('[platform-api] Missing Supabase environment variables');return json(500,{error:'Platform backend is not configured.'})}
 const sf=(p,o={})=>fetch(U+(p.startsWith('/')?p:'/'+p),{...o,headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',...(o.headers||{})}});
 const arr=async p=>{const r=await sf(p);if(!r.ok)throw new Error(await r.text());return r.json()};
 const settings=async()=>{try{return(await arr('/rest/v1/platform_settings?id=eq.1&select=*'))[0]||{}}catch{return{}}};
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
  const auth=event.headers.authorization||event.headers.Authorization||'',t=auth.startsWith('Bearer ')?auth.slice(7):'';if(!t)return null;
  try{const ss=await arr('/rest/v1/user_sessions?token_hash=eq.'+encodeURIComponent(tokenHash(t))+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=id,profile_id&limit=1');if(!ss[0])return null;const ps=await arr('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(ss[0].profile_id)+'&select=*&limit=1');if(!ps[0])return null;await sf('/rest/v1/user_sessions?id=eq.'+encodeURIComponent(ss[0].id),{method:'PATCH',body:JSON.stringify({last_seen_at:new Date().toISOString()})}).catch(()=>{});return ps[0]}catch(e){console.error('[platform-api][session]',e.message);return null}
 };
 const createSession=async(profileId,deviceId)=>{const token=crypto.randomBytes(32).toString('hex'),expires=new Date(Date.now()+7*86400000).toISOString();const row={profile_id:profileId,token_hash:tokenHash(token),device_id:clean(deviceId,120)||null,expires_at:expires,user_agent:clean(event.headers['user-agent'],300)||null};const r=await sf('/rest/v1/user_sessions',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});if(!r.ok)throw new Error(await r.text());return{token,expires_at:expires}};
 try{
  if(event.httpMethod==='GET'){
   const s=await settings();let a=null;try{const aa=await arr('/rest/v1/announcements?active=eq.true&select=message,active,created_at,starts_at,ends_at,target_category&order=created_at.desc&limit=5');const n=Date.now();a=aa.find(x=>(!x.starts_at||new Date(x.starts_at).getTime()<=n)&&(!x.ends_at||new Date(x.ends_at).getTime()>=n))||null}catch{}
   const p=await sessionProfile();return json(200,{free_access_enabled:!!s.free_access_enabled,free_access_start:s.free_access_start||null,free_access_until:s.free_access_until||null,orange_money_number:s.orange_money_number||'',prices:{primary:+s.price_primary||0,jss:+s.price_jss||0,sss:+s.price_sss||0,teacher:+s.price_teacher||0,university:+s.price_university||0},announcement:a,profile:p?{...p,password_hash:undefined,password_salt:undefined}:null,access:p?accessFor(p,s):null});
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
  let b={};try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}

  if(b.action==='curriculum_topics'){
   const rl=enforceRate(event,{name:'curriculum-topics',limit:60,windowMs:60000});if(rl)return rl;
   const wantedLevel=levelKey(b.level),wantedSubject=subjectKey(b.subject),wantedClass=norm(b.class_level);
   if(!wantedLevel||!wantedSubject)return json(400,{error:'Choose a school level and subject.'});
   let rows=[];
   try{rows=await arr('/rest/v1/curriculum_topics?active=eq.true&select=education_level,class_level,subject,unit_title,topic,verified&limit=1000')}catch(e){console.error('[platform-api][curriculum_topics]',e.message);return json(500,{error:'Curriculum topics are temporarily unavailable.'})}
   const sameClass=r=>{if(!wantedClass)return true;const c=norm(r.class_level);return !c||c===wantedClass||c.includes(wantedClass)||wantedClass.includes(c)};
   const candidates=rows.filter(r=>levelKey(r.education_level)===wantedLevel&&subjectKey(r.subject)===wantedSubject&&sameClass(r));
   const broader=candidates.length?candidates:rows.filter(r=>levelKey(r.education_level)===wantedLevel&&subjectKey(r.subject)===wantedSubject);
   const seen=new Set(),topics=[];
   for(const r of broader){for(const raw of [r.topic,r.unit_title]){const t=clean(raw,220);if(!t)continue;const k=norm(t);if(!k||k===norm(r.subject)||subjectKey(t)===wantedSubject)continue;if(!seen.has(k)){seen.add(k);topics.push(t)}break}}
   topics.sort((a,b)=>a.localeCompare(b));return json(200,{topics:topics.slice(0,150)});
  }

  if(b.action==='register'){
   const rl=enforceRate(event,{name:'register',limit:5,windowMs:60*60*1000});if(rl)return rl;
   const contact=normalizeContact(b.contact),password=String(b.password||'');const row={device_id:clean(b.device_id,120)||('acct_'+crypto.randomBytes(10).toString('hex')),full_name:clean(b.full_name,120),contact,contact_normalized:contact,category:clean(b.category,30),town:clean(b.town,120),paid_active:false,account_status:'active',last_login_at:new Date().toISOString(),last_seen_at:new Date().toISOString()};
   if(!row.full_name||!validContact(contact)||password.length<12||password.length>128||!['primary','jss','sss','teacher','university'].includes(row.category)||!row.town)return json(400,{error:'Complete your name, phone number or email, password, category and town/city.'});
   const exists=await arr('/rest/v1/user_profiles?contact_normalized=eq.'+encodeURIComponent(contact)+'&select=id&limit=1').catch(()=>[]);if(exists[0])return json(409,{error:'An account already exists for this phone number or email. Please use Login.'});
   const salt=crypto.randomBytes(16).toString('hex');row.password_salt=salt;row.password_hash=hashPassword(password,salt);if(contact.includes('@'))row.email=contact;else row.phone=contact;
   const r=await sf('/rest/v1/user_profiles',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});if(!r.ok){const detail=await r.text();console.error('[platform-api][register]',r.status,detail);return json(500,{error:'We could not create your account. Please try again.'})}
   const p=(await r.json())[0],ses=await createSession(p.id,row.device_id),s=await settings();delete p.password_hash;delete p.password_salt;return json(200,{profile:p,session:ses,access:accessFor(p,s)});
  }
  if(b.action==='login'){
   const rl=enforceRate(event,{name:'login',limit:10,windowMs:15*60*1000});if(rl)return rl;
   const contact=normalizeContact(b.contact),password=String(b.password||'');if(password.length>128)return json(401,{error:'Phone number/email or password is incorrect.'});const ps=await arr('/rest/v1/user_profiles?contact_normalized=eq.'+encodeURIComponent(contact)+'&select=*&limit=1').catch(()=>[]),p=ps[0];if(!p||!verifyPassword(password,p.password_salt,p.password_hash))return json(401,{error:'Phone number/email or password is incorrect.'});if((p.account_status||'active')!=='active')return json(403,{error:'This account is blocked. Please contact Salone Class Room support.'});const t=new Date().toISOString();await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',body:JSON.stringify({last_login_at:t,last_seen_at:t,device_id:clean(b.device_id,120)||p.device_id})});const ses=await createSession(p.id,b.device_id),s=await settings();delete p.password_hash;delete p.password_salt;return json(200,{profile:p,session:ses,access:accessFor(p,s)});
  }
  if(b.action==='logout'){const auth=event.headers.authorization||'',t=auth.startsWith('Bearer ')?auth.slice(7):'';if(t)await sf('/rest/v1/user_sessions?token_hash=eq.'+encodeURIComponent(tokenHash(t)),{method:'DELETE'}).catch(()=>{});return json(200,{ok:true})}
  if(b.action==='heartbeat'){const p=await sessionProfile();if(!p)return json(401,{error:'Sign in required.'});const tool=clean(b.current_tool,120)||null;await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',body:JSON.stringify({last_seen_at:new Date().toISOString(),current_tool:tool})});const s=await settings();return json(200,{ok:true,access:accessFor(p,s)})}

  if(b.action==='practice_record'){
   const p=await sessionProfile();if(!p)return json(401,{error:'Please log in to save your learning journey.'});const q=clean(b.question,2000);if(!q)return json(400,{error:'Question is required.'});const row={profile_id:p.id,level:clean(b.level,30)||null,subject:clean(b.subject,180)||'General',topic:clean(b.topic,220)||null,question_text:q,question_hash:questionHash(q),selected_index:Number.isInteger(+b.selected_index)?+b.selected_index:null,correct_index:Number.isInteger(+b.correct_index)?+b.correct_index:null,is_correct:!!b.is_correct,weak_area:clean(b.weak_area,220)||null};const r=await sf('/rest/v1/practice_attempts',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Your practice result could not be saved.'});
  }
  if(b.action==='progress'){
   const p=await sessionProfile();if(!p)return json(401,{error:'Please log in to see My Learning Journey.'});const rows=await arr('/rest/v1/practice_attempts?profile_id=eq.'+encodeURIComponent(p.id)+'&select=subject,topic,is_correct,weak_area,created_at&order=created_at.desc&limit=500').catch(()=>[]);const attempted=rows.length,correct=rows.filter(x=>x.is_correct).length,wrong=attempted-correct,score=attempted?Math.round(correct*100/attempted):0;const groups={};for(const r of rows){const s=r.subject||'General';groups[s]??={subject:s,attempted:0,correct:0};groups[s].attempted++;if(r.is_correct)groups[s].correct++}const subjects=Object.values(groups).map(x=>({...x,score:x.attempted?Math.round(x.correct*100/x.attempted):0})).sort((a,b)=>b.attempted-a.attempted);const tg={};for(const r of rows){const t=r.topic||r.weak_area||'General';tg[t]??={topic:t,attempted:0,correct:0};tg[t].attempted++;if(r.is_correct)tg[t].correct++}const weak_topics=Object.values(tg).map(x=>({...x,score:x.attempted?Math.round(x.correct*100/x.attempted):0})).filter(x=>x.attempted>=1&&x.score<70).sort((a,b)=>a.score-b.score||b.attempted-a.attempted).slice(0,8);return json(200,{attempted,correct,wrong,score,subjects,weak_topics,recent:rows.slice(0,10)});
  }


  if(b.action==='password_reset_request'){
   const rl=enforceRate(event,{name:'password-reset',limit:5,windowMs:60*60*1000});if(rl)return rl;
   const contact=normalizeContact(b.contact);
   if(!contact||!validContact(contact))return json(400,{error:'Enter the phone number or email used for your account.'});
   const ps=await arr('/rest/v1/user_profiles?contact_normalized=eq.'+encodeURIComponent(contact)+'&select=id,full_name,contact,email,phone&limit=1').catch(()=>[]);
   const p=ps[0];
   // Always return a neutral success message so account existence is not exposed publicly.
   if(p){
    await sf('/rest/v1/password_reset_requests',{
      method:'POST',
      headers:{Prefer:'return=minimal'},
      body:JSON.stringify({profile_id:p.id,status:'pending',requested_at:new Date().toISOString()})
    }).catch(()=>{});
   }
   return json(200,{ok:true});
  }

  if(b.action==='payment_request'){const rl=enforceRate(event,{name:'payment-request',limit:8,windowMs:60*60*1000});if(rl)return rl;const p=await sessionProfile();if(!p)return json(401,{error:'Please log in before submitting payment.'});const s=await settings(),row={profile_id:p.id,amount:+s['price_'+p.category]||0,sender_number:clean(b.sender_number,60),transaction_reference:clean(b.transaction_reference,120),status:'pending'};if(!row.sender_number||!row.transaction_reference)return json(400,{error:'Provide the Orange Money sender number and transaction reference.'});const r=await sf('/rest/v1/payment_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});return r.ok?json(200,{ok:true}):json(500,{error:'Unable to save payment request.'})}
  return json(400,{error:'Unknown action.'});
 }catch(e){console.error('[platform-api] Unexpected error',e);return json(500,{error:'We could not complete this request. Please try again.'})}
};
