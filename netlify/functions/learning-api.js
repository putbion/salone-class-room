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
 const generationId=clean(b.generation_id,120)||crypto.randomUUID(),previousResponse=clean(b.previous_response,6000);
 const examType=task==='teacher_exam_objective'?'objective':task==='teacher_exam_theory'?'theory':clean(b.exam_type,20).toLowerCase();
 const questionCount=task==='theory_quiz'?3:(task==='teacher_exam_theory'?5:(task==='teacher_exam'||task==='teacher_exam_objective'?10:Math.max(1,Math.min(10,Number(b.question_count)||5))));
 const excludedQuestions=Array.isArray(b.excluded_questions)?b.excluded_questions.map(x=>clean(x,500)).filter(Boolean).slice(-50):[];
 if(!topic)return json(400,{error:'Please choose or type a topic, question or instruction.'});
 const allowedTasks=new Set(['tutor','assignment','review','topics','proposal','dissertation','defense','teacher','teacher_prep','teacher_exam','teacher_exam_objective','teacher_exam_theory','teacher_marking_scheme','quiz','lecturer','theory_quiz','mark_theory','teacher_marking_guide','explain_wrong_answer']);if(!allowedTasks.has(task))return json(400,{error:'Unsupported learning task.'});
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
  const firstAnswerLength=(()=>{if(task==='teacher_exam'||task==='teacher_exam_objective'||task==='teacher_exam_theory')return examType==='objective'?'Return only the requested ten objective multiple-choice questions. Each question must have exactly four options labelled A, B, C and D. Do not mix theory questions with objective questions. Do not include answers, marking schemes or introductory paragraphs.':'Return only the requested five short theory questions. Do not mix objective questions with theory questions. Do not add explanations, answers, marking schemes or introductory paragraphs.';if(task==='teacher_prep')return 'Provide a detailed, practical, and well-structured teaching preparation guide covering sections A through I.';if(task==='teacher_marking_scheme')return 'Provide a clear, detailed marking scheme with mark allocations for each question and key points.';if(task==='teacher_marking_guide')return 'Provide a complete model answer and a detailed point-by-point marking guide with clear mark allocations.';if(task==='explain_wrong_answer')return 'Provide a clear, encouraging explanation of why the chosen answer is incorrect and why the correct answer is right.';if(task==='teacher')return 'Keep the first response practical and compact, usually about 180–300 words unless a complete lesson-note structure genuinely needs a little more.';if(['proposal','dissertation','defense','review'].includes(task))return 'Give a focused summary first, usually about 180–300 words. Capture the essential academic points and structure; avoid unnecessary background.';if(task==='assignment')return level==='university'?'Give a focused assignment guide, usually about 180–280 words, covering the key answer, reasoning and essential steps.':'Give a focused assignment guide, usually about 120–220 words, covering the key answer, reasoning and essential steps.';if(level==='primary'||level==='npse')return 'Keep the first explanation simple and concise, usually about 80–140 words, while covering the key idea and one useful example when needed.';if(level==='jss'||level==='bece')return 'Keep the first explanation concise, usually about 110–180 words, covering the key points and a useful example when needed.';if(level==='sss'||level==='wassce')return 'Keep the first explanation exam-focused and concise, usually about 130–220 words, covering the essential points and example or steps when useful.';if(level==='university')return 'Keep the first explanation academically clear but concise, usually about 160–260 words, covering the essential concepts.';return 'Keep the first response concise and complete, normally under about 220 words.'})();
  const depth=more?'The learner selected Read more / Explain further. Expand the previous level of explanation with useful detail, examples and steps. Avoid repeating the same sentences and remain focused.':firstAnswerLength+' Prioritise key points, summarise clearly, avoid repetition, and do not turn a simple request into a long essay.';
  const taskRules={assignment:'Help the learner understand and solve the assignment. Give the key answer, reasoning/steps and explanation. Do not pretend the learner personally wrote or researched material they did not.',review:'Review the learner draft for correctness, clarity, structure, grammar and missing ideas, then give practical improvements.',topics:'Return EXACTLY THREE research topic titles, numbered 1, 2 and 3. Do not return a fourth or fifth topic. Keep each title relevant to the stated programme, with Sierra Leone context where appropriate.',proposal:'Prepare a useful proposal framework covering background, problem, aim, objectives, research questions, methodology outline and suggested chapter structure. Do not invent references.',dissertation:'Guide the requested dissertation/thesis chapter or section using an appropriate five-chapter structure where applicable. Institution and supervisor requirements take priority.',defense:'Prepare likely defense questions, strong response points, presentation structure and common mistakes.',teacher:'Prepare the requested lesson notes from the class, subject, topic, date and duration. It must be practical and consistent with the supplied Sierra Leone curriculum context.',teacher_prep:'Provide a comprehensive teaching preparation guide to help the teacher personally understand and prepare for this topic before entering the classroom. This is NOT a formal lesson note. Use this exact clear structure with headings:\nA. Topic Overview\nB. What You Should Understand Before Teaching\nC. Key Points to Teach\nD. How to Explain It Simply\nE. Practical / Local Examples (use familiar Sierra Leone contexts where appropriate)\nF. Possible Difficult Areas\nG. Questions Learners May Ask (with concise suggested answers)\nH. Classroom Activity / Demonstration (simple, practical, no expensive equipment needed)\nI. Check Your Readiness (3 short self-check questions with answers for the teacher to verify their subject readiness before teaching).',teacher_exam:examType==='objective'?'Generate EXACTLY TEN NEW objective multiple-choice examination questions, numbered 1 to 10, for the selected class, subject and topic. Each question MUST have exactly four options labelled A, B, C and D. Do not mix theory questions with objective questions. Do not include answers, model answers, marking schemes or hints. Vary the questions on every new request.':'Generate EXACTLY FIVE NEW theory examination questions only, numbered 1 to 5, for the selected class, subject and topic. Do not mix objective questions or multiple-choice options with theory questions. Do not include answers, model answers, marking schemes or hints. Vary the questions on every new request.',teacher_exam_objective:'Return ONLY valid JSON in this exact shape: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":0}]}. The questions array MUST contain EXACTLY 10 objective multiple-choice questions. Every item MUST have one question, exactly four answer choices labelled A, B, C and D, and the correct 0-based option index (0 for A, 1 for B, 2 for C, 3 for D). Do not mix theory questions with objective questions. Do not include answers, marking schemes, headings, introductions or any text outside the JSON. Vary the questions on every request.',teacher_exam_theory:'Generate EXACTLY FIVE NEW THEORY examination questions only, numbered 1 to 5, for the selected class, subject and topic. These must be open-ended theory questions. Do not mix objective questions or multiple-choice options. Do not include answers, model answers or marking schemes. Vary the questions on every request.',teacher_marking_scheme:'Provide a professional examination marking scheme corresponding strictly to the supplied theory questions. For each question include: Expected answer / key points, marks allocated to important points, total marks for each question, and overall total marks for the paper.',teacher_marking_guide:'Provide a complete, authoritative model answer and a detailed point-by-point marking guide for the teacher\'s theory question, aligned with Sierra Leone national examination standards (NPSE, BECE, or WASSCE as requested). Include mark allocations, acceptable key points, alternative answers, and common student mistakes.',theory_quiz:'Return ONLY valid JSON in this exact shape: {"questions":[{"id":1,"question":"...","model_answer":"...","key_points":["..."]}]}. The questions array must contain EXACTLY 3 theory examination questions strictly appropriate for '+classLevel+' '+subject+' on '+topic+'. Each question must include a clear, complete model_answer and key_points. Do not introduce unrelated topics.',mark_theory:'You are marking a student\'s theory examination answers. Return ONLY valid JSON in this exact shape: {"feedback":[{"question_number":1,"correct_points":"...","needs_improvement":"...","score_comment":"...","model_answer":"..."}],"overall_summary":"..."}. For each question, explain what the student got right (correct_points), what needs improvement or was missing (needs_improvement), give a brief encouraging score comment, and provide the complete model answer (model_answer).',explain_wrong_answer:'Explain clearly and concisely why the student\'s selected option was incorrect, why the correct answer is right, and the core concept to remember. Keep the tone helpful, encouraging, and easy to understand for the student\'s level.',quiz:'Return ONLY valid JSON in this exact shape: {"questions":[...]}. The questions array must contain EXACTLY '+questionCount+' different questions strictly appropriate for '+classLevel+' '+subject+' on '+topic+'. Every item must have question, options (exactly 4 strings), answer (0-3 integer), explanation, weakArea. Do not repeat excluded questions. Do not introduce unrelated topics or generic keywords.'};
  const curriculumRule=schoolLevel||task==='teacher'||task==='quiz'?'CURRICULUM CONTROL: For Sierra Leone school-level learning and examinations, stay within the prescribed level, subject and supplied curriculum context. Do not invent an official MBSSE/WAEC topic, learning outcome, paper rule or syllabus requirement. If the supplied curriculum context is insufficient to establish an official requirement, explain the requested concept at the stated level without falsely claiming that it is officially prescribed.':'For university work, use broad academic knowledge while respecting the learner’s institution, programme and supervisor requirements.';
  const freshness=['FRESH GENERATION ID: '+generationId+'.','Create a genuinely new response for this request. Vary the examples, wording, structure, reasoning route and selected details while remaining accurate and appropriate to the stated level. Never merely reshuffle or reproduce an earlier response.',previousResponse?'The immediately previous response is included below. Do not repeat its sentences, examples, question stems, topic suggestions or overall organisation. Produce a substantively different response.\nPREVIOUS RESPONSE:\n'+previousResponse:'This is the first recorded response for this request.'];
  const prompt=['You are Salone Class Room, an educational assistant for Sierra Leone.',role,depth,curriculumRule,...freshness,'Task: '+task+'.',taskRules[task]||'Explain accurately and use examples where they improve understanding.','Level: '+level+'.','Class: '+classLevel+'.','Subject: '+subject+'.','Learner/teacher request: '+topic+'.',task==='quiz'?'Required number of questions: '+questionCount+'.':'',task==='quiz'&&excludedQuestions.length?'Do NOT repeat any of these earlier questions: '+excludedQuestions.join(' || '):'',curriculumGrounding?'Approved/local curriculum database context:\n'+curriculumGrounding:'No matching curriculum database context was retrieved for this request.',context?'Additional form information: '+context+'.':'','Do not fabricate citations. Use clean headings and paragraphs where helpful. Do not output raw markdown bold asterisks.'].filter(Boolean).join('\n');

  const normalizedWords=value=>clean(value,30000).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  const tooSimilar=(a,b)=>{if(!a||!b)return false;const x=normalizedWords(a),y=normalizedWords(b);if(x.join(' ')===y.join(' '))return true;const grams=words=>new Set(words.slice(1).map((word,i)=>words[i]+' '+word)),gx=grams(x),gy=grams(y);if(!gx.size||!gy.size)return false;let shared=0;gx.forEach(g=>{if(gy.has(g))shared++});return shared/Math.min(gx.size,gy.size)>.82};

  const callGroq=async(requestPrompt=prompt)=>{
   if(!GROQ)throw new Error('Groq key unavailable');
   const body={model:groqModel,messages:[{role:'user',content:requestPrompt}],temperature:['quiz','theory_quiz'].includes(task)?0.9:0.78,max_tokens:['quiz','theory_quiz','teacher_prep','teacher_marking_scheme','teacher_exam_objective'].includes(task)?3000:(more?2600:1200)};
   if(['quiz','teacher_exam_objective','theory_quiz','mark_theory'].includes(task))body.response_format={type:'json_object'};
   const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+GROQ},body:JSON.stringify(body)});
   const raw=await r.text();if(!r.ok){console.error('[learning-api][groq]',r.status,raw.slice(0,800));throw new Error('Groq '+r.status)}
   const d=JSON.parse(raw),text=clean(d.choices?.[0]?.message?.content,30000);if(!text)throw new Error('Groq empty');
   return {provider:'groq',model:d.model||groqModel,text,usage:d.usage||{}};
  };
  const callDeepSeek=async(requestPrompt=prompt)=>{
   if(!DEEPSEEK)throw new Error('DeepSeek key unavailable');
   const body={model:deepseekModel,messages:[{role:'user',content:requestPrompt}],thinking:{type:'disabled'},temperature:['quiz','theory_quiz'].includes(task)?0.9:0.78,max_tokens:['quiz','theory_quiz','teacher_prep','teacher_marking_scheme','teacher_exam_objective'].includes(task)?3000:(more?2600:1200)};
   if(['quiz','teacher_exam_objective','theory_quiz','mark_theory'].includes(task))body.response_format={type:'json_object'};
   const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+DEEPSEEK},body:JSON.stringify(body)});
   const raw=await r.text();if(!r.ok){console.error('[learning-api][deepseek]',r.status,raw.slice(0,800));throw new Error('DeepSeek '+r.status)}
   const d=JSON.parse(raw),text=clean(d.choices?.[0]?.message?.content,30000);if(!text)throw new Error('DeepSeek empty');
   return {provider:'deepseek',model:d.model||deepseekModel,text,usage:d.usage||{}};
  };
  let result;
  try{result=await callDeepSeek()}catch(dErr){console.error('[learning-api][fallback-to-groq]',dErr.message);try{result=await callGroq()}catch(gErr){console.error('[learning-api][all-ai-failed]',gErr.message);return json(502,{error:"We couldn't generate the questions. Please try again."})}}
  if(previousResponse&&tooSimilar(result.text,previousResponse)){
   const retryPrompt=prompt+'\nQUALITY CHECK: The draft was too similar to the previous response. Start over with a different approach, different examples and different organisation. Do not paraphrase the earlier answer.';
   try{result=result.provider==='deepseek'?(GROQ?await callGroq(retryPrompt):await callDeepSeek(retryPrompt)):await callDeepSeek(retryPrompt)}catch(retryErr){console.error('[learning-api][freshness-retry]',retryErr.message)}
  }
  const text=result.text,usage=result.usage||{},inputTokens=Number(usage.prompt_tokens||usage.input_tokens||0),outputTokens=Number(usage.completion_tokens||usage.output_tokens||0);
  // Always record every successful AI answer in app_events (known existing table).
  // This gives the admin dashboard a reliable per-user usage ledger.
  await sf('/rest/v1/app_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({event_type:'ai_usage',section:String(p?.id||deviceId||'anonymous').slice(0,80),detail:JSON.stringify({tool_key:toolKey,source:result.provider,model:result.model}).slice(0,300)})}).catch(()=>{});
  // Also populate the dedicated usage table where its deployed schema accepts these fields.
  try{await sf('/rest/v1/ai_usage_log',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({profile_id:p?.id||null,device_id:deviceId,tool_key:toolKey,model:result.model,source:result.provider,input_chars:prompt.length,output_chars:text.length})})}catch{}
  if(task==='teacher_exam_objective'){
   let parsed;try{parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,''))}catch{return json(502,{error:"We couldn't generate the questions. Please try again."})}
   let questions=Array.isArray(parsed)?parsed:Array.isArray(parsed?.questions)?parsed.questions:[];
   questions=questions.filter(q=>q&&typeof q.question==='string'&&Array.isArray(q.options)&&q.options.length===4).slice(0,10);
   if(questions.length!==10)return json(502,{error:"We couldn't generate the questions. Please try again."});
   const answer=questions.map((q,i)=>`${i+1}. ${clean(q.question,1000)}\nA. ${clean(q.options[0],500)}\nB. ${clean(q.options[1],500)}\nC. ${clean(q.options[2],500)}\nD. ${clean(q.options[3],500)}`).join('\n\n');
   const letters=['A','B','C','D'];
   const answer_key=questions.map((q,i)=>{
    const a=q.answer;
    let letter='A';
    if(typeof a==='string'&&['A','B','C','D'].includes(a.toUpperCase())) letter=a.toUpperCase();
    else if(Number.isInteger(Number(a))&&a>=0&&a<=3) letter=letters[Number(a)];
    return `${i+1}. ${letter}`;
   }).join('\n');
   return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},answer,answer_key,questions});
  }
  if(task==='theory_quiz'){
   let parsed;try{parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,''))}catch{return json(502,{error:"We couldn't generate the questions. Please try again."})}
   let questions=Array.isArray(parsed)?parsed:Array.isArray(parsed?.questions)?parsed.questions:[];
   questions=questions.filter(q=>q&&typeof q.question==='string').slice(0,3);
   if(questions.length!==3)return json(502,{error:"We couldn't generate the questions. Please try again."});
   return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},questions});
  }
  if(task==='mark_theory'){
   let parsed=null;try{parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,''))}catch{}
   if(parsed&&Array.isArray(parsed.feedback)&&parsed.feedback.length){
    return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},feedback:parsed.feedback,overall_summary:clean(parsed.overall_summary,1000)});
   }
   return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},answer:text});
  }
  if(task==='quiz'){
   let parsed;try{parsed=JSON.parse(text.replace(/^```json\s*|\s*```$/g,''))}catch{return json(502,{error:"We couldn't generate the questions. Please try again."})}
   let questions=Array.isArray(parsed)?parsed:Array.isArray(parsed?.questions)?parsed.questions:[];
   questions=questions.filter(q=>q&&typeof q.question==='string'&&Array.isArray(q.options)&&q.options.length===4&&Number.isInteger(Number(q.answer))).slice(0,questionCount);
   if(questions.length!==questionCount)return json(502,{error:"We couldn't generate the questions. Please try again."});
   return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},questions});
  }
  const diagramEligible=['tutor','lecturer'].includes(task)&&['primary','jss','sss','university'].includes(level)&&/\b(map|diagram|draw|drawing|illustrat(?:e|ion)|labelled|labeled|graph|chart|visual|anatomy|life cycle|water cycle|food chain|circuit)\b/i.test(topic+' '+context);
  let diagram_token=null;
  if(diagramEligible){const ticket=Buffer.from(JSON.stringify({exp:Date.now()+5*60*1000,topic_hash:crypto.createHash('sha256').update(topic).digest('hex')})).toString('base64url');diagram_token=ticket+'.'+crypto.createHmac('sha256',K).update(ticket).digest('base64url')}
  return json(200,{source:'ai',provider:result.provider,model:result.model,admin_access:isAdmin,usage:{input_tokens:inputTokens,output_tokens:outputTokens},answer:text,diagram_token});
 }catch(e){console.error('[learning-api]',e);return json(500,{error:'The learning service could not complete the request. Please try again.'})}
};
