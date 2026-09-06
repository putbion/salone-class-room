
exports.handler=async(event)=>{
 const H={'Content-Type':'application/json','Cache-Control':'no-store'},U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!U||!K)return{statusCode:500,headers:H,body:JSON.stringify({error:'Platform backend is not configured.'})};
 const sf=(p,o={})=>fetch(U+p,{...o,headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',...(o.headers||{})}});
 const clean=(v,n=500)=>String(v||'').trim().slice(0,n);
 if(event.httpMethod==='GET'){
  const sr=await sf('/rest/v1/platform_settings?id=eq.1&select=*'),s=sr.ok?(await sr.json())[0]||{}:{};
  const ar=await sf('/rest/v1/announcements?active=eq.true&select=message,active,created_at&order=created_at.desc&limit=1'),a=ar.ok?(await ar.json())[0]||null:null;
  return{statusCode:200,headers:H,body:JSON.stringify({free_access_enabled:!!s.free_access_enabled,free_access_until:s.free_access_until,orange_money_number:s.orange_money_number||'',prices:{primary:+s.price_primary||0,jss:+s.price_jss||0,sss:+s.price_sss||0,teacher:+s.price_teacher||0,university:+s.price_university||0},announcement:a})};
 }
 if(event.httpMethod!=='POST')return{statusCode:405,headers:H,body:JSON.stringify({error:'Method not allowed'})};
 let b={};try{b=JSON.parse(event.body||'{}')}catch{return{statusCode:400,headers:H,body:JSON.stringify({error:'Invalid request'})}}
 if(b.action==='register'){
  const row={device_id:clean(b.device_id,120),full_name:clean(b.full_name,120),email:clean(b.email,180)||null,phone:clean(b.phone,60)||null,category:clean(b.category,30),town:clean(b.town,120),paid_active:false};
  if(!row.device_id||!row.full_name||(!row.email&&!row.phone)||!['primary','jss','sss','teacher','university'].includes(row.category)||!row.town)return{statusCode:400,headers:H,body:JSON.stringify({error:'Please complete all required information.'})};
  const r=await sf('/rest/v1/user_profiles?on_conflict=device_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
  return r.ok?{statusCode:200,headers:H,body:JSON.stringify({profile:(await r.json())[0]})}:{statusCode:500,headers:H,body:JSON.stringify({error:'Unable to create your account right now.'})};
 }
 if(b.action==='tool_use'){await sf('/rest/v1/tool_usage',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({device_id:clean(b.device_id,120),tool_key:clean(b.tool_key,100)})}).catch(()=>{});return{statusCode:200,headers:H,body:'{"ok":true}'}}
 if(b.action==='payment_request'){
  const pr=await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(clean(b.profile_id,80))+'&select=id,category'),p=pr.ok?(await pr.json())[0]:null;
  if(!p)return{statusCode:400,headers:H,body:JSON.stringify({error:'Registered profile not found.'})};
  const sr=await sf('/rest/v1/platform_settings?id=eq.1&select=*'),s=sr.ok?(await sr.json())[0]||{}:{};
  const row={profile_id:p.id,amount:+s['price_'+p.category]||0,sender_number:clean(b.sender_number,60),transaction_reference:clean(b.transaction_reference,120),status:'pending'};
  if(!row.sender_number||!row.transaction_reference)return{statusCode:400,headers:H,body:JSON.stringify({error:'Provide the Orange Money sender number and transaction reference.'})};
  const r=await sf('/rest/v1/payment_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
  return{statusCode:r.ok?200:500,headers:H,body:JSON.stringify(r.ok?{ok:true}:{error:'Unable to save payment request.'})};
 }
 return{statusCode:400,headers:H,body:JSON.stringify({error:'Unknown action'})};
};
