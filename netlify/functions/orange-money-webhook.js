const {json,enforceRate,bodyTooLarge}=require('./_security');
exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  if(bodyTooLarge(event,32768))return json(413,{error:'Request is too large.'});
  const rl=enforceRate(event,{name:'orange-webhook',limit:60,windowMs:60000});if(rl)return rl;
  // Payment activation is intentionally disabled until Orange signature verification is implemented.
  return json(501,{received:false,error:'Orange Money webhook verification is not configured. No payment state was changed.'});
};
