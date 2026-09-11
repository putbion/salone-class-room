const H={'Content-Type':'application/json','Cache-Control':'no-store'};
const json=(s,b)=>({statusCode:s,headers:H,body:JSON.stringify(b)});
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);

exports.handler=async(event)=>{
  const U=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
  const K=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OWNER=clean(process.env.ADMIN_EMAIL,200).toLowerCase();
  if(!U||!K)return json(500,{error:'Administrator backend is not configured.'});

  const sf=(path,opt={})=>fetch(U+path,{
    ...opt,
    headers:{
      apikey:K,
      Authorization:'Bearer '+K,
      'Content-Type':'application/json',
      ...(opt.headers||{})
    }
  });
  const read=async(path)=>{
    const r=await sf(path);
    if(!r.ok)throw new Error('Database request failed ('+r.status+').');
    return r.json();
  };
  const bearer=()=>{
    const a=event.headers.authorization||event.headers.Authorization||'';
    return a.startsWith('Bearer ')?a.slice(7):'';
  };
  const verifyAdmin=async(token)=>{
    if(!token)return null;
    const ur=await fetch(U+'/auth/v1/user',{
      headers:{apikey:K,Authorization:'Bearer '+token}
    });
    if(!ur.ok)return null;
    const user=await ur.json();
    const email=clean(user.email,200).toLowerCase();
    let rows=[];
    try{
      rows=await read('/rest/v1/admin_users?or=(auth_user_id.eq.'+encodeURIComponent(user.id)+',email.eq.'+encodeURIComponent(email)+')&active=eq.true&select=*&limit=1');
    }catch(_){}
    if(rows[0])return {user,admin:rows[0]};
    if(OWNER&&email===OWNER){
      await sf('/rest/v1/admin_users?on_conflict=email',{
        method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({email,auth_user_id:user.id,role:'owner',active:true,updated_at:new Date().toISOString()})
      }).catch(()=>{});
      return {user,admin:{email,auth_user_id:user.id,role:'owner',active:true}};
    }
    return null;
  };

  try{
    if(event.httpMethod==='POST'){
      let b={};
      try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request.'})}

      if(b.action==='admin_login'){
        const email=clean(b.email,200).toLowerCase(),password=String(b.password||'');
        if(!email||!password)return json(400,{error:'Enter the administrator email and password.'});
        const r=await fetch(U+'/auth/v1/token?grant_type=password',{
          method:'POST',
          headers:{apikey:K,'Content-Type':'application/json'},
          body:JSON.stringify({email,password})
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok||!d.access_token)return json(401,{error:'Administrator email or password is incorrect.'});
        const verified=await verifyAdmin(d.access_token);
        if(!verified)return json(403,{error:'This account is not authorised as an administrator.'});
        return json(200,{ok:true,access_token:d.access_token,role:verified.admin.role||'assistant',email});
      }

      const v=await verifyAdmin(bearer());
      if(!v)return json(401,{error:'Administrator session expired. Please log in again.'});
      const isOwner=(v.admin.role||'assistant')==='owner';

      if(b.action==='save_announcement'){
        await sf('/rest/v1/announcements',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({message:clean(b.message,1500),active:!!b.active})});
        return json(200,{ok:true});
      }
      if(b.action==='save_settings'){
        const p=b.prices||{};
        const row={
          id:1,
          free_access_enabled:!!b.free_access_enabled,
          free_access_start:b.free_access_start||null,
          free_access_until:b.free_access_until||null,
          default_access_days:Number(b.default_access_days)||30,
          orange_money_number:clean(b.orange_money_number,80),
          ai_enabled:b.ai_enabled!==false,
          ai_model:clean(b.ai_model,120)||'openai/gpt-oss-20b',
          primary_free:!!b.primary_free,jss_free:!!b.jss_free,sss_free:!!b.sss_free,
          teacher_free:!!b.teacher_free,university_free:!!b.university_free,
          price_primary:Number(p.primary)||0,price_jss:Number(p.jss)||0,price_sss:Number(p.sss)||0,
          price_teacher:Number(p.teacher)||0,price_university:Number(p.university)||0
        };
        const r=await sf('/rest/v1/platform_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
        if(!r.ok)return json(500,{error:'Unable to save platform settings.'});
        return json(200,{ok:true});
      }
      if(b.action==='payment_status'){
        const r=await sf('/rest/v1/payment_requests?id=eq.'+encodeURIComponent(clean(b.id,80)),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:clean(b.status,30)})});
        if(!r.ok)return json(500,{error:'Unable to update payment status.'});
        return json(200,{ok:true});
      }
      if(b.action==='profile_access'){
        const row={
          account_status:clean(b.account_status,30)||'active',
          free_access_start:b.free_access_start||null,free_access_end:b.free_access_end||null,
          paid_access_start:b.paid_access_start||null,paid_access_end:b.paid_access_end||null,
          paid_active:!!b.paid_active,admin_note:clean(b.admin_note,1000)
        };
        const r=await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(clean(b.id,80)),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
        if(!r.ok)return json(500,{error:'Unable to update this user.'});
        return json(200,{ok:true});
      }
      if(b.action==='profile_remove'){
        const id=clean(b.id,80);
        const rows=await read('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(id)+'&select=id,auth_user_id&limit=1').catch(()=>[]);
        await sf('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
        if(rows[0]?.auth_user_id)await fetch(U+'/auth/v1/admin/users/'+rows[0].auth_user_id,{method:'DELETE',headers:{apikey:K,Authorization:'Bearer '+K}}).catch(()=>{});
        return json(200,{ok:true});
      }
      if(b.action==='profile_reset_password'){
        const id=clean(b.id,80),password=String(b.password||'');
        if(password.length<6)return json(400,{error:'Temporary password must contain at least 6 characters.'});
        const rows=await read('/rest/v1/user_profiles?id=eq.'+encodeURIComponent(id)+'&select=id,auth_user_id&limit=1');
        if(!rows[0]?.auth_user_id)return json(400,{error:'This profile is not linked to a Supabase Auth account.'});
        const r=await fetch(U+'/auth/v1/admin/users/'+rows[0].auth_user_id,{method:'PUT',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'},body:JSON.stringify({password})});
        if(!r.ok)return json(500,{error:'Unable to reset the password.'});
        await sf('/rest/v1/user_sessions?profile_id=eq.'+encodeURIComponent(id),{method:'DELETE'}).catch(()=>{});
        return json(200,{ok:true});
      }
      if(b.action==='password_reset_resolve'){
        await sf('/rest/v1/password_reset_requests?id=eq.'+encodeURIComponent(clean(b.id,80)),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'resolved',resolved_at:new Date().toISOString(),resolved_by:v.user.email})});
        return json(200,{ok:true});
      }
      if(b.action==='admin_add'){
        if(!isOwner)return json(403,{error:'Only the main administrator can add assistant administrators.'});
        const email=clean(b.email,200).toLowerCase(),password=String(b.password||'');
        if(!email||password.length<8)return json(400,{error:'Enter a valid email and a temporary password of at least 8 characters.'});
        const r=await fetch(U+'/auth/v1/admin/users',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok&&!String(d.msg||d.message||'').toLowerCase().includes('already'))return json(500,{error:'Unable to create the assistant administrator.'});
        let uid=d.id||d.user?.id||null;
        if(!uid){
          const lr=await fetch(U+'/auth/v1/admin/users?page=1&per_page=1000',{headers:{apikey:K,Authorization:'Bearer '+K}});
          const ld=await lr.json().catch(()=>({users:[]}));
          uid=(ld.users||[]).find(x=>(x.email||'').toLowerCase()===email)?.id||null;
        }
        const ir=await sf('/rest/v1/admin_users?on_conflict=email',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({email,auth_user_id:uid,role:'assistant',active:true,added_by:v.user.email,updated_at:new Date().toISOString()})});
        if(!ir.ok)return json(500,{error:'Unable to register the assistant administrator.'});
        return json(200,{ok:true});
      }
      if(b.action==='admin_toggle'){
        if(!isOwner)return json(403,{error:'Only the main administrator can enable or disable assistant administrators.'});
        const email=clean(b.email,200).toLowerCase();
        if(OWNER&&email===OWNER)return json(400,{error:'The main administrator cannot be disabled here.'});
        await sf('/rest/v1/admin_users?email=eq.'+encodeURIComponent(email),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({active:!!b.active,updated_at:new Date().toISOString()})});
        return json(200,{ok:true});
      }
      if(b.action==='feature_save'){
        const row={
          feature_key:clean(b.feature_key,100),feature_name:clean(b.feature_name,160),
          section:clean(b.section,80)||'general',description:clean(b.description,600),
          target_category:clean(b.target_category,40)||'all',enabled:b.enabled!==false,
          paid:!!b.paid,price:Number(b.price)||0,display_order:Number(b.display_order)||100,
          updated_at:new Date().toISOString()
        };
        if(!row.feature_key||!row.feature_name)return json(400,{error:'Feature key and feature name are required.'});
        let r;
        if(b.id)r=await sf('/rest/v1/platform_features?id=eq.'+encodeURIComponent(clean(b.id,80)),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
        else r=await sf('/rest/v1/platform_features?on_conflict=feature_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
        if(!r.ok)return json(500,{error:'Unable to save the feature.'});
        return json(200,{ok:true});
      }
      if(b.action==='feature_toggle'){
        await sf('/rest/v1/platform_features?id=eq.'+encodeURIComponent(clean(b.id,80)),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({enabled:!!b.enabled,updated_at:new Date().toISOString()})});
        return json(200,{ok:true});
      }
      if(b.action==='save_orange_api_settings'){
        const row={id:1,orange_payment_mode:clean(b.payment_mode,30)||'manual',orange_api_base_url:clean(b.api_base_url,500),orange_merchant_id:clean(b.merchant_id,200),orange_webhook_url:clean(b.webhook_url,500),orange_api_enabled:!!b.api_enabled};
        const r=await sf('/rest/v1/platform_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
        if(!r.ok)return json(500,{error:'Unable to save Orange Money API settings.'});
        return json(200,{ok:true});
      }
      if(b.action==='test_orange_api'){
        const hasSecrets=!!(process.env.ORANGE_MONEY_CLIENT_ID&&process.env.ORANGE_MONEY_CLIENT_SECRET);
        return json(200,{ok:true,message:hasSecrets?'Orange Money secret credentials are present in Netlify. A live merchant test should be done after the official API details are confirmed.':'Orange Money API secrets are not configured yet. Manual payment mode can continue to be used.'});
      }
      return json(400,{error:'Unknown administrator action.'});
    }

    if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'});
    const v=await verifyAdmin(bearer());
    if(!v)return json(401,{error:'Administrator session expired. Please log in again.'});

    const safeRead=async(path,def=[])=>{try{return await read(path)}catch{return def}};
    const [
      profiles,payments,settingsRows,annRows,messages,events,admins,resets,features
    ]=await Promise.all([
      safeRead('/rest/v1/user_profiles?select=*&order=created_at.desc&limit=1000'),
      safeRead('/rest/v1/payment_requests?select=*&order=created_at.desc&limit=500'),
      safeRead('/rest/v1/platform_settings?id=eq.1&select=*'),
      safeRead('/rest/v1/announcements?select=*&order=created_at.desc&limit=20'),
      safeRead('/rest/v1/support_messages?select=*&order=created_at.desc&limit=500'),
      safeRead('/rest/v1/app_events?select=*&order=created_at.desc&limit=1000'),
      safeRead('/rest/v1/admin_users?select=*&order=created_at.asc'),
      safeRead('/rest/v1/password_reset_requests?select=*,user_profiles(full_name,contact,email,phone)&order=created_at.desc&limit=200'),
      safeRead('/rest/v1/platform_features?select=*&order=display_order.asc,created_at.asc')
    ]);

    let authUsers=[];
    try{
      const r=await fetch(U+'/auth/v1/admin/users?page=1&per_page=1000',{headers:{apikey:K,Authorization:'Bearer '+K}});
      const d=await r.json();
      authUsers=d.users||[];
    }catch(_){}

    const now=Date.now(),d30=now-30*86400000,d1=now-86400000;
    const catCount=c=>profiles.filter(p=>p.category===c).length;
    const ec=(needles)=>events.filter(e=>needles.some(n=>String(e.event_type||e.detail||'').toLowerCase().includes(n))).length;
    const settings=settingsRows[0]||{};
    const announcement=annRows.find(a=>a.active)||annRows[0]||null;
    const summary={
      registered_users:profiles.length,
      new_users_30d:profiles.filter(p=>new Date(p.created_at||0).getTime()>=d30).length,
      online_now:profiles.filter(p=>p.last_seen_at&&now-new Date(p.last_seen_at).getTime()<=300000).length,
      active_today:profiles.filter(p=>p.last_seen_at&&new Date(p.last_seen_at).getTime()>=d1).length,
      events_30d:events.filter(e=>new Date(e.created_at||0).getTime()>=d30).length,
      new_messages:messages.filter(m=>(m.status||'new')==='new').length
    };
    const categories={primary:catCount('primary'),jss:catCount('jss'),sss:catCount('sss'),teachers:catCount('teacher'),university:catCount('university')};
    const metrics={
      npseCount:ec(['npse']),beceCount:ec(['bece']),wassceCount:ec(['wassce']),
      reviewCount:ec(['review']),teacherEvents:ec(['teacher']),schemeEvents:ec(['scheme']),
      lessonEvents:ec(['lesson']),otherTeacherEvents:ec(['teacher_exam','teacher-exam']),
      universityEvents:events.filter(e=>String(e.section||'').toLowerCase()==='university').length,
      topicEvents:ec(['topic']),proposalEvents:ec(['proposal']),dissertationEvents:ec(['dissertation','defense','defence'])
    };
    return json(200,{
      summary,categories,metrics,
      users:authUsers,events,messages,profiles,payments,
      platform_settings:settings,announcement,admins,reset_requests:resets,features,
      system:{supabase:true,messages_table:true,events_table:true},
      admin:{email:v.user.email,role:v.admin.role||'assistant'}
    });
  }catch(e){
    console.error('[admin-api]',e);
    return json(500,{error:'The administrator service could not complete this request.'});
  }
};