export const paidLedger=env=>env.RECEIPT_CREDIT_LEDGER.get(env.RECEIPT_CREDIT_LEDGER.idFromName(`receipt-credits:${env.RECEIPT_CREDITS_ENVIRONMENT}`));
export const paidConfigured=env=>env.RECEIPT_CREDITS_ENABLED==='true'&&env.RECEIPT_PAID_ANALYSIS_ENABLED==='true'&&Boolean(env.RECEIPT_CREDIT_LEDGER)&&['SANDBOX','PRODUCTION'].includes(env.RECEIPT_CREDITS_ENVIRONMENT)&&/^[0-9a-f]{64}$/i.test(env.RECEIPT_RESULT_KEY||'');
export async function ledgerCall(env,path,data) {
 const r=await paidLedger(env).fetch('https://ledger'+path,{method:'POST',body:JSON.stringify(data)});
 const body=await r.json();if(!r.ok)throw Object.assign(new Error(body.error),{status:r.status});return body;
}
export async function sealResult(env,userId,requestId,result) {
 const iv=crypto.getRandomValues(new Uint8Array(12));const key=await resultKey(env);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`${userId}:${requestId}`)},key,new TextEncoder().encode(JSON.stringify(result))));
 return JSON.stringify({iv:Array.from(iv),data:Array.from(ciphertext)});
}
export async function openResult(env,userId,requestId,sealed) {
 const {iv,data}=JSON.parse(sealed);
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv),additionalData:new TextEncoder().encode(`${userId}:${requestId}`)},await resultKey(env),new Uint8Array(data))));
}
function resultKey(env) {return crypto.subtle.importKey('raw',Uint8Array.from(env.RECEIPT_RESULT_KEY.match(/../g),h=>parseInt(h,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function hashCode(code) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function recoveryRoute(request,env,helpers) {
 const path=new URL(request.url).pathname;
 if(!['/receipt/recovery/create','/receipt/recovery/confirm','/receipt/recovery/restore'].includes(path))return null;
 if(!paidConfigured(env))return reply({error:'SALES_UNAVAILABLE'},503);
 if(request.method!=='POST')return reply({error:'METHOD'},405);
 if(path==='/receipt/recovery/restore') {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  if(!await helpers.limit(ip))return reply({error:'RATE_LIMIT'},429);
  let body='';const reader=request.body?.getReader();if(!reader)return reply({error:'RECOVERY'},400);
  const decoder=new TextDecoder();let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();return reply({error:'RECOVERY'},400);}body+=decoder.decode(value,{stream:true});}
  body+=decoder.decode();
  let code;try{code=JSON.parse(body).code;}catch{return reply({error:'RECOVERY'},400);}
  if(typeof code!=='string'||!/^[0-9a-f]{64}$/.test(code.trim()))return reply({error:'RECOVERY'},400);
  try {
   const recovered=await ledgerCall(env,'/recover',{codeHash:await hashCode(code.trim())});
   return reply(await helpers.session(recovered.userId));
  }catch{return reply({error:'RECOVERY'},400);}
 }
 const identity=await helpers.authenticate(request);if(!identity)return reply({error:'SESSION_REQUIRED'},401);
 if(path==='/receipt/recovery/confirm')return reply(await ledgerCall(env,'/recovery/confirm',{userId:identity.sub}));
 const code=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 await ledgerCall(env,'/recovery/create',{userId:identity.sub,codeHash:await hashCode(code)});
 return reply({code}); // Raw recovery secret is returned once; only its hash is stored.
}
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
