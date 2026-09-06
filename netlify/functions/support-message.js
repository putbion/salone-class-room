
exports.handler=async(event)=>{
 const H={'Content-Type':'application/json'},U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(event.httpMethod!=='POST')return{statusCode:405,headers:H,body:JSON.stringify({error:'Method not allowed'})};
 if(!U||!K)return{statusCode:500,headers:H,body:JSON.stringify({error:'Support service is not configured'})};
 let b={};try{b=JSON.parse(event.body||'{}')}catch{return{statusCode:400,headers:H,body:JSON.stringify({error:'Invalid request'})}}
 const c=(v,n)=>String(v||'').trim().slice(0,n);
 const row={name:c(b.name,120),user_type:c(b.user_type,80),message_type:c(b.message_type,80),contact:c(b.contact,180),message:c(b.message,4000),status:'new'};
 if(!row.name||!row.user_type||!row.message_type||!row.message)return{statusCode:400,headers:H,body:JSON.stringify({error:'Please complete all required fields.'})};
 const r=await fetch(U+'/rest/v1/support_messages',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)});
 return{statusCode:r.ok?200:500,headers:H,body:JSON.stringify(r.ok?{ok:true}:{error:'Unable to save message.'})};
};
