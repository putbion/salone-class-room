import {createHash,createHmac,timingSafeEqual} from 'node:crypto'

const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})

export default async req=>{
  if(req.method!=='POST')return json(405,{error:'Method not allowed.'})
  const raw=await req.text()
  if(raw.length>12000)return json(413,{error:'Request is too large.'})
  let body
  try{body=JSON.parse(raw)}catch{return json(400,{error:'Invalid request.'})}
  const level=String(body.level||'').slice(0,30),subject=String(body.subject||'').slice(0,180),topic=String(body.topic||'').slice(0,1200),token=String(body.token||'')
  if(!topic)return json(400,{error:'A diagram topic is required.'})
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY
  try{
    const [ticket,signature]=token.split('.'),expected=createHmac('sha256',secret).update(ticket).digest('base64url')
    if(!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new Error('signature')
    const claim=JSON.parse(Buffer.from(ticket,'base64url').toString('utf8'))
    if(claim.exp<Date.now()||claim.topic_hash!==createHash('sha256').update(topic).digest('hex'))throw new Error('claim')
  }catch{return json(403,{error:'Diagram request is not authorized.'})}
  const key=process.env.NETLIFY_AI_GATEWAY_KEY,base=String(process.env.NETLIFY_AI_GATEWAY_BASE_URL||'').replace(/\/$/,'')
  if(!key||!base)return json(503,{error:'Diagram generation is not configured.'})
  const prompt=`Create one clear, accurate educational visual for a ${level||'student'} learner studying ${subject||'this topic'}: ${topic}. Use a clean textbook style, readable labels, a plain light background, and age-appropriate detail. If this asks for a map, show the requested geographic area accurately and label only relevant features. Do not add decorative or unrelated elements.`
  try{
    const response=await fetch(`${base}/v1beta/models/gemini-3.1-flash-image:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}})})
    const data=await response.json()
    if(!response.ok)throw new Error('Image service '+response.status)
    const part=data.candidates?.[0]?.content?.parts?.find(item=>item.inlineData?.data)
    if(!part)return json(502,{error:'No diagram was returned.'})
    return json(200,{image:`data:${part.inlineData.mimeType||'image/png'};base64,${part.inlineData.data}`,alt:`Educational visual for ${topic.slice(0,180)}`})
  }catch(error){console.error('[diagram]',error.message);return json(502,{error:'The diagram could not be generated right now.'})}
}
