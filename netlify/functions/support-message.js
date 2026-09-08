exports.handler=async(event)=>{
 const H={'Content-Type':'application/json','Cache-Control':'no-store'},U=String(process.env.SUPABASE_URL||'').replace(/\/+$/,''),K=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(event.httpMethod!=='POST')return{statusCode:405,headers:H,body:JSON.stringify({error:'Method not allowed'})};
 if(!U||!K)return{statusCode:500,headers:H,body:JSON.stringify({error:'Support service is not configured'})};
 let b={};try{b=JSON.parse(event.body||'{}')}catch{return{statusCode:400,headers:H,body:JSON.stringify({error:'Invalid request'})}}
 const c=(v,n)=>String(v||'').trim().slice(0,n);
 const row={name:c(b.name,120),user_type:c(b.user_type,80),message_type:c(b.message_type,80),contact:c(b.contact,180),message:c(b.message,4000),status:'new'};
 if(!row.name||!row.user_type||!row.message_type||!row.message)return{statusCode:400,headers:H,body:JSON.stringify({error:'Please complete all required fields.'})};
 try{const r=await fetch(U+'/rest/v1/support_messages',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)});if(!r.ok){const d=await r.text();console.error('[support-message]',r.status,d);return{statusCode:500,headers:H,body:JSON.stringify({error:'We could not send your message. Please try again.'})}}return{statusCode:200,headers:H,body:JSON.stringify({ok:true})}}catch(e){console.error('[support-message]',e);return{statusCode:500,headers:H,body:JSON.stringify({error:'We could not send your message. Please try again.'})}}
};
