const H={'Content-Type':'application/json','Cache-Control':'no-store'};
const json=(statusCode,body)=>({statusCode,headers:H,body:JSON.stringify(body)});
const clean=(v,n)=>String(v??'').trim().slice(0,n);
const htmlEscape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
exports.handler=async(event)=>{
 if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
 const U=String(process.env.SUPABASE_URL||'').replace(/\/+$/,''),K=process.env.SUPABASE_SERVICE_ROLE_KEY,RESEND=process.env.RESEND_API_KEY;
 const TO=process.env.SUPPORT_TO_EMAIL||process.env.ADMIN_EMAIL||'pytbion26@gmail.com';
 const FROM=process.env.SUPPORT_FROM_EMAIL||'Salone Class Room <onboarding@resend.dev>';
 let b={};try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request'})}
 const row={name:clean(b.name,120),user_type:clean(b.user_type,80),message_type:clean(b.message_type,80),contact:clean(b.contact,180),message:clean(b.message,4000),status:'new'};
 if(!row.name||!row.user_type||!row.message_type||!row.message)return json(400,{error:'Please complete all required fields.'});
 if(row.contact&&row.contact.length>180)return json(400,{error:'Contact information is too long.'});
 let saved=false;
 if(U&&K){
  try{const r=await fetch(U+'/rest/v1/support_messages',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)});saved=r.ok;if(!r.ok)console.error('[support-message][supabase]',r.status,(await r.text()).slice(0,500))}catch(e){console.error('[support-message][supabase]',e)}
 }
 if(!RESEND)return json(503,{error:'Direct email delivery is not configured yet. Please try again later.',saved});
 const subject=`Salone Class Room ${row.message_type}: ${row.name}`.slice(0,180);
 const bodyHtml=`<h2>New Salone Class Room message</h2><p><strong>Name:</strong> ${htmlEscape(row.name)}</p><p><strong>User type:</strong> ${htmlEscape(row.user_type)}</p><p><strong>Message type:</strong> ${htmlEscape(row.message_type)}</p><p><strong>Contact:</strong> ${htmlEscape(row.contact||'Not provided')}</p><hr><p style="white-space:pre-wrap">${htmlEscape(row.message)}</p>`;
 try{
  const payload={from:FROM,to:[TO],subject,html:bodyHtml};
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact))payload.reply_to=row.contact;
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+RESEND},body:JSON.stringify(payload)});
  const raw=await r.text();if(!r.ok){console.error('[support-message][email]',r.status,raw.slice(0,800));return json(502,{error:'Your message was saved, but the email could not be delivered right now. Please try again.',saved})}
  let d={};try{d=JSON.parse(raw)}catch{}
  return json(200,{ok:true,sent:true,saved,email_id:d.id||null});
 }catch(e){console.error('[support-message][email]',e);return json(502,{error:'Your message was saved, but the email could not be delivered right now. Please try again.',saved})}
};
