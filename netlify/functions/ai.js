const {json}=require('./_security');
exports.handler=async()=>json(410,{error:'This legacy AI endpoint has been disabled. Use the protected learning service.'});
