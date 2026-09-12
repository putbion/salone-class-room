const {enforceRate,bodyTooLarge,baseHeaders}=require('./_security');
exports.handler=async(event)=>{
 const H=baseHeaders,U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(event.httpMethod!=='POST')return{statusCode:405,headers:H,body:'{}'};
 if(bodyTooLarge(event,4096))return{statusCode:413,headers:H,body:'{}'};
 const rl=enforceRate(event,{name:'public-event',limit:20,windowMs:60000});if(rl)return rl;
 if(!U||!K)return{statusCode:204,headers:H,body:''};
 let b={};try{b=JSON.parse(event.body||'{}')}catch{return{statusCode:204,headers:H,body:''}}
 const c=(v,n)=>String(v||'').trim().slice(0,n);
 const type=c(b.event_type,80);if(!['page_view'].includes(type))return{statusCode:204,headers:H,body:''};
 await fetch(U+'/rest/v1/app_events',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({event_type:type,section:c(b.section,80),detail:c(b.detail,300)})}).catch(()=>{});
 return{statusCode:204,headers:H,body:''};
};
