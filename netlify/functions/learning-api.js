exports.handler = async (event) => {
  const H = {'Content-Type':'application/json','Cache-Control':'no-store'};
  const U = process.env.SUPABASE_URL;
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!U || !K) return {statusCode:500,headers:H,body:JSON.stringify({error:'Learning database is not configured.'})};
  if (event.httpMethod !== 'POST') return {statusCode:405,headers:H,body:JSON.stringify({error:'Method not allowed.'})};

  let b={};
  try { b=JSON.parse(event.body||'{}'); } catch { return {statusCode:400,headers:H,body:JSON.stringify({error:'Invalid request.'})}; }
  const clean=(v,n=180)=>String(v||'').trim().slice(0,n);
  const level=clean(b.level,30).toLowerCase();
  const classLevel=clean(b.class_level,60);
  const subject=clean(b.subject,160);
  const topic=clean(b.topic,180);
  if (!['primary','jss','sss','university'].includes(level) || !subject || !topic) {
    return {statusCode:400,headers:H,body:JSON.stringify({error:'Choose a level and subject, then type a topic.'})};
  }

  const sf=async(path)=>{
    const r=await fetch(U+path,{headers:{apikey:K,Authorization:'Bearer '+K}});
    if(!r.ok) throw new Error('Database lookup failed.');
    return r.json();
  };
  const q=encodeURIComponent(topic.replace(/[,*()]/g,' ').trim());
  const subj=encodeURIComponent(subject);
  const lev=encodeURIComponent(level);
  const cls=encodeURIComponent(classLevel);

  try {
    // 1) Prefer reusable learning content because it contains student-ready explanations.
    let content=[];
    try {
      let path='/rest/v1/learning_content?education_level=eq.'+lev+'&subject=eq.'+subj+'&active=eq.true&or=(topic.ilike.*'+q+'*,title.ilike.*'+q+'*)&select=title,topic,short_answer,detailed_answer,content,example_question,example_answer,common_mistakes,memory_tip,sierra_leone_example,verified,reuse_allowed&order=verified.desc&limit=3';
      content=await sf(path);
    } catch(e) { content=[]; }

    // 2) Find matching curriculum records for alignment/context.
    let curriculum=[];
    try {
      let path='/rest/v1/curriculum_topics?education_level=eq.'+lev+'&subject=eq.'+subj+'&active=eq.true';
      if(classLevel) path+='&class_level=eq.'+cls;
      path+='&or=(topic.ilike.*'+q+'*,unit_title.ilike.*'+q+'*)&select=unit_title,topic,learning_outcomes,sierra_leone_context,verified,content_version&order=verified.desc&limit=5';
      curriculum=await sf(path);
    } catch(e) { curriculum=[]; }

    if(!content.length && !curriculum.length){
      return {statusCode:404,headers:H,body:JSON.stringify({found:false,source:'database',message:'I could not find a close match for this topic in the Salone Class Room knowledge database yet. Please check the spelling or try a broader topic.'})};
    }

    const c=content[0]||{};
    const t=curriculum[0]||{};
    const parts=[];
    const title=c.title||t.topic||t.unit_title||topic;
    parts.push(title);
    parts.push('');
    if(c.short_answer) parts.push(c.short_answer);
    else if(c.detailed_answer) parts.push(c.detailed_answer);
    else if(c.content) parts.push(c.content);
    else if(t.learning_outcomes) parts.push('What you should understand: '+t.learning_outcomes);
    if(c.detailed_answer && c.detailed_answer!==c.short_answer) { parts.push(''); parts.push(c.detailed_answer); }
    if(c.sierra_leone_example){ parts.push(''); parts.push('Sierra Leone example: '+c.sierra_leone_example); }
    else if(t.sierra_leone_context){ parts.push(''); parts.push('Sierra Leone context: '+t.sierra_leone_context); }
    if(c.example_question){ parts.push(''); parts.push('Try this: '+c.example_question); if(c.example_answer) parts.push('Answer: '+c.example_answer); }
    if(c.memory_tip){ parts.push(''); parts.push('Memory tip: '+c.memory_tip); }
    if(c.common_mistakes){ parts.push(''); parts.push('Common mistake to avoid: '+c.common_mistakes); }

    return {statusCode:200,headers:H,body:JSON.stringify({found:true,source:content.length?'learning_content':'curriculum_topics',verified:!!(c.verified||t.verified),answer:parts.join('\n')})};
  } catch(e) {
    return {statusCode:500,headers:H,body:JSON.stringify({error:'The learning database could not be reached right now.'})};
  }
};
