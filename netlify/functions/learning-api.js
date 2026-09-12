const crypto=require('crypto');
const {json,enforceRate,bodyTooLarge,fingerprint}=require('./_security');
const clean=(v,n=4000)=>String(v??'').trim().slice(0,n);
const tokenHash=t=>crypto.createHash('sha256').update(t).digest('hex');
const nowIn=(start,end)=>{const n=Date.now(),s=start?new Date(start).getTime():null,e=end?new Date(end).getTime():null;return(!s||n>=s)&&(!e||n<=e)};
const terms=q=>clean(q,180).toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).filter(x=>x.length>2&&!['explain','what','does','mean','teach','about','please','give','define','tell'].includes(x)).slice(0,5);
exports.handler=async(event)=>{
 if(bodyTooLarge(event,65536))return json(413,{error:'Request is too large.'});
 const generalLimit=enforceRate(event,{name:'learning',limit:30,windowMs:60000});if(generalLimit)return generalLimit;
 const U=String(process.env.SUPABASE_URL||'').replace(/\/+$/,''),K=process.env.SUPABASE_SERVICE_ROLE_KEY,GROQ=process.env.GROQ_API_KEY,DEEPSEEK=process.env.DEEPSEEK_API_KEY;
 if(!U||!K)return json(500,{error:'Learning backend is not configured.'});if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
 let b={};try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}
 const sf=(p,o={})=>fetch(U+(p.startsWith('/')?p:'/'+p),{...o,headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',...(o.headers||{})}});const arr=async p=>{const r=await sf(p);if(!r.ok)throw new Error(await r.text());return r.json()};
 const s=(await arr('/rest/v1/platform_settings?id=eq.1&select=*').catch(()=>[]))[0]||{};
 const getProfile=async()=>{const auth=event.headers.authorization||'',t=auth.startsWith('Bearer ')?auth.slice(7):'';if(!t)return null;const ss=await arr('/rest/v1/user_sessions?token_hash=eq.'+encodeURIComponent(tokenHash(t))+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=profile_id&limit=1').catch(()=>[]);if(!ss[0])return null;return(await arr('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(ss[0].profile_id)+'&select=*&limit=1').catch(()=>[]))[0]||null};
 const p=await getProfile(),toolKey=clean(b.tool_key,100)||clean(b.task,100)||'learning-tool',clientDeviceId=clean(b.device_id,120),anonDeviceId='anon_'+fingerprint(event),deviceId=p?clientDeviceId:anonDeviceId;
 // Administrator sessions are separate from ordinary learner/teacher sessions.
 // Validate the admin token against the existing secure admin-api before granting free platform access.
 const rawAdminToken=clean(event.headers?.['x-admin-token']||event.headers?.['X-Admin-Token'],1000);
 const validateAdmin=async()=>{
  if(!rawAdminToken)return false;
  const base=String(process.env.URL||((event.headers?.host)?('https://'+event.headers.host):'')).replace(/\/+$/,'');
  if(!base)return false;
  try{
   const r=await fetch(base+'/.netlify/functions/admin-api',{method:'GET',headers:{Authorization:'Bearer '+rawAdminToken,'Cache-Control':'no-store'}});
   return r.ok;
  }catch(e){console.warn('[learning-api][admin-validation]',e.message);return false}
 };
 const isAdmin=await validateAdmin();
 const aiKey=isAdmin?('admin:'+tokenHash(rawAdminToken)):(p?('profile:'+p.id):anonDeviceId);const aiRate=enforceRate(event,{name:'ai-generation',limit:isAdmin?120:(p?60:8),windowMs:60*60*1000,key:aiKey});if(aiRate)return aiRate;
 const allowedProfile=()=>{if(!p)return false;if((p.account_status||'active')!=='active')return false;if(s.free_access_enabled&&nowIn(s.free_access_start,s.free_access_until))return true;if(s[p.category+'_free'])return true;if((p.free_access_start||p.free_access_end)&&nowIn(p.free_access_start,p.free_access_end))return true;if(p.paid_active&&(!p.paid_access_end||nowIn(p.paid_access_start,p.paid_access_end)))return true;return false};
 // Verified administrators bypass learner payment and category-access locks.
 if(!isAdmin&&p&&!allowedProfile())return json(402,{error:'Your access period has ended. Please complete payment or contact the administrator.',code:'payment_required'});
 if(!p&&!isAdmin){if(!deviceId)return json(401,{error:'Please create an account to continue.',code:'registration_required'});const prior=await arr('/rest/v1/tool_usage?device_id=eq.'+encodeURIComponent(deviceId)+'&tool_key=eq.'+encodeURIComponent(toolKey)+'&select=id&limit=1').catch(()=>[]);if(prior[0])return json(401,{error:'You have used the free trial for this function. Please create an account or log in to continue.',code:'registration_required'});await sf('/rest/v1/tool_usage',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({device_id:deviceId,tool_key:toolKey})}).catch(()=>{})}
 if(p)await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',body:JSON.stringify({last_seen_at:new Date().toISOString(),current_tool:toolKey})}).catch(()=>{});
 const level=clean(b.level,30).toLowerCase(),classLevel=clean(b.class_level,80),subject=clean(b.subject,180),topic=clean(b.topic||b.prompt,1200),task=clean(b.task,80)||'tutor',context=clean(b.context,5000),more=b.detail_mode==='more';
 const questionCount=Math.max(1,Math.min(5,Number(b.question_count)||5));
 const excludedQuestions=Array.isArray(b.excluded_questions)?b.excluded_questions.map(x=>clean(x,500)).filter(Boolean).slice(-50):[];
 if(!topic)return json(400,{error:'Please choose or type a topic, question or instruction.'});
 const allowedTasks=new Set(['tutor','assignment','review','topics','proposal','dissertation','defense','teacher','teacher_exam','quiz','lecturer']);if(!allowedTasks.has(task))return json(400,{error:'Unsupported learning task.'});
 const allowedLevels=new Set(['','primary','jss','sss','npse','bece','wassce','university']);if(!allowedLevels.has(level))return json(400,{error:'Unsupported education level.'});
 await sf('/rest/v1/app_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({event_type:task||'learning',section:level||'learning',detail:(toolKey+' | '+subject+' | '+topic).slice(0,500)})}).catch(()=>{});
 try{
  // Retrieve Sierra Leone curriculum material as grounding. Do not return short DB snippets directly:
  // the AI uses them as controlled context so explanations can still be complete.
  let curriculumGrounding='';
  if(subject){
   const ts=terms(topic),bits=[];
   for(const q0 of [topic,...ts].slice(0,3)){
    const safeQ=clean(q0,120).replace(/[^a-zA-Z0-9\s-]/g,' ').replace(/\s+/g,' ').trim();if(!safeQ)continue;const q=encodeURIComponent(safeQ),lev=encodeURIComponent(level),subj=encodeURIComponent(subject);
    try{
     const rows=await arr('/rest/v1/curriculum_topics?education_level=eq.'+lev+'&subject=eq.'+subj+'&active=eq.true&or=(topic.ilike.*'+q+'*,unit_title.ilike.*'+q+'*)&select=unit_title,topic,learning_outcomes,sierra_leone_context,verified&order=verified.desc&limit=3');
     for(const c of rows)bits.push([c.unit_title,c.topic,c.learning_outcomes,c.sierra_leone_context,c.verified?'Verified curriculum record':''].filter(Boolean).join(' | '));
    }catch{}
    try{
     const rows=await arr('/rest/v1/learning_content?education_level=eq.'+lev+'&subject=eq.'+subj+'&active=eq.true&or=(topic.ilike.*'+q+'*,title.ilike.*'+q+'*)&select=title,topic,short_answer,detailed_answer,content,sierra_leone_example,verified&order=verified.desc&limit=2');
     for(const c of rows)bits.push([c.title,c.topic,c.short_answer,c.detailed_answer,c.content,c.sierra_leone_example,c.verified?'Verified learning record':''].filter(Boolean).join(' | '));
    }catch{}
   }
   curriculumGrounding=[...new Set(bits)].slice(0,8).join('\n');
  }
  if(s.ai_enabled===false)return json(503,{error:'AI assistance is temporarily disabled by the administrator. Please try again later.'});
  if(!GROQ&&!DEEPSEEK)return json(503,{error:'The AI service is not configured yet.'});
  const groqModel=clean(process.env.GROQ_MODEL,100)||'openai/gpt-oss-20b';
  const deepseekModel=clean(process.env.DEEPSEEK_MODEL,100)||'deepseek-v4-flash';
  const schoolLevel=['primary','jss','sss','npse','bece','wassce'].includes(level);
  const role=level==='primary'||level==='npse'?'Use child-friendly English appropriate to the selected Primary class. Explain fully enough for the learner to understand.':level==='jss'||level==='bece'?'Use clear Junior Secondary English. Explain concepts properly and include examples when useful.':level==='sss'||level==='wassce'?'Use clear Senior Secondary/WASSCE-level English with proper explanation, examples and exam-relevant detail when useful.':level==='university'?'Use well-structured university-level academic guidance. Explain concepts with sufficient depth, but do not invent citations or sources.':'Use clear educational English with enough detail to answer the request properly.';
  const firstAnswerLength=(()=>{if(task==='teacher_exam')return 'Return only the requested five short theory questions. Do not add explanations, answers, marking schemes or introductory paragraphs.';if(task==='teacher')return 'Keep the first response practical and compact, usually about 180–300 words unless a complete lesson-note structure genuinely needs a little more.';if(['proposal','dissertation','defense','review'].includes(task))return 'Give a focused summary first, usually about 180–300 words. Capture the essential academic points and structure; avoid unnecessary background.';if(task==='assignment')return level==='university'?'Give a focused assignment guide, usually about 180–280 words, covering the key answer, reasoning and essential steps.':'Give a focused assignment guide, usually about 120–220 words, covering the key answer, reasoning and essential steps.';if(level==='primary'||level==='npse')return 'Keep the first explanation simple and concise, usually about 80–140 words, while covering the key idea and one useful example when needed.';if(level==='jss'||level==='bece')return 'Keep the first explanation concise, usually about 110–180 words, covering the key points and a useful example when needed.';if(level==='sss'||level==='wassce')return 'Keep the first explanation exam-focused and concise, usually about 130–220 words, covering the essential points and example or steps when useful.';if(level==='university')return 'Keep the first explanation academically clear but concise, usually about 160–260 words, covering the essential concepts.';return 'Keep the first response concise and complete, normally under about 220 words.'})();
  const depth=more?'The learner selected Read more / Explain further. Expand the previous level of explanation with useful detail, examples and steps. Avoid repeating the same sentences and remain focused.':firstAnswerLength+' Prioritise key points, summarise clearly, avoid repetition, and do not turn a simple request into a long essay.';
  const taskRules={assignment:'Help the learner understand and solve the assignment. Give the key answer, reasoning/steps and explanation. Do not pretend the learner personally wrote or researched material they did not.',review:'Review the learner draft for correctness, clarity, structure, grammar and missing ideas, then give practical improvements.',topics:'Return EXACTLY THREE research topic titles, numbered 1, 2 and 3. Do not return a fourth or fifth topic. Keep each title relevant to the stated programme, with Sierra Leone context where appropriate.',proposal:'Prepare a useful proposal framework covering background, problem, aim, objectives, research questions, methodology outline and suggested chapter structure. Do not invent references.',dissertation:'Guide the requested dissertation/thesis chapter or section using an appropriate five-chapter structure where applicable. Institution and supervisor requirements take priority.',defense:'Prepare likely defense questions, strong response points, presentation structure and common mistakes.',teacher:'Prepare the requested lesson notes from the class, subject, topic, date and duration. It must be practical and consistent with the supplied Sierra Leone curriculum context.',teacher_exam:'Generate EXACTLY FIVE theory examination questions only, numbered 1 to 5, for the selected class, subject and topic. Do not include answers, model answers, marking schemes, hints or multiple-choice options.',quiz:'Return ONLY valid JSON in this exact shape: {"questions":[...]}. The questions array must contain EXACTLY '+questionCount+' different questions. Every item must have question, options (exactly 4 strings), answer (0-3 integer), explanation, weakArea. Do not repeat excluded questions.'};
  const curriculumRule=schoolLevel||task==='teacher'||task==='quiz'?'CURRICULUM CONTROL: For Sierra Leone school-level learning and examinations, stay within the prescribed level, subject and supplied curriculum context. Do not invent an official MBSSE/WAEC topic, learning outcome, paper rule or syllabus requirement. If the supplied curriculum context is insufficient to establish an official requirement, explain the requested concept at the stated level without falsely claiming that it is officially prescribed.':'For university work, use broad academic knowledge while respecting the learner’s institution, programme and supervisor requirements.';
  const prompt=['You are Salone Class Room, an educational assistant for Sierra Leone.',role,depth,curriculumRule,'Task: '+task+'.',taskRules[task]||'Explain accurately and use examples where they improve understanding.','Level: '+level+'.','Class: '+classLevel+'.','Subject: '+subject+'.','Learner/teacher request: '+topic+'.',task==='quiz'?'Required number of questions: '+questionCount+'.':'',task==='quiz'&&excludedQuestions.length?'Do NOT repeat any of these earlier questions: '+excludedQuestions.join(' || '):'',curriculumGrounding?'Approved/local curriculum database context:\n'+curriculumGrounding:'No matching curriculum database context was retrieved for this request.',context?'Additional form information: '+context+'.':'','Do not fabricate citations. Use clean headings and paragraphs where helpful. Do not output raw markdown bold asterisks.'].filter(Boolean).join('\n');

  const callGroq=async()=>{
   if(!GROQ)throw new Error('Groq key unavailable');
   const body={model:groqModel,messages:[{role:'user',content:prompt}],temperature:task==='quiz'?0.75:0.45,max_tokens:task==='quiz'?3000:(more?2600:1200)};
   if(task==='quiz')body.response_format={type:'json_object'};
   const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+GROQ},body:JSON.stringify(body)});
   const raw=await r.text();if(!r.ok){console.error('[learning-api][groq]',r.status,raw.slice(0,800));throw new Error('Groq '+r.status)}
   const d=JSON.parse(raw),text=clean(d.choices?.[0]?.message?.content,30000);if(!text)throw new Error('Groq empty');
   return {provider:'groq',model:d.model||groqModel,text,usage:d.usage||{}};
  };
  const callDeepSeek=async()=>{
   if(!DEEPSEEK)throw new Error('DeepSeek key unavailable');
   const body={model:deepseekModel,messages:[{role:'user',content:prompt}],thinking:{type:'disabled'},temperature:task==='quiz'?0.75:0.45,max_tokens:task==='quiz'?3000:(more?2600:1200)};
   if(task==='quiz')body.response_format={type:'json_object'};
   const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+DEEPSEEK},body:JSON.stringify(body)});
   const raw=await r.text();if(!r.ok){console.error('[learning-api][deepseek]',r.status,raw.slice(0,800));throw new Error('DeepSeek '+r.status)}
   const d=JSON.parse(raw),text=clean(d.choices?.[0]?.message?.content,30000);if(!text)throw new Error('DeepSeek empty');
   return {provider:'deepseek',model:d.model||deepseekModel,text,usage:d.usage||{}};
  };
  let result;
  try{result=await callGroq()}catch(gErr){console.error('[learning-api][fallback]',gErr.message);try{result=await callDeepSeek()}catch(dErr){console.error('[learning-api][all-ai-failed]',dErr.message);return json(502,{error:'The AI service could not answer right now. Please try again.'})}}
  const text=result.text,usage=result.usage||{},inputTokens=Number(usage.prompt_tokens||usage.input_tokens||0),outputTokens=Number(usage.completion_tokens||usage.output_tokens||0);
  // Keep compatibility with the existing ai_usage_log schema. Provider is stored in source and the exact model in model.
  await sf('/rest/v1/ai_usage_log',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({profile_id:p?.id||null,device_id:deviceId,tool_key:toolKey,model:result.model,source:result.provider,input_chars:prompt.length,output_chars:text.length})}).catch(()=>{});
  if(task==='quiz'){
   let parsed;try{parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,''))}catch{return json(502,{error:'The question service returned an invalid format. Please try again.'})}
   let questions=Array.isArray(parsed)?parsed:Array.isArray(parsed?.questions)?parsed.questions:[];
   questions=questions.filter(q=>q&&typeof q.question==='string'&&Array.isArray(q.options)&&q.options.length===4&&Number.isInteger(Number(q.answer))).slice(0,questionCount);
   if(questions.length!==questionCount)return json(502,{error:'The question service did not return all 5 questions. Please try again.'});
   return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},questions});
  }
  return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},answer:text});
 }catch(e){console.error('[learning-api]',e);return json(500,{error:'The learning service could not complete the request. Please try again.'})}
};
