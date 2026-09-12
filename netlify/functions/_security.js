const crypto=require('crypto');
const buckets=new Map();
const baseHeaders={
  'Content-Type':'application/json',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
};
const json=(statusCode,body,extra={})=>({statusCode,headers:{...baseHeaders,...extra},body:JSON.stringify(body)});
const clientIp=event=>String(event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']||event.headers?.['client-ip']||'unknown').split(',')[0].trim().slice(0,80);
const fingerprint=event=>{
  const secret=process.env.VISITOR_FINGERPRINT_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'salone-class-room';
  const ua=String(event.headers?.['user-agent']||'').slice(0,300);
  return crypto.createHmac('sha256',secret).update(clientIp(event)+'|'+ua).digest('hex').slice(0,40);
};
const rateLimit=(event,{name='default',limit=30,windowMs=60000,key}={})=>{
  const now=Date.now(),k=name+'|'+(key||clientIp(event));
  let b=buckets.get(k);
  if(!b||now>=b.reset){b={count:0,reset:now+windowMs};buckets.set(k,b)}
  b.count++;
  if(buckets.size>5000){for(const [x,v] of buckets){if(now>=v.reset)buckets.delete(x)}}
  return {allowed:b.count<=limit,retryAfter:Math.max(1,Math.ceil((b.reset-now)/1000)),remaining:Math.max(0,limit-b.count)};
};
const enforceRate=(event,opts)=>{const r=rateLimit(event,opts);return r.allowed?null:json(429,{error:'Too many requests. Please wait and try again.'},{'Retry-After':String(r.retryAfter)});};
const bodyTooLarge=(event,maxBytes=32768)=>Buffer.byteLength(event.body||'','utf8')>maxBytes;
module.exports={json,baseHeaders,clientIp,fingerprint,rateLimit,enforceRate,bodyTooLarge};
